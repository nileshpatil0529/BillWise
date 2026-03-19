import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import db from '../config/database.js';

// Generate bill number
const generateBillNumber = () => {
  const date = new Date();
  const prefix = 'INV';
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Count bills for today
  const todayStart = date.toISOString().slice(0, 10);
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM bills 
    WHERE billNumber LIKE ?
  `).get(`${prefix}${dateStr}%`);
  
  const count = (result.count || 0) + 1;
  return `${prefix}${dateStr}${count.toString().padStart(4, '0')}`;
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
    const billNumber = generateBillNumber();
    const now = new Date().toISOString();

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

    // Use transaction for inserting bill and items
    const insertBillAndItems = db.transaction(() => {
      // Insert bill
      db.prepare(`
        INSERT INTO bills (billId, billNumber, subtotal, discountTotal, taxTotal, grandTotal, paymentMethod, paymentStatus, amountPaid, change, customerName, customerPhone, businessTypeData, notes, createdBy, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        now
      );

      // Insert items
      const insertItem = db.prepare(`
        INSERT INTO bill_items (billId, productId, name, quantity, unitPrice, itemTotal, finalTotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        insertItem.run(
          billId,
          item.productId || '',
          item.name,
          item.quantity,
          item.unitPrice,
          item.itemTotal,
          item.finalTotal
        );

        // Update product stock if productId exists
        if (item.productId) {
          db.prepare('UPDATE products SET stockQuantity = stockQuantity - ? WHERE productId = ?')
            .run(item.quantity, item.productId);
        }
      }
    });

    insertBillAndItems();

    // Fetch created bill with items
    const createdBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    const billItems = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(billId);

    res.status(201).json({
      success: true,
      message: 'Bill created successfully',
      data: {
        ...createdBill,
        items: billItems,
        businessTypeData: JSON.parse(createdBill.businessTypeData || '{}')
      }
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

    // Only allow updating certain fields
    const allowedUpdates = ['paymentStatus', 'amountPaid', 'notes', 'customerName', 'customerPhone'];
    const now = new Date().toISOString();

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        db.prepare(`UPDATE bills SET ${key} = ?, updatedAt = ? WHERE billId = ?`)
          .run(updates[key], now, id);
      }
    }

    const updatedBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(id);
    const items = db.prepare('SELECT * FROM bill_items WHERE billId = ?').all(id);

    res.json({
      success: true,
      message: 'Bill updated successfully',
      data: {
        ...updatedBill,
        items,
        businessTypeData: updatedBill.businessTypeData ? JSON.parse(updatedBill.businessTypeData) : {}
      }
    });
  } catch (error) {
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
          if (bill.paymentStatus !== 'paid') {
            summary.debtAmount += bill.grandTotal - (bill.amountPaid || 0);
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
      SELECT * FROM bill_items WHERE billId = ?
    `).all(billId);
    
    console.log(`Bill ${bill.billNumber} has ${billItems.length} items`);
    console.log('Items:', JSON.stringify(billItems, null, 2));

    // Get business settings
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    // Get printer path from environment
    const printerPath = process.env.PRINTER_INTERFACE || '\\\\localhost\\MyPOS';
    
    console.log(`Printing bill to: ${printerPath}`);

    // ESC/POS commands for receipt printing
    const ESC = '\x1B';
    const GS = '\x1D';
    
    let receiptText = '';
    
    // Initialize printer
    receiptText += ESC + '@'; // Initialize
    
    // Header - Business Name (Center, Double Height)
    receiptText += ESC + 'a' + '\x01'; // Center align
    receiptText += GS + '!' + '\x11'; // Double height & width
    receiptText += (settings?.businessName || 'BILLWISE') + '\n';
    receiptText += GS + '!' + '\x00'; // Normal size
    
    // Business Details (Center)
    if (settings?.address) {
      receiptText += settings.address + '\n';
    }
    if (settings?.phone) {
      receiptText += 'Tel: ' + settings.phone + '\n';
    }
    if (settings?.taxNumber) {
      receiptText += 'GSTIN: ' + settings.taxNumber + '\n';
    }
    
    // Divider line
    receiptText += '--------------------------------\n';
    
    // Bill details (Left align)
    receiptText += ESC + 'a' + '\x00'; // Left align
    receiptText += 'Bill #: ' + bill.billNumber + '\n';
    receiptText += 'Date: ' + new Date(bill.createdAt).toLocaleString() + '\n';
    
    if (bill.customerName) {
      receiptText += 'Customer: ' + bill.customerName + '\n';
    }
    if (bill.customerPhone) {
      receiptText += 'Phone: ' + bill.customerPhone + '\n';
    }
    
    receiptText += '--------------------------------\n';
    
    // Items header
    receiptText += 'Item         Qty  Price  Total\n';
    receiptText += '--------------------------------\n';
    
    // Items list
    if (billItems && billItems.length > 0) {
      billItems.forEach(item => {
        const name = (item.name || 'Unknown').substring(0, 13).padEnd(13);
        const qty = (item.quantity || 0).toString().padStart(3);
        const price = Math.round(item.unitPrice || 0).toString().padStart(6);
        const total = Math.round(item.finalTotal || item.itemTotal || 0).toString().padStart(7);
        receiptText += name + qty + price + total + '\n';
        
        // Show discount if any
        if (item.discountAmount && item.discountAmount > 0) {
          const discountText = '  Discount: -' + Math.round(item.discountAmount);
          receiptText += discountText + '\n';
        }
      });
    } else {
      receiptText += '    No items found\n';
    }
    
    receiptText += '--------------------------------\n';
    
    // Totals (Right align for amounts)
    receiptText += ESC + 'a' + '\x00'; // Left align
    
    const subtotal = Math.round(bill.subtotal).toString();
    receiptText += 'Subtotal:' + subtotal.padStart(24) + '\n';
    
    if (bill.discountTotal > 0) {
      const discount = Math.round(bill.discountTotal).toString();
      receiptText += 'Discount:' + ('-' + discount).padStart(24) + '\n';
    }
    
    if (bill.taxTotal > 0) {
      const tax = Math.round(bill.taxTotal).toString();
      const taxRate = settings?.taxRates?.[0]?.rate || 0;
      receiptText += `Tax (${taxRate}%):` + tax.padStart(24 - `Tax (${taxRate}%):`.length + 9) + '\n';
    }
    
    receiptText += '================================\n';
    
    // Grand Total (Bold, Double height)
    receiptText += GS + '!' + '\x11'; // Double height & width
    const grandTotal = Math.round(bill.grandTotal).toString();
    receiptText += 'TOTAL: Rs ' + grandTotal + '\n';
    receiptText += GS + '!' + '\x00'; // Normal size
    
    receiptText += '================================\n';
    
    // Payment details
    receiptText += 'Payment: ' + bill.paymentMethod.toUpperCase() + '\n';
    receiptText += 'Status: ' + bill.paymentStatus.toUpperCase() + '\n';
    
    if (bill.paymentMethod === 'cash') {
      receiptText += 'Paid: Rs ' + Math.round(bill.amountPaid) + '\n';
      if (bill.change > 0) {
        receiptText += 'Change: Rs ' + Math.round(bill.change) + '\n';
      }
    }
    
    if (bill.notes) {
      receiptText += '\nNote: ' + bill.notes + '\n';
    }
    
    receiptText += '--------------------------------\n';
    
    // Footer (Center)
    receiptText += ESC + 'a' + '\x01'; // Center align
    receiptText += '\nThank you for your business!\n';
    receiptText += 'Visit again!\n\n';
    
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

      console.log(`Successfully sent bill ${bill.billNumber} to printer`);
      
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

export default {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  getReport,
  printBill
};
