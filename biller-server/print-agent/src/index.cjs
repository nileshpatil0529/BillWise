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
const AGENT_VERSION = '1.2.0';
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

function sendUnicodeToPrinter(printerName, paperSize = '3inch', type = 'receipt', bill = {}, settings = {}) {
  const escapedPrinter = escapeSingleQuotes(printerName);
  const payloadBase64 = Buffer.from(JSON.stringify({ paperSize, type, bill, settings }), 'utf8').toString('base64');

  const ps = `
$ErrorActionPreference = 'Stop'
$printerName = '${escapedPrinter}'
$base64 = '${payloadBase64}'

Add-Type -AssemblyName System.Drawing

$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($base64))
$payload = $json | ConvertFrom-Json -Depth 20

$paperSize = [string]$payload.paperSize
$jobType = [string]$payload.type
$bill = $payload.bill
$settings = $payload.settings

$paperWidth = if ($paperSize -eq '2inch') { 220 } else { 315 }
$left = 10
$right = $paperWidth - 24
$lineGap = 3

$titleSize = if ($paperSize -eq '2inch') { 14.0 } else { 15.0 }
$bodySize = if ($paperSize -eq '2inch') { 11.0 } else { 12.0 }
$smallSize = if ($paperSize -eq '2inch') { 10.0 } else { 10.5 }

$fontFamily = 'Nirmala UI'
$fontTitle = New-Object System.Drawing.Font($fontFamily, $titleSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
$fontBody = New-Object System.Drawing.Font($fontFamily, $bodySize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
$fontBodyBold = New-Object System.Drawing.Font($fontFamily, $bodySize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Point)
$fontSmall = New-Object System.Drawing.Font($fontFamily, $smallSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
$brush = [System.Drawing.Brushes]::Black

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $printerName
if (-not $printDoc.PrinterSettings.IsValid) {
  throw "Invalid printer: $printerName"
}

$printDoc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$printDoc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('BillWiseUnicode', $paperWidth, 2400)

$fmtLeft = New-Object System.Drawing.StringFormat
$fmtLeft.Alignment = [System.Drawing.StringAlignment]::Near
$fmtLeft.LineAlignment = [System.Drawing.StringAlignment]::Near

$fmtRight = New-Object System.Drawing.StringFormat
$fmtRight.Alignment = [System.Drawing.StringAlignment]::Far
$fmtRight.LineAlignment = [System.Drawing.StringAlignment]::Near

$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $e)

  $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
  $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $e.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit

  $y = 6

  function Draw-CenterLine {
    param([string]$text, [System.Drawing.Font]$font)
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    $size = $e.Graphics.MeasureString($text, $font)
    $x = [Math]::Max($left, (($right - $left) - $size.Width) / 2 + $left)
    $e.Graphics.DrawString($text, $font, $brush, $x, $y)
    $script:y += [int][Math]::Ceiling($size.Height) + $lineGap
  }

  function Draw-LeftLine {
    param([string]$text, [System.Drawing.Font]$font)
    if ([string]::IsNullOrWhiteSpace($text)) { return }
    $e.Graphics.DrawString($text, $font, $brush, $left, $y)
    $size = $e.Graphics.MeasureString($text, $font)
    $script:y += [int][Math]::Ceiling($size.Height) + $lineGap
  }

  function Draw-Sep {
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 1)
    $e.Graphics.DrawLine($pen, $left, $y, $right, $y)
    $pen.Dispose()
    $script:y += 6
  }

  $bizName = if ($settings.businessName) { [string]$settings.businessName } else { 'My Business' }
  Draw-CenterLine $bizName $fontTitle
  Draw-CenterLine ([string]$settings.address) $fontSmall
  Draw-CenterLine ((if ($settings.taxNumber) { 'GST: ' + [string]$settings.taxNumber } else { '' })) $fontSmall
  Draw-CenterLine ((if ($settings.phone) { 'Ph: ' + [string]$settings.phone } else { '' })) $fontSmall

  if ($bill.createdAt) {
    Draw-LeftLine ('Date: ' + [DateTime]::Parse([string]$bill.createdAt).ToString('dd/MM/yyyy, hh:mm tt')) $fontSmall
  }
  Draw-LeftLine ('Bill: ' + [string]$bill.billNumber) $fontSmall
  if ($bill.businessTypeData -and $bill.businessTypeData.tableNumber) {
    Draw-LeftLine ('Table: ' + [string]$bill.businessTypeData.tableNumber) $fontSmall
  }

  Draw-Sep

  if ($jobType -eq 'kot') {
    $e.Graphics.DrawString('Kitchen Order', $fontTitle, $brush, $left, $y)
    $y += 18
    $e.Graphics.DrawString('Name', $fontBodyBold, $brush, $left, $y)
    $e.Graphics.DrawString('Qty', $fontBodyBold, $brush, $right, $y, $fmtRight)
    $y += 20
    Draw-Sep

    foreach ($item in $bill.items) {
      $printedQty = 0
      if ($item.kotPrintedQuantity) { $printedQty = [double]$item.kotPrintedQuantity }
      $qtyRaw = [double]$item.quantity - $printedQty
      if ($qtyRaw -le 0) { continue }

      $name = if ($item.nameHi) { [string]$item.nameHi } else { [string]$item.name }
      $qty = if ($item.isLooseItem) { '{0:0.##}' -f $qtyRaw } else { '{0:0}' -f [Math]::Round($qtyRaw) }

      $nameColRight = $right - 56
      $nameRect = New-Object System.Drawing.RectangleF($left, $y, ($nameColRight - $left), 200)
      $nameSize = $e.Graphics.MeasureString($name, $fontBody, [int]($nameColRight - $left))
      $e.Graphics.DrawString($name, $fontBody, $brush, $nameRect, $fmtLeft)
      $e.Graphics.DrawString($qty, $fontBody, $brush, $right, $y, $fmtRight)

      $y += [int][Math]::Ceiling($nameSize.Height) + 2
    }
  }
  else {
    $e.Graphics.DrawString('Name', $fontBodyBold, $brush, $left, $y)
    $e.Graphics.DrawString('Qty X Rate', $fontBodyBold, $brush, $right, $y, $fmtRight)
    $y += 20
    Draw-Sep

    foreach ($item in $bill.items) {
      $name = if ($item.nameHi) { [string]$item.nameHi } else { [string]$item.name }
      $qty = if ($item.isLooseItem) { '{0:0.##}' -f [double]$item.quantity } else { '{0:0}' -f [Math]::Round([double]$item.quantity) }
      $rate = '{0:0.##}' -f [double]$item.unitPrice
      $rightText = "$qty X $rate"

      $nameColRight = $right - 88
      $nameRect = New-Object System.Drawing.RectangleF($left, $y, ($nameColRight - $left), 200)
      $nameSize = $e.Graphics.MeasureString($name, $fontBody, [int]($nameColRight - $left))
      $e.Graphics.DrawString($name, $fontBody, $brush, $nameRect, $fmtLeft)
      $e.Graphics.DrawString($rightText, $fontBody, $brush, $right, $y, $fmtRight)

      $y += [int][Math]::Ceiling($nameSize.Height) + 2
    }

    Draw-Sep
    $e.Graphics.DrawString('Subtotal', $fontBody, $brush, $left, $y)
    $e.Graphics.DrawString(('{0:0.##}' -f [double]$bill.subtotal), $fontBody, $brush, $right, $y, $fmtRight)
    $y += 20

    if ([double]$bill.taxTotal -gt 0) {
      $taxRate = 0
      if ($settings.taxRates -and $settings.taxRates.Count -gt 0) { $taxRate = [double]$settings.taxRates[0].rate }
      $e.Graphics.DrawString("Tax ($taxRate%)", $fontBody, $brush, $left, $y)
      $e.Graphics.DrawString(('{0:0.##}' -f [double]$bill.taxTotal), $fontBody, $brush, $right, $y, $fmtRight)
      $y += 20
    }

    if ([double]$bill.discountTotal -gt 0) {
      $e.Graphics.DrawString('Discount', $fontBody, $brush, $left, $y)
      $e.Graphics.DrawString(('-' + ('{0:0.##}' -f [double]$bill.discountTotal)), $fontBody, $brush, $right, $y, $fmtRight)
      $y += 20
    }

    $e.Graphics.DrawString('Grand Total', $fontBodyBold, $brush, $left, $y)
    $e.Graphics.DrawString(('{0:0.##}' -f [double]$bill.grandTotal), $fontBodyBold, $brush, $right, $y, $fmtRight)
    $y += 22

    Draw-Sep
    Draw-CenterLine ([string]$settings.footerText) $fontSmall
  }

  $e.HasMorePages = $false
}

$printDoc.add_PrintPage($handler)
try {
  $printDoc.Print()
}
finally {
  $printDoc.remove_PrintPage($handler)
  $fontTitle.Dispose()
  $fontBody.Dispose()
  $fontBodyBold.Dispose()
  $fontSmall.Dispose()
  $fmtLeft.Dispose()
  $fmtRight.Dispose()
  $printDoc.Dispose()
}
`;

  const result = runPowerShell(ps);
  if (result.status !== 0) {
    throw new Error(result.stderr && result.stderr.trim() ? result.stderr.trim() : 'Unicode print failed');
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

  app.post('/print-unicode', (req, res) => {
    const body = req.body || {};
    const printerName = body.printerName;
    const paperSize = body.paperSize || '3inch';
    const type = body.type || 'receipt';
    const bill = body.bill || {};
    const settings = body.settings || {};

    if (!printerName) {
      return res.status(400).json({ success: false, message: 'printerName is required' });
    }

    try {
      sendUnicodeToPrinter(printerName, paperSize, type, bill, settings);
      return res.json({ success: true, message: 'Unicode print sent' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Unicode print failed' });
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
