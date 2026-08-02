const cors = require('cors');
const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const AGENT_PORT = 32145;
const AGENT_HOST = '127.0.0.1';
const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const STARTUP_APPROVED_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const STARTUP_VALUE = 'BillWisePrintAgent';
const LEGACY_STARTUP_VALUES = ['BillWiseStartup', 'BillWiseStartupAgent'];
const AGENT_VERSION = '1.1.0';
const STARTUP_SCRIPT_NAME = 'BillWisePrintAgent-startup.vbs';

function getInstallContext() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const windowsDir = process.env.WINDIR || 'C:\\Windows';
  const wscriptPath = path.join(windowsDir, 'System32', 'wscript.exe');
  const installDir = path.join(localAppData, 'BillWisePrintAgent');
  const targetExe = path.join(installDir, 'BillWisePrintAgent.exe');
  const startupScript = path.join(installDir, STARTUP_SCRIPT_NAME);
  return {
    installDir,
    targetExe,
    startupScript,
    startupCommand: `"${wscriptPath}" //B //NoLogo "${startupScript}"`
  };
}

function escapeSingleQuotes(text) {
  return String(text).replace(/'/g, "''");
}

function copyWithRetry(source, target, retries = 3) {
  let lastError = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      fs.copyFileSync(source, target);
      if (fs.existsSync(target)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Failed to copy executable to install directory');
}

function ensureStartupScript(targetExe, startupScript) {
  const scriptBody = [
    'Set shell = CreateObject("WScript.Shell")',
    `shell.Run """${targetExe}"" --service", 0, False`
  ].join('\r\n');
  fs.writeFileSync(startupScript, scriptBody, 'utf8');
}

function removeStartupValue(valueName) {
  spawnSync('reg.exe', ['delete', STARTUP_KEY, '/v', valueName, '/f'], {
    encoding: 'utf8',
    windowsHide: true
  });
}

function removeStartupApprovedValue(valueName) {
  spawnSync('reg.exe', ['delete', STARTUP_APPROVED_RUN_KEY, '/v', valueName, '/f'], {
    encoding: 'utf8',
    windowsHide: true
  });
}

function ensureStartupRegistration(startupCommand) {
  const allValues = [STARTUP_VALUE, ...LEGACY_STARTUP_VALUES];
  LEGACY_STARTUP_VALUES.forEach(removeStartupValue);
  allValues.forEach(removeStartupApprovedValue);

  const regResult = spawnSync('reg.exe', ['add', STARTUP_KEY, '/v', STARTUP_VALUE, '/t', 'REG_SZ', '/d', startupCommand, '/f'], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (regResult.status !== 0) {
    throw new Error(regResult.stderr || 'Failed to create startup registry entry');
  }
}

function isAgentAlreadyRunning() {
  return new Promise(resolve => {
    const req = http.get({
      hostname: AGENT_HOST,
      port: AGENT_PORT,
      path: '/health',
      timeout: 800
    }, res => {
      resolve(res.statusCode === 200);
      res.resume();
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function runPowerShell(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  });
}

function listWindowsPrinters() {
  const ps = "$ErrorActionPreference = 'Stop'; $names = Get-Printer | Select-Object -ExpandProperty Name; $names | ConvertTo-Json -Compress";
  const result = runPowerShell(ps);
  if (result.status !== 0) {
    throw new Error(result.stderr && result.stderr.trim() ? result.stderr.trim() : 'Unable to read printers');
  }

  const out = (result.stdout || '').trim();
  if (!out) return [];

  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function sendRawToPrinter(printerName, data) {
  const escapedPrinter = escapeSingleQuotes(printerName);
  const payload = Buffer.from(data, 'utf8').toString('base64');

  const ps = `
$ErrorActionPreference = 'Stop'
$printerName = '${escapedPrinter}'
$base64 = '${payload}'
$bytes = [System.Convert]::FromBase64String($base64)

$source = @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@

Add-Type -TypeDefinition $source -ErrorAction SilentlyContinue | Out-Null

$doc = New-Object RawPrinter+DOCINFOA
$doc.pDocName = 'BillWise'
$doc.pDataType = 'RAW'

$hPrinter = [IntPtr]::Zero
if (-not [RawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
  throw "OpenPrinter failed for $printerName"
}

try {
  if (-not [RawPrinter]::StartDocPrinter($hPrinter, 1, $doc)) {
    throw 'StartDocPrinter failed'
  }
  if (-not [RawPrinter]::StartPagePrinter($hPrinter)) {
    throw 'StartPagePrinter failed'
  }

  $ptr = [System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)
  try {
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    $written = 0
    if (-not [RawPrinter]::WritePrinter($hPrinter, $ptr, $bytes.Length, [ref]$written)) {
      throw 'WritePrinter failed'
    }
  }
  finally {
    [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)
  }

  [RawPrinter]::EndPagePrinter($hPrinter) | Out-Null
  [RawPrinter]::EndDocPrinter($hPrinter) | Out-Null
}
finally {
  [RawPrinter]::ClosePrinter($hPrinter) | Out-Null
}
`;

  const result = runPowerShell(ps);
  if (result.status !== 0) {
    throw new Error(result.stderr && result.stderr.trim() ? result.stderr.trim() : 'Raw print failed');
  }
}

function sendImageToPrinter(printerName, imageBase64, paperSize = '3inch') {
  const escapedPrinter = escapeSingleQuotes(printerName);
  const paperWidth = paperSize === '2inch' ? 200 : 300;
  const tmpFile = path.join(os.tmpdir(), `billwise-print-${Date.now()}-${Math.random().toString(16).slice(2)}.b64`);
  fs.writeFileSync(tmpFile, String(imageBase64), 'utf8');

  const escapedTmpFile = escapeSingleQuotes(tmpFile);
  const ps = `
$ErrorActionPreference = 'Stop'
$printerName = '${escapedPrinter}'
$base64Path = '${escapedTmpFile}'
$paperWidth = ${paperWidth}

Add-Type -AssemblyName System.Drawing

$base64 = Get-Content -Path $base64Path -Raw -Encoding UTF8
$bytes = [System.Convert]::FromBase64String($base64)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$image = [System.Drawing.Image]::FromStream($ms)

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $printerName
if (-not $printDoc.PrinterSettings.IsValid) {
  throw "Invalid printer: $printerName"
}

$printDoc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)

$paperHeight = [Math]::Max(200, [int]([Math]::Ceiling(($image.Height / [double]$image.Width) * $paperWidth)))
$paper = New-Object System.Drawing.Printing.PaperSize('BillWiseCustom', $paperWidth, $paperHeight)
$printDoc.DefaultPageSettings.PaperSize = $paper

$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $e)

  $dpiX = $e.Graphics.DpiX
  if ($dpiX -le 0) { $dpiX = 203 }

  $targetWidthPx = [int]([Math]::Round(($paperWidth / 100.0) * $dpiX))
  if ($targetWidthPx -le 0) { $targetWidthPx = $image.Width }
  $targetHeightPx = [int]([Math]::Round($image.Height * ($targetWidthPx / [double]$image.Width)))
  if ($targetHeightPx -le 0) { $targetHeightPx = $image.Height }

  $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $e.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $e.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

  $rect = New-Object System.Drawing.Rectangle(0, 0, $targetWidthPx, $targetHeightPx)
  $e.Graphics.Clear([System.Drawing.Color]::White)
  $e.Graphics.DrawImage($image, $rect)
  $e.HasMorePages = $false
}

$printDoc.add_PrintPage($handler)
try {
  $printDoc.Print()
}
finally {
  $printDoc.remove_PrintPage($handler)
  $printDoc.Dispose()
  $image.Dispose()
  $ms.Dispose()
}
`;

  try {
    const result = runPowerShell(ps);
    if (result.status !== 0) {
      throw new Error(result.stderr && result.stderr.trim() ? result.stderr.trim() : 'Image print failed');
    }
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Best effort cleanup.
    }
  }
}

async function startService() {
  if (process.platform === 'win32') {
    const { installDir, targetExe, startupScript, startupCommand } = getInstallContext();
    fs.mkdirSync(installDir, { recursive: true });

    if (Boolean(process.pkg) && path.resolve(process.execPath) !== path.resolve(targetExe)) {
      copyWithRetry(process.execPath, targetExe);
      ensureStartupScript(targetExe, startupScript);
      const bootstrapChild = spawn(targetExe, ['--service'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      bootstrapChild.unref();
      return;
    }

    ensureStartupScript(targetExe, startupScript);
    ensureStartupRegistration(startupCommand);
  }

  if (await isAgentAlreadyRunning()) {
    return;
  }

  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      status: 'ok',
      service: 'BillWisePrintAgent',
      version: AGENT_VERSION,
      pid: process.pid
    });
  });

  app.get('/printers', (_req, res) => {
    try {
      const printers = listWindowsPrinters();
      res.json({ success: true, printers });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, printers: [] });
    }
  });

  app.post('/print', (req, res) => {
    const body = req.body || {};
    const printerName = body.printerName;
    const data = body.data;

    if (!printerName || !data) {
      return res.status(400).json({ success: false, message: 'printerName and data are required' });
    }

    try {
      sendRawToPrinter(printerName, data);
      return res.json({ success: true, message: 'Print sent' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Print failed' });
    }
  });

  app.post('/print-image', (req, res) => {
    const body = req.body || {};
    const printerName = body.printerName;
    const imageBase64 = body.imageBase64;
    const paperSize = body.paperSize || '3inch';

    if (!printerName || !imageBase64) {
      return res.status(400).json({ success: false, message: 'printerName and imageBase64 are required' });
    }

    try {
      sendImageToPrinter(printerName, imageBase64, paperSize);
      return res.json({ success: true, message: 'Image print sent' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Image print failed' });
    }
  });

  app.listen(AGENT_PORT, AGENT_HOST, () => {
    console.log(`BillWise Print Agent listening on http://${AGENT_HOST}:${AGENT_PORT}`);
  });
}

function installAndStart() {
  if (process.platform !== 'win32') {
    console.error('Install is only supported on Windows.');
    process.exit(1);
  }

  const { installDir, targetExe, startupScript, startupCommand } = getInstallContext();
  fs.mkdirSync(installDir, { recursive: true });

  const currentExe = process.execPath;
  if (!currentExe.toLowerCase().endsWith('.exe')) {
    console.error('Please run install from the packaged .exe build.');
    process.exit(1);
  }

  if (path.resolve(currentExe) !== path.resolve(targetExe)) {
    copyWithRetry(currentExe, targetExe);
  }

  if (!fs.existsSync(targetExe)) {
    console.error('Install failed because target executable is missing after copy.');
    process.exit(1);
  }

  ensureStartupScript(targetExe, startupScript);

  try {
    ensureStartupRegistration(startupCommand);
  } catch (error) {
    console.error(error.message || 'Failed to create startup registry entry');
    process.exit(1);
  }

  const child = spawn(targetExe, ['--service'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  console.log('BillWise Print Agent installed and added to Windows startup.');
}

const args = new Set(process.argv.slice(2));
const isPackagedExe = Boolean(process.pkg) && process.execPath.toLowerCase().endsWith('.exe');

if (args.has('--service')) {
  startService().catch(error => {
    console.error(error?.message || 'Service startup failed');
    process.exit(1);
  });
} else if (args.has('--install') || isPackagedExe) {
  installAndStart();
} else {
  startService().catch(error => {
    console.error(error?.message || 'Service startup failed');
    process.exit(1);
  });
}
