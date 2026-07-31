import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.join(__dirname, '..', 'dist', 'BillWisePrintAgent.exe');
const targetDir = path.join(__dirname, '..', '..', 'public', 'downloads');
const target = path.join(targetDir, 'BillWisePrintAgent.exe');

if (!fs.existsSync(source)) {
  console.error('Build not found:', source);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log('Published:', target);
