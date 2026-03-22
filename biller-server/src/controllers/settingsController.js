import db from '../config/database.js';

// Application type configurations
const applicationTypes = {
  general: {
    name: 'General Store',
    description: 'Basic POS features',
    fields: []
  },
  hotel: {
    name: 'Hotel',
    description: 'Room management, Guest info, Services',
    fields: ['roomNumber', 'guestName', 'checkIn', 'checkOut', 'serviceType']
  },
  grocery: {
    name: 'Grocery Store',
    description: 'Weight-based, Loose items, Expiry tracking',
    fields: ['weight', 'expiryDate', 'batchNumber']
  },
  clothing: {
    name: 'Clothing Store',
    description: 'Size, Color, Brand management',
    fields: ['size', 'color', 'brand', 'season']
  },
  electronics: {
    name: 'Electronics Store',
    description: 'Serial numbers, Warranty, Model tracking',
    fields: ['serialNumber', 'warranty', 'modelNumber', 'manufacturer']
  },
  restaurant: {
    name: 'Restaurant',
    description: 'Table management, Kitchen orders',
    fields: ['tableNumber', 'orderType', 'waiter']
  }
};

export const getSettings = async (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Settings not found'
      });
    }

    // Parse JSON fields
    const parsedSettings = {
      ...settings,
      taxRates: settings.taxRates ? JSON.parse(settings.taxRates) : [],
      categories: settings.categories ? JSON.parse(settings.categories) : [{ name: 'General', enabled: true }],
      tableColumns: settings.tableColumns ? JSON.parse(settings.tableColumns) : null,
      units: settings.units ? JSON.parse(settings.units) : [
        { id: 1, name: 'Kilogram', symbol: 'kg', allowDecimal: true },
        { id: 2, name: 'Gram', symbol: 'g', allowDecimal: false },
        { id: 3, name: 'Liter', symbol: 'ltr', allowDecimal: true },
        { id: 4, name: 'Milliliter', symbol: 'ml', allowDecimal: false },
        { id: 5, name: 'Piece', symbol: 'pcs', allowDecimal: false }
      ],
      taxEnabled: Boolean(settings.taxEnabled),
      discountEnabled: Boolean(settings.discountEnabled ?? 1),
      debtEnabled: Boolean(settings.debtEnabled ?? 0),
      lowStockAlertEnabled: Boolean(settings.lowStockAlertEnabled)
    };

    res.json({
      success: true,
      data: parsedSettings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    const now = new Date().toISOString();

    // Build dynamic update query
    const allowedFields = [
      'businessName', 'logo', 'address', 'phone', 'email', 'taxNumber',
      'currency', 'currencyCode', 'applicationType', 'theme', 'scannerType',
      'taxEnabled', 'taxRates', 'categories', 'tableColumns', 'units', 'viewMode', 'language', 'discountEnabled', 'debtEnabled', 'invoicePrefix', 'invoiceStartNumber',
      'footerText', 'lowStockAlertEnabled', 'lowStockThreshold'
    ];

    const setClauses = [];
    const values = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        
        // Handle special conversions
        if (field === 'taxRates' || field === 'categories' || field === 'tableColumns' || field === 'units') {
          values.push(JSON.stringify(updates[field]));
        } else if (field === 'taxEnabled' || field === 'discountEnabled' || field === 'debtEnabled' || field === 'lowStockAlertEnabled') {
          values.push(updates[field] ? 1 : 0);
        } else {
          values.push(updates[field]);
        }
      }
    }

    if (setClauses.length > 0) {
      setClauses.push('updatedAt = ?');
      values.push(now);
      values.push(1); // for WHERE id = 1

      const query = `UPDATE settings SET ${setClauses.join(', ')} WHERE id = ?`;
      db.prepare(query).run(...values);
    }

    // Fetch updated settings
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    
    const parsedSettings = {
      ...settings,
      taxRates: settings.taxRates ? JSON.parse(settings.taxRates) : [],
      categories: settings.categories ? JSON.parse(settings.categories) : [{ name: 'General', enabled: true }],
      tableColumns: settings.tableColumns ? JSON.parse(settings.tableColumns) : null,
      units: settings.units ? JSON.parse(settings.units) : [
        { id: 1, name: 'Kilogram', symbol: 'kg', allowDecimal: true },
        { id: 2, name: 'Gram', symbol: 'g', allowDecimal: false },
        { id: 3, name: 'Liter', symbol: 'ltr', allowDecimal: true },
        { id: 4, name: 'Milliliter', symbol: 'ml', allowDecimal: false },
        { id: 5, name: 'Piece', symbol: 'pcs', allowDecimal: false }
      ],
      taxEnabled: Boolean(settings.taxEnabled),
      discountEnabled: Boolean(settings.discountEnabled ?? 1),
      debtEnabled: Boolean(settings.debtEnabled ?? 0),
      lowStockAlertEnabled: Boolean(settings.lowStockAlertEnabled)
    };

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: parsedSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};

export const getApplicationTypes = async (req, res) => {
  try {
    res.json({
      success: true,
      data: applicationTypes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch application types'
    });
  }
};

export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Convert to base64
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const logoUrl = `data:${mimeType};base64,${base64}`;

    const now = new Date().toISOString();
    db.prepare('UPDATE settings SET logo = ?, updatedAt = ? WHERE id = 1')
      .run(logoUrl, now);

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: { logo: logoUrl }
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload logo'
    });
  }
};

export const getCurrencies = async (req, res) => {
  try {
    const currencies = [
      { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
      { code: 'USD', symbol: '$', name: 'US Dollar' },
      { code: 'EUR', symbol: '€', name: 'Euro' },
      { code: 'GBP', symbol: '£', name: 'British Pound' },
      { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
      { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
      { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' }
    ];

    res.json({
      success: true,
      data: currencies
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch currencies'
    });
  }
};

export default {
  getSettings,
  updateSettings,
  getApplicationTypes,
  uploadLogo,
  getCurrencies
};
