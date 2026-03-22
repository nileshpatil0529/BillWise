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
      phone TEXT UNIQUE,
      password TEXT NOT NULL,
      displayName TEXT,
      role TEXT DEFAULT 'staff',
      isActive INTEGER DEFAULT 1,
      requirePasswordChange INTEGER DEFAULT 0,
      permissions TEXT,
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_productId ON products(productId)`);

  // Create FTS5 virtual table for fast full-text search
  // FTS5 uses inverted index - O(1) lookup instead of O(n) table scan
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
      productId,
      name,
      barcode,
      category,
      content='products',
      content_rowid='rowid'
    )
  `);

  // Triggers to keep FTS index in sync with products table
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
      INSERT INTO products_fts(rowid, productId, name, barcode, category)
      VALUES (NEW.rowid, NEW.productId, NEW.name, NEW.barcode, NEW.category);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
      INSERT INTO products_fts(products_fts, rowid, productId, name, barcode, category)
      VALUES ('delete', OLD.rowid, OLD.productId, OLD.name, OLD.barcode, OLD.category);
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
      INSERT INTO products_fts(products_fts, rowid, productId, name, barcode, category)
      VALUES ('delete', OLD.rowid, OLD.productId, OLD.name, OLD.barcode, OLD.category);
      INSERT INTO products_fts(rowid, productId, name, barcode, category)
      VALUES (NEW.rowid, NEW.productId, NEW.name, NEW.barcode, NEW.category);
    END
  `);

  // Rebuild FTS index if needed (for existing data)
  try {
    const ftsCount = db.prepare('SELECT COUNT(*) as count FROM products_fts').get();
    const productsCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
    if (ftsCount.count !== productsCount.count) {
      console.log('🔄 Rebuilding FTS index...');
      db.exec(`INSERT INTO products_fts(products_fts) VALUES('rebuild')`);
      console.log('✅ FTS index rebuilt');
    }
  } catch (e) {
    // FTS table might be new, rebuild it
    db.exec(`INSERT INTO products_fts(products_fts) VALUES('rebuild')`);
  }

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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_customerPhone ON bills(customerPhone)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_paymentMethod ON bills(paymentMethod)`);

  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      customerId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for customers
  db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`);

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
      theme TEXT DEFAULT 'dark',
      scannerType TEXT DEFAULT 'none',
      taxEnabled INTEGER DEFAULT 1,
      taxRates TEXT DEFAULT '[{"name":"GST 5%","rate":5},{"name":"GST 12%","rate":12},{"name":"GST 18%","rate":18}]',
      discountEnabled INTEGER DEFAULT 1,
      categories TEXT DEFAULT '[{"name":"General","enabled":true}]',
      invoicePrefix TEXT DEFAULT 'INV',
      invoiceStartNumber INTEGER DEFAULT 1,
      footerText TEXT DEFAULT 'Thank you for your business!',
      lowStockAlertEnabled INTEGER DEFAULT 1,
      lowStockThreshold INTEGER DEFAULT 10,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User-specific settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      userId TEXT PRIMARY KEY,
      tableColumns TEXT,
      theme TEXT DEFAULT 'dark',
      preferences TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(uid) ON DELETE CASCADE
    )
  `);

  // Insert default settings if not exists
  const settingsExist = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsExist.count === 0) {
    db.prepare(`
      INSERT INTO settings (id) VALUES (1)
    `).run();
  }

  // Migration: Add discountEnabled column if it doesn't exist
  try {
    const columns = db.prepare('PRAGMA table_info(settings)').all();
    const hasDiscountEnabled = columns.some(col => col.name === 'discountEnabled');
    if (!hasDiscountEnabled) {
      db.exec('ALTER TABLE settings ADD COLUMN discountEnabled INTEGER DEFAULT 1');
      console.log('✅ Migration: Added discountEnabled column');
    }
    const hasDebtEnabled = columns.some(col => col.name === 'debtEnabled');
    if (!hasDebtEnabled) {
      db.exec('ALTER TABLE settings ADD COLUMN debtEnabled INTEGER DEFAULT 0');
      console.log('✅ Migration: Added debtEnabled column');
    }
    const hasCategories = columns.some(col => col.name === 'categories');
    if (!hasCategories) {
      db.exec('ALTER TABLE settings ADD COLUMN categories TEXT DEFAULT \'[{"name":"General","enabled":true}]\'');
      console.log('✅ Migration: Added categories column');
    }
    const hasTableColumns = columns.some(col => col.name === 'tableColumns');
    if (!hasTableColumns) {
      db.exec('ALTER TABLE settings ADD COLUMN tableColumns TEXT');
      console.log('✅ Migration: Added tableColumns column');
    }
  } catch (e) {
    // Column might already exist
  }

  // Migration: Add new columns to users table if they don't exist
  try {
    const userColumns = db.prepare('PRAGMA table_info(users)').all();
    const hasPhone = userColumns.some(col => col.name === 'phone');
    if (!hasPhone) {
      db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
      // Create unique index separately (ALTER TABLE doesn't support inline UNIQUE)
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL');
      console.log('✅ Migration: Added phone column to users');
    } else {
      // Ensure unique index exists even if column was added before
      try {
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL');
      } catch (e) {
        // Index might already exist
      }
    }
    const hasRequirePasswordChange = userColumns.some(col => col.name === 'requirePasswordChange');
    if (!hasRequirePasswordChange) {
      db.exec('ALTER TABLE users ADD COLUMN requirePasswordChange INTEGER DEFAULT 0');
      console.log('✅ Migration: Added requirePasswordChange column to users');
    }
    const hasPermissions = userColumns.some(col => col.name === 'permissions');
    if (!hasPermissions) {
      db.exec('ALTER TABLE users ADD COLUMN permissions TEXT');
      console.log('✅ Migration: Added permissions column to users');
    }
    const hasProfilePhoto = userColumns.some(col => col.name === 'profilePhoto');
    if (!hasProfilePhoto) {
      db.exec('ALTER TABLE users ADD COLUMN profilePhoto TEXT');
      console.log('✅ Migration: Added profilePhoto column to users');
    }
  } catch (e) {
    // Columns might already exist
  }

  // Update existing admin users to have all permissions if they don't have any
  try {
    const allPermissions = JSON.stringify(['dashboard', 'products', 'bills', 'customers', 'settings']);
    db.prepare(`
      UPDATE users 
      SET permissions = ?
      WHERE role = 'admin' AND (permissions IS NULL OR permissions = '')
    `).run(allPermissions);
    console.log('✅ Migration: Updated admin users with default permissions');
  } catch (e) {
    // Already updated
  }

  // Insert default admin user if not exists
  const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get(config.admin.email);
  if (adminExists.count === 0) {
    const allPermissions = JSON.stringify(['dashboard', 'products', 'bills', 'customers', 'settings']);
    db.prepare(`
      INSERT INTO users (uid, email, phone, password, displayName, role, isActive, requirePasswordChange, permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('admin-001', config.admin.email, null, config.admin.password, 'Administrator', 'admin', 1, 0, allPermissions);
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
