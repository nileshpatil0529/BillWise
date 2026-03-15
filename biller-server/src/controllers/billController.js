import { v4 as uuidv4 } from 'uuid';

// In-memory bills store
const bills = new Map();

// Generate bill number
const generateBillNumber = () => {
  const date = new Date();
  const prefix = 'INV';
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = Array.from(bills.values())
    .filter(b => b.billNumber.includes(dateStr)).length + 1;
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

    let billList = Array.from(bills.values());

    // Apply date filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      billList = billList.filter(b => new Date(b.createdAt) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      billList = billList.filter(b => new Date(b.createdAt) <= end);
    }

    // Apply payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      billList = billList.filter(b => b.paymentMethod === paymentMethod);
    }

    // Apply payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      billList = billList.filter(b => b.paymentStatus === paymentStatus);
    }

    // Sort by date descending
    billList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const total = billList.length;
    const startIndex = (page - 1) * limit;
    const paginatedBills = billList.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      data: {
        bills: paginatedBills,
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
    const bill = bills.get(id);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    res.json({
      success: true,
      data: bill
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
    const taxEnabled = billData.taxEnabled !== false; // Default to true if not specified
    
    if (taxEnabled) {
      // Use tax rate from request (from settings)
      const taxRate = billData.taxRate || 0;
      taxTotal = (taxableAmount * taxRate) / 100;
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    const newBill = {
      billId,
      billNumber,
      items,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      paymentMethod: billData.paymentMethod || 'cash',
      paymentStatus: billData.paymentStatus || 'paid',
      amountPaid: billData.paymentMethod === 'debt' 
        ? (parseFloat(billData.amountPaid) || 0) 
        : (parseFloat(billData.amountPaid) || grandTotal),
      change: (parseFloat(billData.amountPaid) || grandTotal) - grandTotal,
      customerName: billData.customerName || '',
      customerPhone: billData.customerPhone || '',
      businessTypeData: billData.businessTypeData || {},
      notes: billData.notes || '',
      createdBy: req.user?.uid || 'system',
      createdAt: new Date().toISOString()
    };

    bills.set(billId, newBill);

    res.status(201).json({
      success: true,
      message: 'Bill created successfully',
      data: newBill
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

    const bill = bills.get(id);
    
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found'
      });
    }

    // Only allow updating certain fields
    const allowedUpdates = ['paymentStatus', 'amountPaid', 'notes', 'customerName', 'customerPhone'];
    const filteredUpdates = {};
    
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    const updatedBill = {
      ...bill,
      ...filteredUpdates,
      updatedAt: new Date().toISOString()
    };

    bills.set(id, updatedBill);

    res.json({
      success: true,
      message: 'Bill updated successfully',
      data: updatedBill
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

    let billList = Array.from(bills.values());

    // Apply date filter
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      billList = billList.filter(b => new Date(b.createdAt) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      billList = billList.filter(b => new Date(b.createdAt) <= end);
    }

    // Calculate summary
    const summary = {
      totalSales: 0,
      totalBills: billList.length,
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

    billList.forEach(bill => {
      summary.totalSales += bill.grandTotal;
      summary.totalDiscount += bill.discountTotal;
      summary.totalTax += bill.taxTotal;

      paymentMethodCounts[bill.paymentMethod]++;

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
      
      const daySales = billList
        .filter(b => b.createdAt.slice(0, 10) === dateStr)
        .reduce((sum, b) => sum + b.grandTotal, 0);
      
      dailySales.push({
        date: dateStr,
        sales: daySales
      });
    }

    // Top selling products
    const productSales = {};
    billList.forEach(bill => {
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

export default {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  getReport
};
