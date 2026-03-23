import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certDir = path.join(__dirname, '..', '..', 'certs');

// Create certs directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log('✅ SSL certificates already exist in ./certs/');
  console.log('   Delete them and run again to regenerate.');
  process.exit(0);
}

console.log('🔐 Generating self-signed SSL certificates...\n');

try {
  // Generate self-signed certificate using OpenSSL
  const opensslCmd = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.1.107"`;
  
  execSync(opensslCmd, { stdio: 'inherit' });
  
  console.log('\n✅ SSL certificates generated successfully!');
  console.log(`   Key:  ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  console.log('\n📱 To use on mobile devices:');
  console.log('   1. Access https://YOUR_IP:3000 on your phone');
  console.log('   2. Accept the security warning (tap Advanced → Proceed)');
  console.log('   3. Camera permissions should now work!\n');
} catch (error) {
  console.error('❌ Failed to generate certificates.');
  console.error('   Make sure OpenSSL is installed and in your PATH.');
  console.error('\n   Alternative: Install mkcert and run:');
  console.error('   npx mkcert create-ca && npx mkcert create-cert\n');
  process.exit(1);
}
