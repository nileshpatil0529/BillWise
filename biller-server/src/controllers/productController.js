import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import fs from 'fs';
import db from '../config/database.js';

// Generate unique product ID
const generateProductId = () => {
  const result = db.prepare('SELECT COUNT(*) as count FROM products').get();
  const count = result.count + 1;
  return `PRD${count.toString().padStart(6, '0')}`;
};

export const getAllProducts = async (req, res) => {
  try {
    const { category, status, search, page = 1, limit = 50 } = req.query;
    
    let products = [];
    let total = 0;
    const offset = (page - 1) * parseInt(limit);

    // If search is provided, use optimized search
    if (search && search.trim().length >= 2) {
      const query = search.trim();
      
      // Try FTS5 first for speed
      try {
        const ftsQuery = query.replace(/[^\w\s]/g, '') + '*';
        let ftsSearch = `
          SELECT p.* FROM products p
          INNER JOIN products_fts fts ON p.rowid = fts.rowid
          WHERE products_fts MATCH ?
        `;
        const ftsParams = [ftsQuery];

        if (category) {
          ftsSearch += ' AND p.category = ?';
          ftsParams.push(category);
        }
        if (status) {
          ftsSearch += ' AND p.status = ?';
          ftsParams.push(status);
        }
        
        // Get count
        const countResult = db.prepare(ftsSearch.replace('SELECT p.*', 'SELECT COUNT(*) as count')).get(...ftsParams);
        total = countResult.count;

        // Get paginated results
        ftsSearch += ' ORDER BY rank LIMIT ? OFFSET ?';
        ftsParams.push(parseInt(limit), offset);
        products = db.prepare(ftsSearch).all(...ftsParams);
      } catch (ftsError) {
        // Fallback to LIKE search
        const searchPattern = `%${query}%`;
        let likeSearch = `
          SELECT * FROM products 
          WHERE (name LIKE ? OR productId LIKE ? OR barcode LIKE ? OR category LIKE ?)
        `;
        const likeParams = [searchPattern, searchPattern, searchPattern, searchPattern];

        if (category) {
          likeSearch += ' AND category = ?';
          likeParams.push(category);
        }
        if (status) {
          likeSearch += ' AND status = ?';
          likeParams.push(status);
        }

        const countResult = db.prepare(likeSearch.replace('SELECT *', 'SELECT COUNT(*) as count')).get(...likeParams);
        total = countResult.count;

        likeSearch += ' ORDER BY name LIMIT ? OFFSET ?';
        likeParams.push(parseInt(limit), offset);
        products = db.prepare(likeSearch).all(...likeParams);
      }
    } else {
      // No search - simple filtered query
      let query = 'SELECT * FROM products WHERE 1=1';
      const params = [];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }
      
      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      // Get total count
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
      const totalResult = db.prepare(countQuery).get(...params);
      total = totalResult.count;

      // Add pagination
      query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);
      products = db.prepare(query).all(...params);
    }

    // Parse metadata JSON for each product
    const productsWithMetadata = products.map(p => ({
      ...p,
      metadata: p.metadata ? JSON.parse(p.metadata) : {}
    }));

    res.json({
      success: true,
      data: {
        products: productsWithMetadata,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
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
    const product = db.prepare('SELECT * FROM products WHERE productId = ?').get(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...product,
        metadata: product.metadata ? JSON.parse(product.metadata) : {}
      }
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
    
    if (productName) {
      existingProduct = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(productName);
    }
    
    if (!existingProduct && productBarcode) {
      existingProduct = db.prepare('SELECT * FROM products WHERE barcode = ?').get(productBarcode);
    }

    if (existingProduct) {
      // Update existing product's stock quantity
      const newStock = existingProduct.stockQuantity + stockToAdd;
      const now = new Date().toISOString();
      
      db.prepare('UPDATE products SET stockQuantity = ?, updatedAt = ? WHERE productId = ?')
        .run(newStock, now, existingProduct.productId);
      
      // Update barcode if provided and not set
      if (productBarcode && !existingProduct.barcode) {
        db.prepare('UPDATE products SET barcode = ? WHERE productId = ?')
          .run(productBarcode, existingProduct.productId);
      }

      const updatedProduct = db.prepare('SELECT * FROM products WHERE productId = ?')
        .get(existingProduct.productId);

      res.status(200).json({
        success: true,
        message: `Product already exists. Stock updated by ${stockToAdd}. New total: ${newStock}`,
        data: updatedProduct,
        updated: true
      });
    } else {
      const productId = productData.productId || generateProductId();
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO products (productId, name, category, description, barcode, unitPrice, costPrice, stockQuantity, lowStockAlert, imageUrl, status, metadata, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        productName,
        productData.category || 'General',
        productData.description || '',
        productBarcode,
        parseFloat(productData.unitPrice) || 0,
        parseFloat(productData.costPrice) || 0,
        stockToAdd,
        parseInt(productData.lowStockAlert) || 10,
        productData.imageUrl || '',
        productData.status || 'active',
        JSON.stringify(productData.metadata || {}),
        now,
        now
      );

      const newProduct = db.prepare('SELECT * FROM products WHERE productId = ?').get(productId);

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

    const product = db.prepare('SELECT * FROM products WHERE productId = ?').get(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const now = new Date().toISOString();
    
    db.prepare(`
      UPDATE products SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        barcode = COALESCE(?, barcode),
        unitPrice = COALESCE(?, unitPrice),
        costPrice = COALESCE(?, costPrice),
        stockQuantity = COALESCE(?, stockQuantity),
        lowStockAlert = COALESCE(?, lowStockAlert),
        imageUrl = COALESCE(?, imageUrl),
        status = COALESCE(?, status),
        metadata = COALESCE(?, metadata),
        updatedAt = ?
      WHERE productId = ?
    `).run(
      updates.name,
      updates.category,
      updates.description,
      updates.barcode,
      updates.unitPrice !== undefined ? parseFloat(updates.unitPrice) : null,
      updates.costPrice !== undefined ? parseFloat(updates.costPrice) : null,
      updates.stockQuantity !== undefined ? parseInt(updates.stockQuantity) : null,
      updates.lowStockAlert !== undefined ? parseInt(updates.lowStockAlert) : null,
      updates.imageUrl,
      updates.status,
      updates.metadata ? JSON.stringify(updates.metadata) : null,
      now,
      id
    );

    const updatedProduct = db.prepare('SELECT * FROM products WHERE productId = ?').get(id);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = db.prepare('SELECT * FROM products WHERE productId = ?').get(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    db.prepare('DELETE FROM products WHERE productId = ?').run(id);

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
    
    if (!q || q.trim().length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    const query = q.trim();
    let results = [];

    // Strategy 1: Exact barcode match (fastest - uses index, O(1))
    const exactBarcode = db.prepare(`
      SELECT * FROM products 
      WHERE status = 'active' AND barcode = ?
    `).get(query);
    
    if (exactBarcode) {
      return res.json({
        success: true,
        data: [exactBarcode]
      });
    }

    // Strategy 2: Exact productId match (fast - primary key)
    const exactProductId = db.prepare(`
      SELECT * FROM products 
      WHERE status = 'active' AND productId = ?
    `).get(query);
    
    if (exactProductId) {
      return res.json({
        success: true,
        data: [exactProductId]
      });
    }

    // Strategy 3: FTS5 full-text search (fast - inverted index)
    // Use prefix search for partial matching
    try {
      const ftsQuery = query.replace(/[^\w\s]/g, '') + '*'; // Add wildcard for prefix search
      results = db.prepare(`
        SELECT p.* FROM products p
        INNER JOIN products_fts fts ON p.rowid = fts.rowid
        WHERE p.status = 'active' 
          AND products_fts MATCH ?
        ORDER BY rank
        LIMIT 15
      `).all(ftsQuery);
    } catch (ftsError) {
      // FTS might fail on special characters, fall back to LIKE
      results = [];
    }

    // Strategy 4: Fallback to LIKE if FTS returns nothing (handles special chars, partial matches)
    if (results.length === 0) {
      const searchPattern = `%${query}%`;
      results = db.prepare(`
        SELECT * FROM products 
        WHERE status = 'active' 
          AND (name LIKE ? OR productId LIKE ? OR barcode LIKE ? OR category LIKE ?)
        ORDER BY 
          CASE 
            WHEN barcode LIKE ? THEN 1
            WHEN productId LIKE ? THEN 2
            WHEN name LIKE ? THEN 3
            ELSE 4
          END
        LIMIT 15
      `).all(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, `${query}%`
      );
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Search error:', error);
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

    // Debug: Log the column headers from the first row
    if (data.length > 0) {
      console.log('Excel columns detected:', Object.keys(data[0]));
    }

    // Get enabled categories from settings for validation
    const settings = db.prepare('SELECT categories FROM settings WHERE id = 1').get();
    let validCategories = ['General'];
    if (settings && settings.categories) {
      const allCategories = JSON.parse(settings.categories);
      validCategories = allCategories
        .filter(cat => cat.enabled)
        .map(cat => cat.name);
      if (validCategories.length === 0) {
        validCategories = ['General'];
      }
    }

    let imported = 0;
    let updated = 0;
    let inserted = 0;
    let errors = [];

    const insertProduct = db.prepare(`
      INSERT INTO products (productId, name, category, description, barcode, unitPrice, costPrice, stockQuantity, lowStockAlert, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    const updateProduct = db.prepare(`
      UPDATE products 
      SET name = ?, category = ?, description = ?, barcode = ?, unitPrice = ?, costPrice = ?, stockQuantity = ?, lowStockAlert = ?, updatedAt = ? 
      WHERE productId = ?
    `);

    const transaction = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const productName = (row.name || row.Name || row['Product Name'] || '').toString().trim();
          
          // Handle barcode - convert from number/scientific notation if needed
          let barcodeValue = row.barcode || row.Barcode || row['Barcode'] || '';
          if (typeof barcodeValue === 'number') {
            // Convert number to string, handling scientific notation
            barcodeValue = barcodeValue.toFixed(0); // Convert to integer string
          }
          const productBarcode = barcodeValue.toString().trim();
          
          const productCategory = (row.category || row.Category || 'General').toString().trim();
          const stockQuantity = parseInt(row.stockQuantity || row.StockQuantity || row['Stock'] || row['Stock Quantity'] || 0);
          const productStatus = (row.status || row.Status || 'active').toString().trim().toLowerCase();
          const now = new Date().toISOString();

          // Validation: Check required fields
          if (!productName || productName === '') {
            errors.push({ 
              row: i + 2, // Excel row number (1-indexed + header)
              productName: productName || 'N/A',
              error: 'Product Name is required and cannot be blank' 
            });
            continue;
          }

          // Validation: Check if category is valid
          if (!validCategories.includes(productCategory)) {
            errors.push({ 
              row: i + 2,
              productName,
              category: productCategory,
              error: `Invalid category '${productCategory}'. Valid categories are: ${validCategories.join(', ')}` 
            });
            continue;
          }

          // Validation: Check if status is valid
          if (productStatus !== 'active' && productStatus !== 'inactive') {
            errors.push({ 
              row: i + 2,
              productName,
              status: productStatus,
              error: `Invalid status '${productStatus}'. Must be either 'active' or 'inactive'` 
            });
            continue;
          }

          // Check if product exists by name or barcode
          let existingProduct = null;
          if (productName) {
            existingProduct = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(productName);
          }
          if (!existingProduct && productBarcode) {
            existingProduct = db.prepare('SELECT * FROM products WHERE barcode = ?').get(productBarcode);
          }

          console.log(`Row ${i + 2}: Name="${productName}", Barcode="${productBarcode}", Exists=${!!existingProduct}`);

          if (existingProduct) {
            // Update existing product - replace all values with new values
            updateProduct.run(
              productName,
              productCategory,
              row.description || row.Description || '',
              productBarcode,
              parseFloat(row.unitPrice || row.UnitPrice || row['Unit Price'] || 0),
              parseFloat(row.costPrice || row.CostPrice || row['Cost Price'] || 0),
              stockQuantity,
              parseInt(row.lowStockAlert || row.LowStockAlert || row['Low Stock Alert'] || 10),
              now,
              existingProduct.productId
            );
            // Also update status if needed
            if (existingProduct.status !== productStatus) {
              db.prepare('UPDATE products SET status = ?, updatedAt = ? WHERE productId = ?').run(productStatus, now, existingProduct.productId);
            }
            updated++;
            imported++;
          } else {
            // Insert new product
            const newProductId = generateProductId();
            
            insertProduct.run(
              newProductId,
              productName,
              productCategory,
              row.description || row.Description || '',
              productBarcode,
              parseFloat(row.unitPrice || row.UnitPrice || row['Unit Price'] || 0),
              parseFloat(row.costPrice || row.CostPrice || row['Cost Price'] || 0),
              stockQuantity,
              parseInt(row.lowStockAlert || row.LowStockAlert || row['Low Stock Alert'] || 10),
              now,
              now
            );
            // Update status if not active
            if (productStatus !== 'active') {
              db.prepare('UPDATE products SET status = ? WHERE productId = ?').run(productStatus, newProductId);
            }
            inserted++;
            imported++;
          }
        } catch (err) {
          errors.push({ 
            row: i + 2,
            productName: row.name || row.Name || row['Product Name'] || 'N/A',
            error: err.message 
          });
        }
      }
    });

    transaction(data);

    // Build response message
    let message = `Successfully imported ${imported} products (${updated} updated, ${inserted} new)`;
    if (errors.length > 0) {
      message += `. ${errors.length} rows had errors`;
    }

    console.log(`Import Summary: Total=${data.length}, Updated=${updated}, Inserted=${inserted}, Errors=${errors.length}`);

    res.json({
      success: errors.length === 0 || imported > 0,
      message: message,
      data: { 
        imported, 
        updated,
        inserted,
        totalRows: data.length,
        errors: errors.length, 
        errorDetails: errors 
      }
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
    const products = db.prepare('SELECT * FROM products').all();
    
    // Get enabled categories from settings
    const settings = db.prepare('SELECT categories FROM settings WHERE id = 1').get();
    let categories = ['General'];
    if (settings && settings.categories) {
      const allCategories = JSON.parse(settings.categories);
      categories = allCategories
        .filter(cat => cat.enabled)
        .map(cat => cat.name);
      if (categories.length === 0) {
        categories = ['General'];
      }
    }

    // Create workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns (Product ID removed)
    worksheet.columns = [
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Barcode', key: 'barcode', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Unit Price', key: 'unitPrice', width: 12 },
      { header: 'Cost Price', key: 'costPrice', width: 12 },
      { header: 'Stock Quantity', key: 'stockQuantity', width: 15 },
      { header: 'Low Stock Alert', key: 'lowStockAlert', width: 15 },
      { header: 'Status', key: 'status', width: 12 }
    ];

    // Add product rows (Product ID removed)
    products.forEach(p => {
      worksheet.addRow({
        name: p.name,
        barcode: p.barcode || '',
        category: p.category,
        description: p.description,
        unitPrice: p.unitPrice,
        costPrice: p.costPrice,
        stockQuantity: p.stockQuantity,
        lowStockAlert: p.lowStockAlert,
        status: p.status
      });
    });

    // Format Barcode column as TEXT to prevent scientific notation
    worksheet.getColumn('barcode').numFmt = '@'; // @ means text format
    worksheet.getColumn('barcode').eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber > 1) { // Skip header
        cell.numFmt = '@';
        cell.alignment = { horizontal: 'left' };
      }
    });

    // Add data validation for Category column (column C now, since Product ID removed)
    worksheet.getColumn('category').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${categories.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid Category',
          error: `Please select a category from the list: ${categories.join(', ')}`
        };
      }
    });

    // Add data validation for Status column (column I - last column)
    worksheet.getColumn('status').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"active,inactive"'],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid Status',
          error: 'Please select either "active" or "inactive"'
        };
      }
    });

    // Apply validation to empty cells too (100 extra rows for new entries)
    for (let i = products.length + 2; i <= products.length + 102; i++) {
      // Format Barcode cell as text (column B now)
      const barcodeCell = worksheet.getCell(`B${i}`);
      barcodeCell.numFmt = '@';
      barcodeCell.alignment = { horizontal: 'left' };
      
      // Category dropdown validation (column C now)
      const categoryCell = worksheet.getCell(`C${i}`);
      categoryCell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${categories.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Invalid Category',
        error: `Please select a category from the list: ${categories.join(', ')}`
      };
      
      // Status dropdown validation (column I - last column)
      const statusCell = worksheet.getCell(`I${i}`);
      statusCell.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"active,inactive"'],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Invalid Status',
        error: 'Please select either "active" or "inactive"'
      };
    }

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

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
    // Get categories from settings (only enabled ones)
    const settings = db.prepare('SELECT categories FROM settings WHERE id = 1').get();
    
    let categories = [];
    if (settings && settings.categories) {
      const allCategories = JSON.parse(settings.categories);
      categories = allCategories
        .filter(cat => cat.enabled)
        .map(cat => cat.name);
    }
    
    // Fallback to 'General' if no categories found
    if (categories.length === 0) {
      categories = ['General'];
    }
    
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


export const printBarcode = async (req, res) => {
  try {
    const { barcode, quantity = 1 } = req.body;

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: 'Barcode is required'
      });
    }

    if (quantity < 1 || quantity > 100) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 100'
      });
    }

    // Get product details
    const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found with this barcode'
      });
    }

    // Get printer path from environment
    const printerPath = process.env.PRINTER_INTERFACE || '\\\\localhost\\MyPOS';
    
    console.log(`Printing ${quantity} QR label(s) to: ${printerPath}`);

    // ESC/POS commands for QR code label printing
    const ESC = '\x1B';
    const GS = '\x1D';
    
    let labelText = '';
    
    // Loop to print multiple labels based on quantity
    for (let i = 0; i < quantity; i++) {
      // Initialize printer
      labelText += ESC + '@'; // Initialize
      
      // Center alignment
      labelText += ESC + 'a' + '\x01'; // Center align
      
      // QR Code printing
      // Store QR code data
      const qrData = barcode;
      const qrDataLength = qrData.length;
      
      // QR Code: Model (GS ( k pL pH cn fn n)
      labelText += GS + '(' + 'k' + '\x04' + '\x00' + '\x31' + '\x41' + '\x32' + '\x00'; // Model 2
      
      // QR Code: Size (GS ( k pL pH cn fn n)
      labelText += GS + '(' + 'k' + '\x03' + '\x00' + '\x31' + '\x43' + '\x08'; // Size 8
      
      // QR Code: Error correction (GS ( k pL pH cn fn n)
      labelText += GS + '(' + 'k' + '\x03' + '\x00' + '\x31' + '\x45' + '\x30'; // Level L
      
      // QR Code: Store data
      const pL = (qrDataLength + 3) % 256;
      const pH = Math.floor((qrDataLength + 3) / 256);
      labelText += GS + '(' + 'k' + String.fromCharCode(pL) + String.fromCharCode(pH) + '\x31' + '\x50' + '\x30' + qrData;
      
      // QR Code: Print
      labelText += GS + '(' + 'k' + '\x03' + '\x00' + '\x31' + '\x51' + '\x30';
      
      labelText += '\n\n';
      
      // Product name (centered, truncate if too long)
      const productName = product.name.substring(0, 32);
      labelText += productName + '\n';
      
      // Price (centered)
      labelText += 'Price: Rs ' + Math.round(product.unitPrice) + '\n';
      
      // Divider
      labelText += '--------------------------------\n\n';
      
      // Add some space before next label
      if (i < quantity - 1) {
        labelText += '\n';
      }
    }
    
    // Cut paper after all labels
    labelText += GS + 'V' + '\x41' + '\x03'; // Cut
    
    const buffer = Buffer.from(labelText, 'ascii');

    // Write to printer
    fs.appendFile(printerPath, buffer, (err) => {
      if (err) {
        console.error('Print error:', err);
        return res.status(500).json({
          success: false,
          message: `Failed to print: ${err.message}. Check PRINTER_INTERFACE in .env file.`
        });
      }

      console.log(`Successfully sent ${quantity} QR label(s) to printer for product: ${product.name}`);
      
      res.json({
        success: true,
        message: `Successfully printed ${quantity} QR label(s)`,
        data: {
          barcode,
          quantity,
          productName: product.name
        }
      });
    });

  } catch (error) {
    console.error('Print barcode error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to print barcode',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
  getCategories,
  printBarcode
};
