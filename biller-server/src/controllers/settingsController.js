// In-memory settings store
let settings = {
  businessName: 'My Business',
  logo: '',
  address: '',
  phone: '',
  email: '',
  taxNumber: '',
  currency: '₹',
  currencyCode: 'INR',
  applicationType: 'general',
  theme: 'light',
  scannerType: 'none',
  taxEnabled: true,
  taxRates: [
    { name: 'GST 5%', rate: 5 },
    { name: 'GST 12%', rate: 12 },
    { name: 'GST 18%', rate: 18 }
  ],
  invoicePrefix: 'INV',
  invoiceStartNumber: 1,
  footerText: 'Thank you for your business!',
  lowStockAlertEnabled: true,
  lowStockThreshold: 10,
  updatedAt: new Date().toISOString()
};

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
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = req.body;

    settings = {
      ...settings,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
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

    // In production, upload to Firebase Storage
    // For demo, we'll use base64
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const logoUrl = `data:${mimeType};base64,${base64}`;

    settings.logo = logoUrl;
    settings.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: { logo: logoUrl }
    });
  } catch (error) {
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
