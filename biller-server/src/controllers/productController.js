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
    
    console.log('[getAllProducts] Query params:', { category, status, search, page, limit });
    
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
        // Fallback to LIKE search (includes Hindi name)
        const searchPattern = `%${query}%`;
        let likeSearch = `
          SELECT * FROM products 
          WHERE (name LIKE ? OR nameHi LIKE ? OR productId LIKE ? OR barcode LIKE ? OR category LIKE ?)
        `;
        const likeParams = [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];

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

    // Parse metadata JSON and boolean fields for each product
    const productsWithMetadata = products.map(p => ({
      ...p,
      metadata: p.metadata ? JSON.parse(p.metadata) : {},
      isLooseItem: Boolean(p.isLooseItem),
      warrantyMonths: p.warrantyMonths || 0,
      nameHi: p.nameHi || null
    }));

    // Debug: Check total products in database
    const dbTotal = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const activeCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE status = ?').get('active');
    const inactiveCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE status = ?').get('inactive');
    console.log('[getAllProducts] DB stats - Total:', dbTotal.count, 'Active:', activeCount.count, 'Inactive:', inactiveCount.count);
    console.log('[getAllProducts] Returning', products.length, 'products, total count:', total);

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
        metadata: product.metadata ? JSON.parse(product.metadata) : {},
        isLooseItem: Boolean(product.isLooseItem),
        warrantyMonths: product.warrantyMonths || 0,
        nameHi: product.nameHi || null
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
        INSERT INTO products (productId, name, nameHi, category, description, barcode, unitPrice, costPrice, stockQuantity, lowStockAlert, imageUrl, status, metadata, isLooseItem, unit, warrantyMonths, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        productName,
        productData.nameHi || null,
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
        productData.isLooseItem ? 1 : 0,
        productData.unit || null,
        parseInt(productData.warrantyMonths) || 0,
        now,
        now
      );

      const newProduct = db.prepare('SELECT * FROM products WHERE productId = ?').get(productId);

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: {
          ...newProduct,
          isLooseItem: Boolean(newProduct.isLooseItem),
          warrantyMonths: newProduct.warrantyMonths || 0
        }
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
        nameHi = COALESCE(?, nameHi),
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
        isLooseItem = COALESCE(?, isLooseItem),
        unit = COALESCE(?, unit),
        warrantyMonths = COALESCE(?, warrantyMonths),
        updatedAt = ?
      WHERE productId = ?
    `).run(
      updates.name,
      updates.nameHi !== undefined ? updates.nameHi : null,
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
      updates.isLooseItem !== undefined ? (updates.isLooseItem ? 1 : 0) : null,
      updates.unit !== undefined ? updates.unit : null,
      updates.warrantyMonths !== undefined ? parseInt(updates.warrantyMonths) : null,
      now,
      id
    );

    const updatedProduct = db.prepare('SELECT * FROM products WHERE productId = ?').get(id);

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: {
        ...updatedProduct,
        isLooseItem: Boolean(updatedProduct.isLooseItem),
        warrantyMonths: updatedProduct.warrantyMonths || 0
      }
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

    // Strategy 4: Fallback to LIKE if FTS returns nothing (handles special chars, partial matches, Hindi names)
    if (results.length === 0) {
      const searchPattern = `%${query}%`;
      results = db.prepare(`
        SELECT * FROM products 
        WHERE status = 'active' 
          AND (name LIKE ? OR nameHi LIKE ? OR productId LIKE ? OR barcode LIKE ? OR category LIKE ?)
        ORDER BY 
          CASE 
            WHEN barcode LIKE ? THEN 1
            WHEN productId LIKE ? THEN 2
            WHEN name LIKE ? THEN 3
            WHEN nameHi LIKE ? THEN 4
            ELSE 5
          END
        LIMIT 15
      `).all(
        searchPattern, searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, `${query}%`, `${query}%`
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

    console.log(`Excel import: Found ${data.length} rows in file`);

    // Get enabled categories from settings for validation
    const settings = db.prepare('SELECT categories, applicationType FROM settings WHERE id = 1').get();
    const isHotelMode = settings && settings.applicationType === 'hotel';
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
      INSERT INTO products (productId, name, nameHi, category, description, barcode, unitPrice, costPrice, stockQuantity, lowStockAlert, status, isLooseItem, unit, warrantyMonths, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `);

    const updateProduct = db.prepare(`
      UPDATE products 
      SET name = ?, nameHi = ?, category = ?, description = ?, barcode = ?, unitPrice = ?, costPrice = ?, stockQuantity = ?, lowStockAlert = ?, isLooseItem = ?, unit = ?, warrantyMonths = ?, updatedAt = ? 
      WHERE productId = ?
    `);

    const transaction = db.transaction((rows) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Log first few rows to debug column mapping
          if (i < 3) {
            console.log(`Row ${i + 2} raw data:`, JSON.stringify(row, null, 2));
          }
          
          const productName = (row.name || row.Name || row['Product Name'] || '').toString().trim();
          
          // Handle barcode - convert from number/scientific notation if needed
          // For hotel mode, use empty string
          let barcodeValue = isHotelMode ? '' : (row.barcode || row.Barcode || row['Barcode'] || '');
          if (typeof barcodeValue === 'number') {
            // Convert number to string, handling scientific notation
            barcodeValue = barcodeValue.toFixed(0); // Convert to integer string
          }
          const productBarcode = barcodeValue.toString().trim();
          
          let productCategory = (row.category || row.Category || 'General').toString().trim();
          
          // For hotel mode, use default stock value of 9999
          const stockQuantity = isHotelMode ? 9999 : parseInt(row.stockQuantity || row.StockQuantity || row['Stock'] || row['Stock Quantity'] || 0);
          
          // Handle status more carefully - check if column exists and has value
          let productStatus = 'active'; // Default
          const statusValue = row.status || row.Status;
          if (statusValue !== undefined && statusValue !== null && statusValue !== '') {
            productStatus = statusValue.toString().trim().toLowerCase();
          }
          
          console.log(`Row ${i + 2}: ${productName} - Status from Excel: '${statusValue}' -> Processed: '${productStatus}'`);
          
          const now = new Date().toISOString();

          // Validation: Check required fields
          if (!productName || productName === '') {
            console.log(`Row ${i + 2}: Skipping - Product Name is required and cannot be blank`);
            errors.push({ 
              row: i + 2, // Excel row number (1-indexed + header)
              productName: productName || 'N/A',
              error: 'Product Name is required and cannot be blank' 
            });
            continue;
          }

          console.log(`Row ${i + 2}: Processing ${productName}, Category: ${productCategory}, Status: ${productStatus}`);

          // Validation: Check if category is valid
          if (!validCategories.includes(productCategory)) {
            // For hotel mode, be more lenient - just log a warning but allow the import
            if (isHotelMode) {
              console.log(`Row ${i + 2}: Category '${productCategory}' not enabled. Using 'General' instead for product: ${productName}`);
              // Use General category as fallback
              errors.push({ 
                row: i + 2,
                productName,
                category: productCategory,
                warning: `Category '${productCategory}' not enabled. Using 'General' instead.`
              });
              // Override category
              productCategory = 'General';
            } else {
              console.log(`Row ${i + 2}: Invalid category '${productCategory}' for ${productName}. Valid: ${validCategories.join(', ')}. Defaulting to 'General'.`);
              errors.push({ 
                row: i + 2,
                productName,
                category: productCategory,
                warning: `Invalid category '${productCategory}'. Using 'General'. Valid categories are: ${validCategories.join(', ')}` 
              });
              // Use General as fallback instead of rejecting
              productCategory = 'General';
            }
          }

          // Validation: Check if status is valid
          if (productStatus !== 'active' && productStatus !== 'inactive') {
            console.log(`Row ${i + 2}: Invalid status '${productStatus}' for ${productName}, defaulting to 'active'`);
            productStatus = 'active'; // Force to active instead of rejecting
          }

          // Check if product exists by name or barcode
          let existingProduct = null;
          if (productName) {
            existingProduct = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(productName);
          }
          if (!existingProduct && productBarcode) {
            existingProduct = db.prepare('SELECT * FROM products WHERE barcode = ?').get(productBarcode);
          }

          // Parse loose item fields (for grocery mode)
          const isLooseItemValue = (row.isLooseItem || row.IsLooseItem || row['Is Loose Item'] || 'No').toString().trim().toLowerCase();
          const isLooseItem = isLooseItemValue === 'yes' || isLooseItemValue === '1' || isLooseItemValue === 'true' ? 1 : 0;
          const unit = (row.unit || row.Unit || 'pcs').toString().trim();

          // Parse warranty months (for electronics mode)
          const warrantyMonths = parseInt(row.warrantyMonths || row.WarrantyMonths || row['Warranty (Months)'] || row['Warranty'] || 0) || 0;

          // Parse Hindi name (optional)
          const productNameHi = (row.nameHi || row.NameHi || row['Name (Hindi)'] || row['Product Name (Hindi)'] || '').toString().trim() || null;

          if (existingProduct) {
            // Update existing product - replace all values with new values
            updateProduct.run(
              productName,
              productNameHi,
              productCategory,
              row.description || row.Description || '',
              productBarcode,
              parseFloat(row.unitPrice || row.UnitPrice || row['Unit Price'] || 0),
              isHotelMode ? 0 : parseFloat(row.costPrice || row.CostPrice || row['Cost Price'] || 0),
              stockQuantity,
              isHotelMode ? 0 : parseInt(row.lowStockAlert || row.LowStockAlert || row['Low Stock Alert'] || 10),
              isLooseItem,
              unit,
              warrantyMonths,
              now,
              existingProduct.productId
            );
            // Always update status to ensure consistency
            db.prepare('UPDATE products SET status = ?, updatedAt = ? WHERE productId = ?').run(productStatus, now, existingProduct.productId);
            console.log(`Updated product ${productName} (${existingProduct.productId}) - Status: ${existingProduct.status} -> ${productStatus}`);
            updated++;
            imported++;
          } else {
            // Insert new product
            const newProductId = generateProductId();
            
            insertProduct.run(
              newProductId,
              productName,
              productNameHi,
              productCategory,
              row.description || row.Description || '',
              productBarcode,
              parseFloat(row.unitPrice || row.UnitPrice || row['Unit Price'] || 0),
              isHotelMode ? 0 : parseFloat(row.costPrice || row.CostPrice || row['Cost Price'] || 0),
              stockQuantity,
              isHotelMode ? 0 : parseInt(row.lowStockAlert || row.LowStockAlert || row['Low Stock Alert'] || 10),
              isLooseItem,
              unit,
              warrantyMonths,
              now,
              now
            );
            // Always set status for new products
            db.prepare('UPDATE products SET status = ? WHERE productId = ?').run(productStatus, newProductId);
            console.log(`Inserted new product ${productName} (${newProductId}) - Status: ${productStatus}`);
            inserted++;
            imported++;
          }
        } catch (err) {
          console.error(`Error importing row ${i + 2}:`, err);
          errors.push({ 
            row: i + 2,
            productName: row.name || row.Name || row['Product Name'] || 'N/A',
            error: err.message 
          });
        }
      }
    });

    transaction(data);

    // Verify final counts after transaction
    const finalStats = {
      total: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
      active: db.prepare('SELECT COUNT(*) as count FROM products WHERE status = ?').get('active').count,
      inactive: db.prepare('SELECT COUNT(*) as count FROM products WHERE status = ?').get('inactive').count
    };

    console.log(`Import completed: ${imported} imported, ${updated} updated, ${inserted} inserted, ${errors.length} errors`);
    console.log('Final DB stats:', finalStats);
    if (errors.length > 0) {
      console.log('Import errors:', errors);
    }

    // Build response message
    let message = `Successfully imported ${imported} products (${updated} updated, ${inserted} new)`;
    if (errors.length > 0) {
      const actualErrors = errors.filter(e => e.error);
      const warnings = errors.filter(e => e.warning);
      if (actualErrors.length > 0) {
        message += `. ${actualErrors.length} rows had errors`;
      }
      if (warnings.length > 0) {
        message += `. ${warnings.length} warnings`;
      }
    }

    res.json({
      success: errors.filter(e => e.error).length === 0 || imported > 0,
      message: message,
      data: { 
        imported, 
        updated,
        inserted,
        totalRows: data.length,
        errors: errors.filter(e => e.error).length, 
        warnings: errors.filter(e => e.warning).length,
        errorDetails: errors,
        finalStats: finalStats
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
    const settings = db.prepare('SELECT categories, units, applicationType FROM settings WHERE id = 1').get();
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

    // Get units for grocery mode
    let units = ['pcs', 'kg', 'g', 'ltr', 'ml'];
    if (settings && settings.units) {
      const allUnits = JSON.parse(settings.units);
      units = allUnits.map(u => u.symbol);
    }

    const isGroceryMode = settings && settings.applicationType === 'grocery';
    const isElectronicsMode = settings && settings.applicationType === 'electronics';
    const isHotelMode = settings && settings.applicationType === 'hotel';

    // Create workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns - exclude stock/cost fields for hotel mode
    const columns = [
      { header: isHotelMode ? 'Product Name' : 'Product Name *', key: 'name', width: 30 },
      { header: 'Name (Hindi)', key: 'nameHi', width: 30 }
    ];
    
    // Add barcode only for non-hotel modes
    if (!isHotelMode) {
      columns.push({ header: 'Barcode', key: 'barcode', width: 20 });
    }
    
    columns.push(
      { header: 'Category *', key: 'category', width: 20 },
      { header: 'Description', key: 'description', width: 40 },
      { header: isHotelMode ? 'Unit Price' : 'Unit Price *', key: 'unitPrice', width: 12 }
    );
    
    // Add cost price and stock fields only for non-hotel modes
    if (!isHotelMode) {
      columns.push(
        { header: 'Cost Price', key: 'costPrice', width: 12 },
        { header: 'Stock Quantity *', key: 'stockQuantity', width: 15 },
        { header: 'Low Stock Alert', key: 'lowStockAlert', width: 15 }
      );
    }
    
    columns.push({ header: 'Status', key: 'status', width: 12 });

    // Add loose item columns for grocery mode
    if (isGroceryMode) {
      columns.push({ header: 'Is Loose Item', key: 'isLooseItem', width: 15 });
      columns.push({ header: 'Unit', key: 'unit', width: 10 });
    }

    // Add warranty column for electronics mode
    if (isElectronicsMode) {
      columns.push({ header: 'Warranty (Months)', key: 'warrantyMonths', width: 18 });
    }

    worksheet.columns = columns;

    // Add instruction row at the top (only for non-hotel modes)
    if (!isHotelMode) {
      worksheet.insertRow(1, ['Fields marked with * are required. Stock Quantity must be provided for all products.']);
      worksheet.mergeCells('A1:' + worksheet.getColumn(columns.length).letter + '1');
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FF0000FF' } };
      worksheet.getRow(1).alignment = { horizontal: 'center' };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE0' }
      };
    }

    // Add product rows
    products.forEach(p => {
      const row = {
        name: p.name,
        nameHi: p.nameHi || '',
        category: p.category,
        description: p.description,
        unitPrice: p.unitPrice,
        status: p.status
      };
      
      // Add barcode only for non-hotel modes
      if (!isHotelMode) {
        row.barcode = p.barcode || '';
      }
      
      // Add cost price and stock fields only for non-hotel modes
      if (!isHotelMode) {
        row.costPrice = p.costPrice;
        row.stockQuantity = p.stockQuantity;
        row.lowStockAlert = p.lowStockAlert;
      }
      
      if (isGroceryMode) {
        row.isLooseItem = p.isLooseItem ? 'Yes' : 'No';
        row.unit = p.unit || 'pcs';
      }

      if (isElectronicsMode) {
        row.warrantyMonths = p.warrantyMonths || 0;
      }
      
      worksheet.addRow(row);
    });

    // Determine header row number (instruction row is added for non-hotel modes)
    const headerRowNum = isHotelMode ? 1 : 2;

    // Format Barcode column as TEXT to prevent scientific notation (only if not hotel mode)
    if (!isHotelMode) {
      worksheet.getColumn('barcode').numFmt = '@'; // @ means text format
      worksheet.getColumn('barcode').eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber > headerRowNum) { // Skip instruction and header rows
          cell.numFmt = '@';
          cell.alignment = { horizontal: 'left' };
        }
      });
    }

    // Add data validation for Category column (column C now, since Product ID removed)
    worksheet.getColumn('category').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > headerRowNum) { // Skip instruction and header rows
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
      if (rowNumber > headerRowNum) { // Skip instruction and header rows
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

    // Add validation for grocery-specific columns
    if (isGroceryMode) {
      // Is Loose Item column validation
      worksheet.getColumn('isLooseItem').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > headerRowNum) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae: ['"Yes,No"'],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Invalid Value',
            error: 'Please select either "Yes" or "No"'
          };
        }
      });

      // Unit column validation
      worksheet.getColumn('unit').eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > headerRowNum) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${units.join(',')}"`],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Invalid Unit',
            error: `Please select a unit from the list: ${units.join(', ')}`
          };
        }
      });
    }

    // Apply validation to empty cells too (100 extra rows for new entries)
    const startRow = (isHotelMode ? products.length + 2 : products.length + 3);
    for (let i = startRow; i <= startRow + 100; i++) {
      // Format Barcode cell as text (only for non-hotel modes)
      if (!isHotelMode) {
        const barcodeCell = worksheet.getColumn('barcode').letter + i;
        const cell = worksheet.getCell(barcodeCell);
        cell.numFmt = '@';
        cell.alignment = { horizontal: 'left' };
      }
      
      // Category dropdown validation - use dynamic column reference
      const categoryCell = worksheet.getColumn('category').letter + i;
      worksheet.getCell(categoryCell).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${categories.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Invalid Category',
        error: `Please select a category from the list: ${categories.join(', ')}`
      };
      
      // Status dropdown validation - use dynamic column reference
      const statusCell = worksheet.getColumn('status').letter + i;
      worksheet.getCell(statusCell).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"active,inactive"'],
        showErrorMessage: true,
        errorStyle: 'error',
        errorTitle: 'Invalid Status',
        error: 'Please select either "active" or "inactive"'
      };
      worksheet.getCell(statusCell).value = 'active'; // Default value
      
      // Add default values for non-hotel modes
      if (!isHotelMode) {
        // Default category
        const categoryCell = worksheet.getColumn('category').letter + i;
        worksheet.getCell(categoryCell).value = 'General';
        
        // Default stock quantity (0 for now, user must fill)
        const stockCell = worksheet.getColumn('stockQuantity').letter + i;
        worksheet.getCell(stockCell).value = 0;
        
        // Default cost price
        const costCell = worksheet.getColumn('costPrice').letter + i;
        worksheet.getCell(costCell).value = 0;
        
        // Default low stock alert
        const lowStockCell = worksheet.getColumn('lowStockAlert').letter + i;
        worksheet.getCell(lowStockCell).value = 10;
      }
      
      // Add grocery-specific validations for empty rows
      if (isGroceryMode) {
        // Is Loose Item validation - use dynamic column reference
        const looseItemCell = worksheet.getColumn('isLooseItem').letter + i;
        worksheet.getCell(looseItemCell).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"Yes,No"'],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid Value',
          error: 'Please select either "Yes" or "No"'
        };
        worksheet.getCell(looseItemCell).value = 'No'; // Default value

        // Unit validation - use dynamic column reference
        const unitCell = worksheet.getColumn('unit').letter + i;
        worksheet.getCell(unitCell).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${units.join(',')}"`],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid Unit',
          error: `Please select a unit from the list: ${units.join(', ')}`
        };
        worksheet.getCell(unitCell).value = 'pcs'; // Default value
      }
    }

    // Style the header row
    worksheet.getRow(headerRowNum).font = { bold: true };
    worksheet.getRow(headerRowNum).fill = {
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
