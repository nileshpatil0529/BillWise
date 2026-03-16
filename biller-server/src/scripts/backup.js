/**
 * Database Backup Script
 * Run with: npm run backup
 * 
 * Creates timestamped backups of the SQLite database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
const backupDir = path.join(__dirname, '../../backups');
const dbPath = path.join(dataDir, 'billwise.db');

// Create backup directory if it doesn't exist
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Generate backup filename with timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `billwise-backup-${timestamp}.db`);

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.log('❌ Database file not found:', dbPath);
  console.log('   Start the server first to create the database.');
  process.exit(1);
}

// Copy database file
try {
  fs.copyFileSync(dbPath, backupPath);
  console.log('✅ Backup created successfully!');
  console.log(`📁 Backup location: ${backupPath}`);
  
  // Get backup size
  const stats = fs.statSync(backupPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`📦 Backup size: ${sizeMB} MB`);
  
  // List recent backups
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('billwise-backup-'))
    .sort()
    .reverse();
  
  console.log(`\n📋 Recent backups (${backups.length} total):`);
  backups.slice(0, 5).forEach((b, i) => {
    console.log(`   ${i + 1}. ${b}`);
  });
  
  // Cleanup old backups (keep last 10)
  if (backups.length > 10) {
    const toDelete = backups.slice(10);
    toDelete.forEach(b => {
      fs.unlinkSync(path.join(backupDir, b));
    });
    console.log(`\n🧹 Cleaned up ${toDelete.length} old backup(s)`);
  }
  
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  process.exit(1);
}
