import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certDir = path.join(__dirname, '..', '..', 'certs');

// Get all local IP addresses
const getLocalIPs = () => {
  const ips = ['127.0.0.1'];
  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
};

// Create certs directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');

// Check for --force flag to regenerate
const forceRegenerate = process.argv.includes('--force');

// Check if certificates already exist
if (fs.existsSync(keyPath) && fs.existsSync(certPath) && !forceRegenerate) {
  console.log('✅ SSL certificates already exist in ./certs/');
  console.log('   Run with --force to regenerate: npm run generate-cert -- --force');
  process.exit(0);
}

// Delete existing certs if force regenerating
if (forceRegenerate) {
  if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
  if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
  console.log('🗑️  Removed existing certificates\n');
}

console.log('🔐 Generating self-signed SSL certificates...\n');

// Get all IPs and build SAN extension
const localIPs = getLocalIPs();
const sanEntries = ['DNS:localhost', ...localIPs.map(ip => `IP:${ip}`)];
const sanString = sanEntries.join(',');

console.log('📍 Including these IPs in certificate:');
localIPs.forEach(ip => console.log(`   - ${ip}`));
console.log('');

try {
  // Generate self-signed certificate using OpenSSL with all local IPs
  const opensslCmd = `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=${sanString}"`;
  
  execSync(opensslCmd, { stdio: 'inherit' });
  
  const primaryIP = localIPs.find(ip => ip !== '127.0.0.1') || 'localhost';
  
  console.log('\n✅ SSL certificates generated successfully!');
  console.log(`   Key:  ${keyPath}`);
  console.log(`   Cert: ${certPath}`);
  console.log('\n📱 To use on mobile devices:');
  console.log(`   1. Access https://${primaryIP}:3000 on your phone`);
  console.log('   2. Accept the security warning (tap Advanced → Proceed)');
  console.log('   3. Camera permissions should now work!\n');
  console.log('💡 If IP changes, regenerate with: npm run generate-cert -- --force\n');
} catch (error) {
  console.error('❌ Failed to generate certificates.');
  console.error('   Make sure OpenSSL is installed and in your PATH.');
  console.error('\n   Alternative: Install mkcert and run:');
  console.error('   npx mkcert create-ca && npx mkcert create-cert\n');
  process.exit(1);
}
