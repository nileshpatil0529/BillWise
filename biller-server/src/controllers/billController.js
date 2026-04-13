import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import db from '../config/database.js';
import { emitBillCreated, emitBillUpdate, emitKOTPrinted, emitTableUpdate, emitBillDeleted } from '../sockets/index.js';

// Generate bill number (should be called inside transaction for thread safety)
const generateBillNumber = () => {
  const date = new Date();
  const prefix = 'INV';
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Find the highest bill number for today using MAX
  const result = db.prepare(`
    SELECT billNumber FROM bills 
    WHERE billNumber LIKE ?
    ORDER BY billNumber DESC
    LIMIT 1
  `).get(`${prefix}${dateStr}%`);
  
  let nextNumber = 1;
  if (result?.billNumber) {
    // Extract the sequence number from the last bill number
    const lastSequence = parseInt(result.billNumber.slice(-4), 10);
    nextNumber = lastSequence + 1;
  }
  
  return `${prefix}${dateStr}${nextNumber.toString().padStart(4, '0')}`;
};

export const getAllBills = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      paymentMethod, 
      paymentStatus,
      page = 1, 
      limit = 50 
    } = req.query;

    let query = 'SELECT * FROM bills WHERE 1=1';
    const params = [];

    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(endDate);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      query += ' AND paymentMethod = ?';
      params.push(paymentMethod);
    }

    if (paymentStatus && paymentStatus !== 'all') {
      query += ' AND paymentStatus = ?';
      params.push(paymentStatus);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.prepare(countQuery).get(...params);
    const total = totalResult.count;

    // Add sorting and pagination
    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    const offset = (page - 1) * limit;
    params.push(parseInt(limit), offset);

    const bills = db.prepare(query).all(...params);

    // Get items for each bill
    const billsWithItems = bills.map(bill => {
      const items = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(bill.billId);
      return {
        ...bill,
        items,
        businessTypeData: bill.businessTypeData ? JSON.parse(bill.businessTypeData) : {}
      };
    });

    res.json({
      success: true,
      data: {
        bills: billsWithItems,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bills'
    });
  }
};

export const getBillById = async (req, res) => {
  try {
    const { id } = req.params;
    const bill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(id);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    // Get items for this bill
    const items = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(id);

    res.json({
      success: true,
      data: {
        ...bill,
        items,
        businessTypeData: bill.businessTypeData ? JSON.parse(bill.businessTypeData) : {}
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bill'
    });
  }
};

export const createBill = async (req, res) => {
  try {
    const billData = req.body;
    
    const billId = uuidv4();
    const now = new Date().toISOString();

    // Validate items
    if (!billData.items || billData.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items provided in bill'
      });
    }

    // Calculate totals
    let subtotal = 0;
    let taxTotal = 0;

    const items = billData.items.map(item => {
      const itemTotal = item.unitPrice * item.quantity;
      subtotal += itemTotal;

      return {
        ...item,
        itemTotal,
        finalTotal: itemTotal
      };
    });

    // Apply bill-level discount (in rupees)
    const discountTotal = billData.billDiscount || 0;
    
    // Calculate tax on discounted amount (only if tax is enabled)
    const taxableAmount = subtotal - discountTotal;
    const taxEnabled = billData.taxEnabled !== false;
    
    if (taxEnabled) {
      const taxRate = billData.taxRate || 0;
      taxTotal = (taxableAmount * taxRate) / 100;
    }

    const grandTotal = subtotal - discountTotal + taxTotal;
    const amountPaid = billData.paymentMethod === 'debt' 
      ? (parseFloat(billData.amountPaid) || 0) 
      : (parseFloat(billData.amountPaid) || grandTotal);

    // Hotel mode specific
    const billStatus = billData.billStatus || 'completed';
    const tableId = billData.tableId || null;
    const kotPrintedAt = billData.kotItems?.length > 0 ? now : null;
    const tipAmount = billData.tipAmount || 0;

    // Use transaction for inserting bill and items
    const insertBillAndItems = db.transaction(() => {
      // Generate bill number inside transaction to prevent race conditions
      const billNumber = generateBillNumber();
      
      // Insert bill
      db.prepare(`
        INSERT INTO bills (billId, billNumber, subtotal, discountTotal, taxTotal, grandTotal, paymentMethod, paymentStatus, amountPaid, change, customerName, customerPhone, businessTypeData, notes, createdBy, createdAt, updatedAt, billStatus, tableId, kotPrintedAt, tipAmount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        billId,
        billNumber,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        billData.paymentMethod || 'cash',
        billData.paymentStatus || 'paid',
        amountPaid,
        amountPaid - grandTotal,
        billData.customerName || '',
        billData.customerPhone || '',
        JSON.stringify(billData.businessTypeData || {}),
        billData.notes || '',
        req.user?.uid || 'system',
        now,
        now,
        billStatus,
        tableId,
        kotPrintedAt,
        tipAmount
      );

      // Get settings to check if stock tracking is enabled
      const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
      const isHotelMode = settings?.applicationType === 'hotel';

      // Insert items
      const insertItem = db.prepare(`
        INSERT INTO bill_items (billId, productId, name, quantity, unitPrice, itemTotal, finalTotal, kotPrinted, kotPrintedQuantity, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Always insert with kotPrinted=0, printKOT will mark them after printing
      for (const item of items) {
        insertItem.run(
          billId,
          item.productId || '',
          item.name,
          item.quantity,
          item.unitPrice,
          item.itemTotal,
          item.finalTotal,
          0,  // Always 0, will be marked by printKOT endpoint
          0,  // kotPrintedQuantity starts at 0
          item.note || null
        );

        // Update product stock if productId exists (skip for hotel mode)
        if (item.productId && !isHotelMode) {
          db.prepare('UPDATE products SET stockQuantity = stockQuantity - ? WHERE productId = ?')
            .run(item.quantity, item.productId);
        }
      }
    });

    insertBillAndItems();

    // Fetch created bill with items
    const createdBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    const billItems = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(billId);

    const createdBillData = {
      ...createdBill,
      items: billItems,
      businessTypeData: JSON.parse(createdBill.businessTypeData || '{}')
    };

    // Emit WebSocket events for real-time updates
    emitBillCreated(createdBillData);
    if (tableId) {
      emitTableUpdate({ tableId, billId, billStatus });
    }

    res.status(201).json({
      success: true,
      message: 'Bill created successfully',
      data: createdBillData
    });
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create bill'
    });
  }
};

export const updateBill = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const bill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(id);
    
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    const now = new Date().toISOString();

    // Handle hotel mode updates
    if (updates.billStatus !== undefined || updates.kotItems !== undefined || updates.items !== undefined) {
      // Update bill status and KOT fields
      if (updates.billStatus) {
        db.prepare('UPDATE bills SET billStatus = ?, updatedAt = ? WHERE billId = ?')
          .run(updates.billStatus, now, id);
        
        // If bill is being completed and has a table, mark table as available
        if (updates.billStatus === 'completed' && bill.tableId) {
          try {
            db.prepare('UPDATE restaurant_tables SET status = ?, currentBillId = NULL WHERE id = ?')
              .run('available', bill.tableId);
            console.log('✅ Table marked as available after bill completion:', bill.tableId);
          } catch (tableError) {
            console.log('⚠️ Could not update table status (table might not exist):', tableError.message);
          }
        }
      }

      // Handle items update - Replace all items with new cart state
      if (updates.items !== undefined) {
        // Get settings to check if stock tracking is enabled
        const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
        const isHotelMode = settings?.applicationType === 'hotel';
        
        // Get existing items before deletion
        const existingItems = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(id);
        
        // Build a map of existing items with their quantities and kotPrinted status
        const existingItemsMap = {};
        existingItems.forEach(item => {
          existingItemsMap[item.productId] = {
            quantity: item.quantity,
            kotPrinted: item.kotPrinted || 0,
            kotPrintedQuantity: item.kotPrintedQuantity || 0
          };
        });
        
        // Restore stock for all existing items (skip for hotel mode)
        if (!isHotelMode) {
          for (const existingItem of existingItems) {
            if (existingItem.productId) {
              db.prepare('UPDATE products SET stockQuantity = stockQuantity + ? WHERE productId = ?')
                .run(existingItem.quantity, existingItem.productId);
            }
          }
        }
        
        // Delete all existing items for this bill (will be replaced with current cart state)
        db.prepare('DELETE FROM bill_items WHERE billId = ?').run(id);

        // Insert all items from current cart with correct quantities
        if (updates.items.length > 0) {
          const insertItem = db.prepare(`
            INSERT INTO bill_items (billId, productId, name, quantity, unitPrice, itemTotal, finalTotal, kotPrinted, kotPrintedQuantity, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const item of updates.items) {
            const itemTotal = item.unitPrice * item.quantity;
            const existingItem = existingItemsMap[item.productId];
            
            // Preserve kotPrintedQuantity to track what was already sent to kitchen
            let kotPrintedStatus = 0;
            let kotPrintedQty = 0;
            if (existingItem) {
              // Preserve the quantity that was already printed
              kotPrintedQty = existingItem.kotPrintedQuantity || 0;
              // If quantity unchanged and was fully printed, keep kotPrinted=1
              if (existingItem.kotPrinted === 1 && item.quantity === existingItem.quantity) {
                kotPrintedStatus = 1;
              }
            }
            
            insertItem.run(id, item.productId || '', item.name, item.quantity, item.unitPrice, itemTotal, itemTotal, kotPrintedStatus, kotPrintedQty, item.note || null);
            
            // Deduct stock for new quantities (skip for hotel mode)
            if (item.productId && !isHotelMode) {
              db.prepare('UPDATE products SET stockQuantity = stockQuantity - ? WHERE productId = ?')
                .run(item.quantity, item.productId);
            }
          }
        }

        // Recalculate totals based on new items
        const allItems = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(id);
        let subtotal = 0;
        for (const item of allItems) {
          subtotal += item.itemTotal;
        }
        const grandTotal = subtotal; // Add tax/discount logic if needed
        
        db.prepare('UPDATE bills SET subtotal = ?, grandTotal = ?, updatedAt = ? WHERE billId = ?')
          .run(subtotal, grandTotal, now, id);
      }
      
      // Note: kotItems marking is handled by printKOT endpoint after successful printing
    }

    // Update other allowed fields
    const allowedUpdates = ['paymentStatus', 'paymentMethod', 'amountPaid', 'notes', 'customerName', 'customerPhone', 'tipAmount'];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        db.prepare(`UPDATE bills SET ${key} = ?, updatedAt = ? WHERE billId = ?`)
          .run(updates[key], now, id);
      }
    }

    const updatedBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(id);
    const items = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(id);

    const billData = {
      ...updatedBill,
      items,
      businessTypeData: updatedBill.businessTypeData ? JSON.parse(updatedBill.businessTypeData) : {}
    };

    // Emit WebSocket event for real-time updates
    emitBillUpdate(billData);
    if (updatedBill.tableId) {
      // If bill is completed, emit table-updated with status 'available'
      if (updatedBill.billStatus === 'completed') {
        emitTableUpdate({ 
          tableId: updatedBill.tableId, 
          billId: null, 
          status: 'available',
          billStatus: 'completed' 
        });
      } else {
        emitTableUpdate({ 
          tableId: updatedBill.tableId, 
          billId: updatedBill.billId, 
          billStatus: updatedBill.billStatus 
        });
      }
    }

    res.json({
      success: true,
      message: 'Bill updated successfully',
      data: billData
    });
  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update bill'
    });
  }
};

export const getReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = 'SELECT * FROM bills WHERE 1=1';
    const params = [];

    if (startDate) {
      query += ' AND createdAt >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND createdAt <= ?';
      params.push(endDate);
    }

    const bills = db.prepare(query).all(...params);

    // Get items for each bill
    const billsWithItems = bills.map(bill => {
      const items = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(bill.billId);
      return { ...bill, items };
    });

    // Calculate summary
    const summary = {
      totalSales: 0,
      totalBills: billsWithItems.length,
      cashSales: 0,
      cardSales: 0,
      onlineSales: 0,
      debtAmount: 0,
      debtPaid: 0,
      averageBillValue: 0,
      totalDiscount: 0,
      totalTax: 0
    };

    const paymentMethodCounts = {
      cash: 0,
      card: 0,
      online: 0,
      debt: 0
    };

    billsWithItems.forEach(bill => {
      summary.totalSales += bill.grandTotal;
      summary.totalDiscount += bill.discountTotal;
      summary.totalTax += bill.taxTotal;

      paymentMethodCounts[bill.paymentMethod] = (paymentMethodCounts[bill.paymentMethod] || 0) + 1;

      switch (bill.paymentMethod) {
        case 'cash':
          summary.cashSales += bill.grandTotal;
          break;
        case 'card':
          summary.cardSales += bill.grandTotal;
          break;
        case 'online':
          summary.onlineSales += bill.grandTotal;
          break;
        case 'debt':
          if (bill.paymentStatus === 'paid') {
            summary.debtPaid += bill.grandTotal;
          } else if (bill.paymentStatus === 'partial') {
            summary.debtPaid += bill.amountPaid || 0;
            summary.debtAmount += bill.grandTotal - (bill.amountPaid || 0);
          } else {
            summary.debtAmount += bill.grandTotal;
          }
          break;
      }
    });

    summary.averageBillValue = summary.totalBills > 0 
      ? summary.totalSales / summary.totalBills 
      : 0;

    // Daily sales trend (last 7 days)
    const dailySales = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      
      const daySales = billsWithItems
        .filter(b => b.createdAt.slice(0, 10) === dateStr)
        .reduce((sum, b) => sum + b.grandTotal, 0);
      
      dailySales.push({
        date: dateStr,
        sales: daySales
      });
    }

    // Top selling products
    const productSales = {};
    billsWithItems.forEach(bill => {
      bill.items.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            productId: item.productId,
            name: item.name,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[item.productId].quantity += item.quantity;
        productSales[item.productId].revenue += item.finalTotal;
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        summary,
        paymentMethodCounts,
        dailySales,
        topProducts
      }
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report'
    });
  }
};

// Print bill to thermal printer
export const printBill = async (req, res) => {
  try {
    const { billId } = req.body;

    if (!billId) {
      return res.status(400).json({
        success: false,
        message: 'Bill ID is required'
      });
    }

    // Get bill details with all information
    const bill = db.prepare(`
      SELECT * FROM bills WHERE billId = ?
    `).get(billId);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    // Get bill items from bill_items table
    const billItems = db.prepare(`
      SELECT bi.*, p.nameHi, p.isLooseItem FROM bill_items bi
      LEFT JOIN products p ON bi.productId = p.productId
      WHERE bi.billId = ?
    `).all(billId);

    // Get business settings
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    
    // Currency symbol
    const currencySymbol = 'Rs.';

    // Get printer path from environment
    const printerPath = process.env.PRINTER_INTERFACE || '\\\\localhost\\MyPOS';

    // ESC/POS commands for receipt printing
    const ESC = '\x1B';
    const GS = '\x1D';
    
    let receiptText = '';
    
    // Initialize printer
    receiptText += ESC + '@'; // Initialize
    
    // Header - Business Name (Center, Bold, Double Size)
    receiptText += ESC + 'a' + '\x01'; // Center align
    receiptText += ESC + 'E' + '\x01'; // Bold on
    receiptText += GS + '!' + '\x11'; // Double height & width
    receiptText += (settings?.businessName || 'My Business') + '\n';
    receiptText += GS + '!' + '\x00'; // Normal size
    receiptText += ESC + 'E' + '\x00'; // Bold off
    receiptText += '\n'; // Space after business name
    
    // Business Details (Center, normal font)
    if (settings?.address) {
      receiptText += 'Address: ' + settings.address + '\n';
    }
    if (settings?.taxNumber) {
      receiptText += 'GST No: ' + settings.taxNumber + '\n';
    }
    if (settings?.phone) {
      receiptText += 'Phone: ' + settings.phone + '\n';
    }
    let businessTypeData = {};
    try {
      businessTypeData = bill.businessTypeData ? JSON.parse(bill.businessTypeData) : {};
    } catch (e) {
      // Ignore parse errors
    }
    
    // Bill details (Left align)
    receiptText += ESC + 'a' + '\x00'; // Left align
    receiptText += '\n';
    receiptText += 'Date: ' + new Date(bill.createdAt).toLocaleString('en-IN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }) + '\n';
    
    // Bill Number (last 5 digits only)
    const billNumShort = bill.billNumber.toString().slice(-5);
    receiptText += 'Bill: ' + billNumShort + '\n';
    
    if (businessTypeData.tableNumber) {
      receiptText += 'Table: ' + businessTypeData.tableNumber + '\n';
    }
    
    // Dotted divider line
    receiptText += '................................\n';
    
    // Check if Hindi language is selected for receipts
    const isHindi = settings?.receiptLanguage === 'hi';
    
    // Items header - 3 columns: Name, Qty, Price
    receiptText += ESC + 'a' + '\x00'; // Left align
    const headerName = 'Name'.padEnd(18);
    const headerQty = 'Qty'.padStart(4);
    const headerPrice = 'Price'.padStart(8);
    receiptText += headerName + headerQty + headerPrice + '\n';
    
    // Items list
    if (billItems && billItems.length > 0) {
      billItems.forEach(item => {
        // Use Hindi name if available and Hindi is selected, otherwise use English name
        const displayName = (isHindi && item.nameHi) ? item.nameHi : (item.name || 'Unknown');
        // Format quantity with 2 decimals for loose items, otherwise show as integer
        const qty = item.isLooseItem ? (item.quantity || 0).toFixed(2) : Math.round(item.quantity || 0).toString();
        const price = (item.unitPrice || 0).toFixed(2);
        
        // If name is longer than 18 chars, wrap to next line
        if (displayName.length > 18) {
          receiptText += displayName.substring(0, 18) + '\n';
          receiptText += displayName.substring(18, 36).padEnd(18);
        } else {
          receiptText += displayName.padEnd(18);
        }
        
        receiptText += qty.padStart(4) + price.padStart(8) + '\n';
      });
    } else {
      receiptText += '    No items found\n';
    }
    
    // Dotted divider line
    receiptText += '................................\n';
    
    // Totals section (normal font, right aligned)
    const subtotal = bill.subtotal.toFixed(2);
    const totalLabel = 'Total:';
    const totalAmount = currencySymbol + ' ' + subtotal;
    const totalLine = totalLabel + totalAmount.padStart(32 - totalLabel.length);
    receiptText += totalLine + '\n';
    
    if (bill.taxTotal > 0) {
      const tax = bill.taxTotal.toFixed(2);
      const taxRate = settings?.taxRates?.[0]?.rate || 5;
      const taxLabel = `Tax (${taxRate}%):`;
      const taxAmount = currencySymbol + ' ' + tax;
      const taxLine = taxLabel + taxAmount.padStart(32 - taxLabel.length);
      receiptText += taxLine + '\n';
    }
    
    // Grand Total (Bold, same font size as other text)
    receiptText += '\n';
    receiptText += ESC + 'E' + '\x01'; // Bold on
    const grandTotalAmount = bill.grandTotal.toFixed(2);
    const grandTotalLine = 'Grand Total:' + (currencySymbol + ' ' + grandTotalAmount).padStart(20);
    receiptText += grandTotalLine + '\n';
    receiptText += ESC + 'E' + '\x00'; // Bold off
    
    // Dotted divider line
    receiptText += '\n';
    receiptText += '................................\n';
    
    // Footer (Center)
    receiptText += ESC + 'a' + '\x01'; // Center align
    receiptText += '\n';
    
    // QR Code for online/UPI payments
    if ((bill.paymentMethod === 'upi' || bill.paymentMethod === 'online') && settings?.upiId) {
      // QR code with payment amount - using UPI payment string format
      const upiString = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings?.businessName || 'My Business')}&am=${bill.grandTotal.toFixed(2)}&cu=INR`;
      
      // ESC/POS QR Code commands
      // Set QR code model
      receiptText += GS + '(k' + String.fromCharCode(4, 0, 49, 65, 50, 0);
      
      // Set QR code size (module size 6 - medium size)
      receiptText += GS + '(k' + String.fromCharCode(3, 0, 49, 67, 6);
      
      // Set QR code error correction level (M=49)
      receiptText += GS + '(k' + String.fromCharCode(3, 0, 49, 69, 49);
      
      // Store QR code data
      const qrLength = upiString.length + 3;
      const qrLengthL = qrLength % 256;
      const qrLengthH = Math.floor(qrLength / 256);
      receiptText += GS + '(k' + String.fromCharCode(qrLengthL, qrLengthH, 49, 80, 48) + upiString;
      
      // Print QR code (already centered by alignment above)
      receiptText += GS + '(k' + String.fromCharCode(3, 0, 49, 81, 48);
      
      receiptText += '\n';
    }
    
    // Footer message from settings
    if (settings?.footerText) {
      receiptText += settings.footerText + '\n';
    }
    receiptText += '\n';
    
    // Cut paper
    receiptText += GS + 'V' + '\x41' + '\x03'; // Cut
    
    const buffer = Buffer.from(receiptText, 'ascii');

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
        message: `Bill ${bill.billNumber} sent to printer successfully`,
        data: {
          billId: bill.billId,
          billNumber: bill.billNumber
        }
      });
    });

  } catch (error) {
    console.error('Print bill error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to print bill',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Print KOT (Kitchen Order Ticket) to thermal printer
export const printKOT = async (req, res) => {
  try {
    const { billId } = req.body;

    if (!billId) {
      return res.status(400).json({
        success: false,
        message: 'Bill ID is required'
      });
    }

    // Get bill details
    const bill = db.prepare(`
      SELECT * FROM bills WHERE billId = ?
    `).get(billId);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    // Get NEW items (quantity > kotPrintedQuantity) from bill_items table
    const newItems = db.prepare(`
      SELECT bi.*, p.nameHi, p.isLooseItem, 
             (bi.quantity - COALESCE(bi.kotPrintedQuantity, 0)) as newQuantity
      FROM bill_items bi
      LEFT JOIN products p ON bi.productId = p.productId
      WHERE bi.billId = ? AND bi.quantity > COALESCE(bi.kotPrintedQuantity, 0)
    `).all(billId);

    if (!newItems || newItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No new items to print on KOT'
      });
    }

    // Get business settings
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    
    // Currency symbol
    const currencySymbol = 'Rs.';

    // Get printer path from environment
    const printerPath = process.env.PRINTER_INTERFACE || '\\\\localhost\\MyPOS';

    // ESC/POS commands for receipt printing
    const ESC = '\x1B';
    const GS = '\x1D';
    
    let receiptText = '';
    
    // Initialize printer
    receiptText += ESC + '@'; // Initialize
    
    // Header - Kitchen Order Title (Center, Bold, Double Size)
    receiptText += ESC + 'a' + '\x01'; // Center align
    receiptText += ESC + 'E' + '\x01'; // Bold on
    receiptText += GS + '!' + '\x11'; // Double height & width
    receiptText += 'Kitchen Order' + '\n';
    receiptText += GS + '!' + '\x00'; // Normal size
    receiptText += ESC + 'E' + '\x00'; // Bold off
    
    // Parse business type data for table info
    let businessTypeData = {};
    try {
      businessTypeData = bill.businessTypeData ? JSON.parse(bill.businessTypeData) : {};
    } catch (e) {
      // Ignore parse errors
    }
    
    // KOT details (Left align)
    receiptText += ESC + 'a' + '\x00'; // Left align
    receiptText += '\n';
    receiptText += 'Date: ' + new Date().toLocaleString('en-IN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }) + '\n';
    
    // Bill Number (last 5 digits only)
    const billNumShort = bill.billNumber.toString().slice(-5);
    receiptText += 'Bill: ' + billNumShort + '\n';
    
    if (businessTypeData.tableNumber) {
      const tableType = businessTypeData.tableType || 'dine-in';
      const tableLabel = tableType === 'parcel' ? 'Parcel' : 'Table';
      receiptText += tableLabel + ': ' + businessTypeData.tableNumber + '\n';
    }
    
    // Dotted divider line
    receiptText += '................................\n';
    
    // Check if Hindi language is selected
    const isHindi = settings?.receiptLanguage === 'hi';
    
    // Items list: Item X qty + Note (if present)
    receiptText += ESC + 'a' + '\x00'; // Left align
    
    newItems.forEach(item => {
      // Use Hindi name if available and Hindi is selected
      const displayName = (isHindi && item.nameHi) ? item.nameHi : (item.name || 'Unknown');
      // Format quantity with 2 decimals for loose items, otherwise show as integer
      // Use newQuantity (difference) instead of total quantity
      const qty = item.isLooseItem ? (item.newQuantity || 0).toFixed(2) : Math.round(item.newQuantity || 0).toString();
      const note = item.note ? ' - ' + item.note : '';
      
      // Format: Item X qty - Note (if present)
      receiptText += displayName + ' X ' + qty + note + '\n';
    });
    
    // Dotted divider line
    receiptText += '................................\n\n';
    
    // Cut paper
    receiptText += GS + 'V' + '\x41' + '\x03'; // Cut
    
    const buffer = Buffer.from(receiptText, 'ascii');

    // Write to printer
    fs.appendFile(printerPath, buffer, (err) => {
      if (err) {
        console.error('KOT Print error:', err);
        
        // Even on print failure, emit socket event to notify clients
        const billData = {
          ...bill,
          businessTypeData: JSON.parse(bill.businessTypeData || '{}'),
          printError: true
        };
        emitKOTPrinted(billData);
        if (bill.tableId) {
          emitTableUpdate({ tableId: bill.tableId, billId: bill.billId, billStatus: bill.billStatus });
        }
        
        return res.status(500).json({
          success: false,
          message: `Failed to print KOT: ${err.message}. Check PRINTER_INTERFACE in .env file.`
        });
      }
      
      // Mark items as KOT printed AFTER successful printing
      const now = new Date().toISOString();
      
      // Update kotPrintedQuantity to current quantity for items that were just printed
      const updateKotQty = db.prepare(`
        UPDATE bill_items 
        SET kotPrinted = 1, kotPrintedQuantity = quantity 
        WHERE billId = ? AND quantity > COALESCE(kotPrintedQuantity, 0)
      `);
      updateKotQty.run(billId);
      
      // Set KOT printed timestamp on bill
      db.prepare('UPDATE bills SET kotPrintedAt = ?, updatedAt = ? WHERE billId = ?')
        .run(now, now, billId);
      
      // Fetch updated bill data
      const updatedBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
      const billData = {
        ...updatedBill,
        businessTypeData: JSON.parse(updatedBill.businessTypeData || '{}')
      };

      // Emit WebSocket events for real-time updates
      emitKOTPrinted(billData);
      if (updatedBill.tableId) {
        emitTableUpdate({ tableId: updatedBill.tableId, billId: updatedBill.billId, billStatus: updatedBill.billStatus });
      }
      
      res.json({
        success: true,
        message: `KOT for Bill ${bill.billNumber} sent to printer successfully`,
        data: {
          billId: bill.billId,
          billNumber: bill.billNumber,
          itemCount: newItems.length
        }
      });
    });

  } catch (error) {
    console.error('Print KOT error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to print KOT',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const deleteBill = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️  deleteBill called for billId:', id);
    
    // Check if bill exists
    const bill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(id);
    
    if (!bill) {
      console.log('❌ Bill not found in database:', id);
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }
    
    console.log('✅ Bill found, proceeding with deletion:', bill.billNumber);

    // Get settings to check if stock tracking is enabled
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const isHotelMode = settings?.applicationType === 'hotel';

    // Restore stock before deleting (skip for hotel mode)
    if (!isHotelMode) {
      const billItems = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(id);
      for (const item of billItems) {
        if (item.productId) {
          db.prepare('UPDATE products SET stockQuantity = stockQuantity + ? WHERE productId = ?')
            .run(item.quantity, item.productId);
        }
      }
    }

    // If bill has a table, try to mark table as available (skip if table doesn't exist)
    if (bill.tableId) {
      try {
        db.prepare('UPDATE restaurant_tables SET status = ?, currentBillId = NULL WHERE id = ?')
          .run('available', bill.tableId);
        console.log('✅ Table marked as available:', bill.tableId);
        // Emit table update
        emitTableUpdate({ tableId: bill.tableId, billId: null, status: 'available' });
      } catch (tableError) {
        console.log('⚠️ Could not update table (table may not exist):', tableError.message);
        // Continue with bill deletion even if table update fails
      }
    }

    // Delete bill items first (foreign key constraint)
    db.prepare('DELETE FROM bill_items WHERE billId = ?').run(id);
    console.log('✅ Deleted bill items for billId:', id);
    
    // Delete the bill
    db.prepare('DELETE FROM bills WHERE billId = ?').run(id);
    console.log('✅ Deleted bill from database, billId:', id);

    // Emit WebSocket event for real-time updates
    console.log('📡 Emitting bill-deleted WebSocket event for billId:', id);
    emitBillDeleted(id);

    res.json({
      success: true,
      message: 'Bill deleted successfully',
      data: { billId: id }
    });
    console.log('✅ Delete bill response sent successfully');
  } catch (error) {
    console.error('❌ Delete bill error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete bill',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export default {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  getReport,
  printBill,
  printKOT
};
