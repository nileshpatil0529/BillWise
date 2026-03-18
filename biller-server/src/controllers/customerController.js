import db from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// Get all customers
export const getCustomers = async (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM customers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      GROUP BY b.customerId
      ORDER BY b.name ASC
    `).all();

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers'
    });
  }
};

// Search customers by name or phone
export const searchCustomers = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const customers = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM customers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      WHERE b.name LIKE ? OR b.phone LIKE ?
      GROUP BY b.customerId
      ORDER BY b.name ASC
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`);

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search customers'
    });
  }
};

// Get customer by ID with debt details
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM customers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      WHERE b.customerId = ?
      GROUP BY b.customerId
    `).get(id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'customer not found'
      });
    }

    // Get all debt bills for this customer
    const debts = db.prepare(`
      SELECT billId, billNumber, grandTotal as amount, amountPaid as paidAmount, 
        (grandTotal - amountPaid) as remainingAmount, createdAt
      FROM bills
      WHERE customerPhone = ? AND paymentMethod = 'debt' AND paymentStatus != 'paid'
      ORDER BY createdAt DESC
    `).all(customer.phone);

    res.json({
      success: true,
      data: {
        ...customer,
        debts
      }
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer'
    });
  }
};

// Create a new customer
export const createCustomer = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone number are required'
      });
    }

    // Check if phone number already exists
    const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A customer with this phone number already exists'
      });
    }

    const customerId = `CUST-${uuidv4().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO customers (customerId, name, phone, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(customerId, name, phone, now, now);

    const newcustomer = db.prepare('SELECT * FROM customers WHERE customerId = ?').get(customerId);

    res.status(201).json({
      success: true,
      message: 'customer created successfully',
      data: { ...newcustomer, totalDebt: 0 }
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer'
    });
  }
};

// Update a customer
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    const existing = db.prepare('SELECT * FROM customers WHERE customerId = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'customer not found'
      });
    }

    // Check if phone number already exists for another customer
    if (phone && phone !== existing.phone) {
      const phoneExists = db.prepare('SELECT * FROM customers WHERE phone = ? AND customerId != ?').get(phone, id);
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: 'A customer with this phone number already exists'
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE customers SET name = ?, phone = ?, updatedAt = ?
      WHERE customerId = ?
    `).run(name || existing.name, phone || existing.phone, now, id);

    const updatedcustomer = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM customers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      WHERE b.customerId = ?
      GROUP BY b.customerId
    `).get(id);

    res.json({
      success: true,
      message: 'customer updated successfully',
      data: updatedcustomer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer'
    });
  }
};

// Delete a customer
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM customers WHERE customerId = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'customer not found'
      });
    }

    // Check if customer has unpaid debts
    const unpaidDebts = db.prepare(`
      SELECT COUNT(*) as count FROM bills 
      WHERE customerPhone = ? AND paymentMethod = 'debt' AND paymentStatus != 'paid'
    `).get(existing.phone);

    if (unpaidDebts.count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete customer with unpaid debts'
      });
    }

    db.prepare('DELETE FROM customers WHERE customerId = ?').run(id);

    res.json({
      success: true,
      message: 'customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer'
    });
  }
};

// Pay debt
export const payDebt = async (req, res) => {
  try {
    const { id } = req.params;
    const { billId, amount } = req.body;

    if (!billId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Bill ID and valid amount are required'
      });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE customerId = ?').get(id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'customer not found'
      });
    }

    const bill = db.prepare('SELECT * FROM bills WHERE billId = ? AND customerPhone = ?').get(billId, customer.phone);
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found for this customer'
      });
    }

    const remaining = bill.grandTotal - bill.amountPaid;
    const paymentAmount = Math.min(amount, remaining);
    const newAmountPaid = bill.amountPaid + paymentAmount;
    const newStatus = newAmountPaid >= bill.grandTotal ? 'paid' : 'partial';

    db.prepare(`
      UPDATE bills SET amountPaid = ?, paymentStatus = ?, updatedAt = ?
      WHERE billId = ?
    `).run(newAmountPaid, newStatus, new Date().toISOString(), billId);

    res.json({
      success: true,
      message: `Payment of ${paymentAmount} received. ${newStatus === 'paid' ? 'Bill fully paid!' : `Remaining: ${bill.grandTotal - newAmountPaid}`}`
    });
  } catch (error) {
    console.error('Pay debt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment'
    });
  }
};

// Get all bills for a customer with pagination and efficient fetching
export const getCustomerBills = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 100 } = req.query;

    // Get customer to retrieve phone
    const customer = db.prepare('SELECT * FROM customers WHERE customerId = ?').get(id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get total count for pagination
    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM bills 
      WHERE customerPhone = ?
    `).get(customer.phone);
    
    const total = countResult.count;

    // Fetch bills with items efficiently using pagination
    const offset = (page - 1) * limit;
    const bills = db.prepare(`
      SELECT * FROM bills 
      WHERE customerPhone = ?
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `).all(customer.phone, parseInt(limit), offset);

    // Get items for each bill in a single batch query
    const billIds = bills.map(b => b.billId);
    let billsWithItems = [];
    
    if (billIds.length > 0) {
      // Fetch all items for these bills at once
      const placeholders = billIds.map(() => '?').join(',');
      const allItems = db.prepare(`
        SELECT * FROM bill_items WHERE billId IN (${placeholders})
      `).all(...billIds);
      
      // Group items by billId
      const itemsByBill = allItems.reduce((acc, item) => {
        if (!acc[item.billId]) acc[item.billId] = [];
        acc[item.billId].push(item);
        return acc;
      }, {});
      
      // Combine bills with their items
      billsWithItems = bills.map(bill => ({
        ...bill,
        items: itemsByBill[bill.billId] || [],
        businessTypeData: bill.businessTypeData ? JSON.parse(bill.businessTypeData) : {}
      }));
    }

    res.json({
      success: true,
      data: {
        bills: billsWithItems,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Get customer bills error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer bills'
    });
  }
};
