import cors from 'cors';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENT_PORT = 32145;
const AGENT_HOST = '127.0.0.1';
const STARTUP_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const STARTUP_VALUE = 'BillWisePrintAgent';

function escapeSingleQuotes(text) {
  return String(text).replace(/'/g, "''");
}

function runPowerShell(command) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8'
  });
}

function listWindowsPrinters() {
  const ps = "$ErrorActionPreference = 'Stop'; $names = Get-Printer | Select-Object -ExpandProperty Name; $names | ConvertTo-Json -Compress";
  const result = runPowerShell(ps);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Unable to read printers');
  }

  const out = (result.stdout || '').trim();
  if (!out) return [];

  const parsed = JSON.parse(out);
  if (Array.isArray(parsed)) return parsed;
  return [parsed];
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
    throw new Error(result.stderr?.trim() || 'Raw print failed');
  }
}

function preventSystemSleep() {
  // ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001) — stops Windows sleep timer
  const ps = [
    '$code = @"',
    'using System.Runtime.InteropServices;',
    'public class PowerMgmt {',
    '  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);',
    '}',
    '"@',
    'Add-Type -TypeDefinition $code',
    'while ($true) { [PowerMgmt]::SetThreadExecutionState(0x80000001) | Out-Null; Start-Sleep -Seconds 30 }'
  ].join('\n');
  const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    windowsHide: true,
    stdio: 'ignore'
  });
  proc.unref();
}

function startService() {
  if (process.platform === 'win32') preventSystemSleep();

  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok', service: 'BillWisePrintAgent' });
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
    const { printerName, data } = req.body || {};
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

  app.listen(AGENT_PORT, AGENT_HOST, () => {
    console.log(`BillWise Print Agent listening on http://${AGENT_HOST}:${AGENT_PORT}`);
  });
}

function installAndStart() {
  if (process.platform !== 'win32') {
    console.error('Install is only supported on Windows.');
    process.exit(1);
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const installDir = path.join(localAppData, 'BillWisePrintAgent');
  const targetExe = path.join(installDir, 'BillWisePrintAgent.exe');
  fs.mkdirSync(installDir, { recursive: true });

  const currentExe = process.execPath;
  if (!currentExe.toLowerCase().endsWith('.exe')) {
    console.error('Please run install from the packaged .exe build.');
    process.exit(1);
  }

  if (path.resolve(currentExe) !== path.resolve(targetExe)) {
    fs.copyFileSync(currentExe, targetExe);
  }

  const startupCommand = `"${targetExe}" --service`;
  const regResult = spawnSync('reg.exe', ['add', STARTUP_KEY, '/v', STARTUP_VALUE, '/t', 'REG_SZ', '/d', startupCommand, '/f'], {
    encoding: 'utf8'
  });

  if (regResult.status !== 0) {
    console.error(regResult.stderr || 'Failed to create startup registry entry');
    process.exit(1);
  }

  const child = spawn(targetExe, ['--service'], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  console.log('BillWise Print Agent installed and added to Windows startup.');
}

const args = new Set(process.argv.slice(2));
const isPackagedExe = Boolean(process.pkg) && process.execPath.toLowerCase().endsWith('.exe');

if (args.has('--service')) {
  startService();
} else if (args.has('--install') || isPackagedExe) {
  installAndStart();
} else {
  startService();
}
