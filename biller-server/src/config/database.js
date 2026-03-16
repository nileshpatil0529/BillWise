import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path - stored in data folder
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'billwise.db');

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
const initializeDatabase = () => {
  console.log('📦 Initializing SQLite database...');

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      displayName TEXT,
      role TEXT DEFAULT 'user',
      isActive INTEGER DEFAULT 1,
      lastLogin TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      productId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      description TEXT,
      barcode TEXT,
      unitPrice REAL DEFAULT 0,
      costPrice REAL DEFAULT 0,
      stockQuantity INTEGER DEFAULT 0,
      lowStockAlert INTEGER DEFAULT 10,
      imageUrl TEXT,
      status TEXT DEFAULT 'active',
      metadata TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for barcode lookup
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`);

  // Bills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bills (
      billId TEXT PRIMARY KEY,
      billNumber TEXT UNIQUE NOT NULL,
      subtotal REAL DEFAULT 0,
      discountTotal REAL DEFAULT 0,
      taxTotal REAL DEFAULT 0,
      grandTotal REAL DEFAULT 0,
      paymentMethod TEXT DEFAULT 'cash',
      paymentStatus TEXT DEFAULT 'paid',
      amountPaid REAL DEFAULT 0,
      change REAL DEFAULT 0,
      customerName TEXT,
      customerPhone TEXT,
      businessTypeData TEXT,
      notes TEXT,
      createdBy TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for bills
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_createdAt ON bills(createdAt)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_paymentStatus ON bills(paymentStatus)`);

  // Bill items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      billId TEXT NOT NULL,
      productId TEXT,
      name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unitPrice REAL DEFAULT 0,
      itemTotal REAL DEFAULT 0,
      finalTotal REAL DEFAULT 0,
      FOREIGN KEY (billId) REFERENCES bills(billId) ON DELETE CASCADE
    )
  `);

  // Settings table (single row)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      businessName TEXT DEFAULT 'My Business',
      logo TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      taxNumber TEXT,
      currency TEXT DEFAULT '₹',
      currencyCode TEXT DEFAULT 'INR',
      applicationType TEXT DEFAULT 'general',
      theme TEXT DEFAULT 'light',
      scannerType TEXT DEFAULT 'none',
      taxEnabled INTEGER DEFAULT 1,
      taxRates TEXT DEFAULT '[{"name":"GST 5%","rate":5},{"name":"GST 12%","rate":12},{"name":"GST 18%","rate":18}]',
      invoicePrefix TEXT DEFAULT 'INV',
      invoiceStartNumber INTEGER DEFAULT 1,
      footerText TEXT DEFAULT 'Thank you for your business!',
      lowStockAlertEnabled INTEGER DEFAULT 1,
      lowStockThreshold INTEGER DEFAULT 10,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default settings if not exists
  const settingsExist = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsExist.count === 0) {
    db.prepare(`
      INSERT INTO settings (id) VALUES (1)
    `).run();
  }

  // Insert default admin user if not exists
  const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get(config.admin.email);
  if (adminExists.count === 0) {
    db.prepare(`
      INSERT INTO users (uid, email, password, displayName, role, isActive)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin-001', config.admin.email, config.admin.password, 'Administrator', 'admin', 1);
    console.log('✅ Default admin user created');
  }

  // Insert demo products if products table is empty
  const productsExist = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (productsExist.count === 0) {
    const demoProducts = [
      { productId: 'PRD001', name: 'Rice (1kg)', category: 'Groceries', unitPrice: 50, costPrice: 40, stockQuantity: 100, barcode: '8901234567890' },
      { productId: 'PRD002', name: 'Wheat Flour (1kg)', category: 'Groceries', unitPrice: 45, costPrice: 35, stockQuantity: 80, barcode: '8901234567906' },
      { productId: 'PRD003', name: 'Sugar (1kg)', category: 'Groceries', unitPrice: 42, costPrice: 38, stockQuantity: 60, barcode: '8901234567913' },
      { productId: 'PRD004', name: 'Cooking Oil (1L)', category: 'Groceries', unitPrice: 120, costPrice: 100, stockQuantity: 50, barcode: '8901234567920' },
      { productId: 'PRD005', name: 'Salt (1kg)', category: 'Groceries', unitPrice: 20, costPrice: 15, stockQuantity: 200, barcode: '8901234567937' }
    ];

    const insertProduct = db.prepare(`
      INSERT INTO products (productId, name, category, unitPrice, costPrice, stockQuantity, barcode, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    for (const p of demoProducts) {
      insertProduct.run(p.productId, p.name, p.category, p.unitPrice, p.costPrice, p.stockQuantity, p.barcode);
    }
    console.log('✅ Demo products inserted');
  }

  console.log('✅ SQLite database initialized successfully');
  console.log(`📁 Database location: ${dbPath}`);
};

// Initialize on import
initializeDatabase();

export default db;
export { dbPath };
