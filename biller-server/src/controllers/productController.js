import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

// In-memory product store for demo
const products = new Map();

// Initialize some demo products with barcodes for testing
const demoProducts = [
  { productId: 'PRD001', name: 'Rice (1kg)', category: 'Groceries', unitPrice: 50, costPrice: 40, stockQuantity: 100, status: 'active', barcode: '8901234567890' },
  { productId: 'PRD002', name: 'Wheat Flour (1kg)', category: 'Groceries', unitPrice: 45, costPrice: 35, stockQuantity: 80, status: 'active', barcode: '8901234567906' },
  { productId: 'PRD003', name: 'Sugar (1kg)', category: 'Groceries', unitPrice: 42, costPrice: 38, stockQuantity: 60, status: 'active', barcode: '8901234567913' },
  { productId: 'PRD004', name: 'Cooking Oil (1L)', category: 'Groceries', unitPrice: 120, costPrice: 100, stockQuantity: 50, status: 'active', barcode: '8901234567920' },
  { productId: 'PRD005', name: 'Salt (1kg)', category: 'Groceries', unitPrice: 20, costPrice: 15, stockQuantity: 200, status: 'active', barcode: '8901234567937' }
];

demoProducts.forEach(p => {
  products.set(p.productId, {
    ...p,
    description: '',
    lowStockAlert: 10,
    imageUrl: '',
    barcode: p.barcode || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
});

// Generate unique product ID
const generateProductId = () => {
  const count = products.size + 1;
  return `PRD${count.toString().padStart(6, '0')}`;
};

export const getAllProducts = async (req, res) => {
  try {
    const { category, status, search, page = 1, limit = 50 } = req.query;
    
    let productList = Array.from(products.values());

    // Apply filters
    if (category) {
      productList = productList.filter(p => p.category === category);
    }
    
    if (status) {
      productList = productList.filter(p => p.status === status);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      productList = productList.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.productId.toLowerCase().includes(searchLower) ||
        p.category?.toLowerCase().includes(searchLower) ||
        p.barcode?.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedProducts = productList.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        products: paginatedProducts,
        total: productList.length,
        page: parseInt(page),
        totalPages: Math.ceil(productList.length / limit)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = products.get(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

export const createProduct = async (req, res) => {
  try {
    const productData = req.body;
    const productName = productData.name;
    const productBarcode = productData.barcode || '';
    const stockToAdd = parseInt(productData.stockQuantity) || 0;

    // Check for existing product with same name or barcode
    let existingProduct = null;
    for (const [id, p] of products) {
      if ((productName && p.name.toLowerCase() === productName.toLowerCase()) ||
          (productBarcode && p.barcode && p.barcode === productBarcode)) {
        existingProduct = { id, product: p };
        break;
      }
    }

    if (existingProduct) {
      // Update existing product's stock quantity
      existingProduct.product.stockQuantity += stockToAdd;
      existingProduct.product.updatedAt = new Date().toISOString();
      
      // Optionally update other fields if they were provided
      if (productBarcode && !existingProduct.product.barcode) {
        existingProduct.product.barcode = productBarcode;
      }
      
      products.set(existingProduct.id, existingProduct.product);

      res.status(200).json({
        success: true,
        message: `Product already exists. Stock updated by ${stockToAdd}. New total: ${existingProduct.product.stockQuantity}`,
        data: existingProduct.product,
        updated: true
      });
    } else {
      const productId = productData.productId || generateProductId();
      
      const newProduct = {
        productId,
        name: productName,
        category: productData.category || 'General',
        description: productData.description || '',
        barcode: productBarcode,
        unitPrice: parseFloat(productData.unitPrice) || 0,
        costPrice: parseFloat(productData.costPrice) || 0,
        stockQuantity: stockToAdd,
        lowStockAlert: parseInt(productData.lowStockAlert) || 10,
        imageUrl: productData.imageUrl || '',
        status: productData.status || 'active',
        metadata: productData.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      products.set(productId, newProduct);

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: newProduct
      });
    }
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const product = products.get(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updatedProduct = {
      ...product,
      ...updates,
      productId: id, // Prevent ID change
      updatedAt: new Date().toISOString()
    };

    products.set(id, updatedProduct);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!products.has(id)) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    products.delete(id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.json({
        success: true,
        data: []
      });
    }

    const searchLower = q.toLowerCase();
    const results = Array.from(products.values())
      .filter(p => 
        p.status === 'active' && (
          p.name.toLowerCase().includes(searchLower) ||
          p.productId.toLowerCase().includes(searchLower) ||
          p.barcode?.toLowerCase().includes(searchLower)
        )
      )
      .slice(0, 10);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

export const importProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    let imported = 0;
    let errors = [];

    for (const row of data) {
      try {
        const productId = row.productId || row.ProductId || row['Product ID'] || generateProductId();
        
        const productName = row.name || row.Name || row['Product Name'] || '';
        const productBarcode = row.barcode || row.Barcode || row['Barcode'] || '';
        const stockToAdd = parseInt(row.stockQuantity || row.StockQuantity || row['Stock'] || row['Stock Quantity'] || 0);

        // Check for existing product with same name or barcode
        let existingProduct = null;
        for (const [id, p] of products) {
          if ((productName && p.name.toLowerCase() === productName.toLowerCase()) ||
              (productBarcode && p.barcode && p.barcode === productBarcode)) {
            existingProduct = { id, product: p };
            break;
          }
        }

        if (existingProduct) {
          // Update existing product's stock quantity
          existingProduct.product.stockQuantity += stockToAdd;
          existingProduct.product.updatedAt = new Date().toISOString();
          products.set(existingProduct.id, existingProduct.product);
          imported++;
        } else {
          const product = {
            productId,
            name: productName,
            barcode: productBarcode,
            category: row.category || row.Category || 'General',
            description: row.description || row.Description || '',
            unitPrice: parseFloat(row.unitPrice || row.UnitPrice || row['Unit Price'] || 0),
            costPrice: parseFloat(row.costPrice || row.CostPrice || row['Cost Price'] || 0),
            stockQuantity: stockToAdd,
            lowStockAlert: parseInt(row.lowStockAlert || row.LowStockAlert || row['Low Stock Alert'] || 10),
            status: row.status || row.Status || 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          if (product.name) {
            products.set(productId, product);
            imported++;
          }
        }
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Imported ${imported} products`,
      data: { imported, errors: errors.length, errorDetails: errors }
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import products'
    });
  }
};

export const exportProducts = async (req, res) => {
  try {
    const productList = Array.from(products.values()).map(p => ({
      'Product ID': p.productId,
      'Product Name': p.name,
      'Barcode': p.barcode || '',
      'Category': p.category,
      'Description': p.description,
      'Unit Price': p.unitPrice,
      'Cost Price': p.costPrice,
      'Stock Quantity': p.stockQuantity,
      'Low Stock Alert': p.lowStockAlert,
      'Status': p.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(productList);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export products'
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const categories = [...new Set(Array.from(products.values()).map(p => p.category))];
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

export default {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  importProducts,
  exportProducts,
  getCategories
};
