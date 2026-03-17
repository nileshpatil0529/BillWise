import db from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// Get all borrowers
export const getBorrowers = async (req, res) => {
  try {
    const borrowers = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM borrowers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      GROUP BY b.borrowerId
      ORDER BY b.name ASC
    `).all();

    res.json({
      success: true,
      data: borrowers
    });
  } catch (error) {
    console.error('Get borrowers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch borrowers'
    });
  }
};

// Search borrowers by name or phone
export const searchBorrowers = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const borrowers = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM borrowers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      WHERE b.name LIKE ? OR b.phone LIKE ?
      GROUP BY b.borrowerId
      ORDER BY b.name ASC
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`);

    res.json({
      success: true,
      data: borrowers
    });
  } catch (error) {
    console.error('Search borrowers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search borrowers'
    });
  }
};

// Get borrower by ID with debt details
export const getBorrowerById = async (req, res) => {
  try {
    const { id } = req.params;

    const borrower = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM borrowers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      WHERE b.borrowerId = ?
      GROUP BY b.borrowerId
    `).get(id);

    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
    }

    // Get all debt bills for this borrower
    const debts = db.prepare(`
      SELECT billId, billNumber, grandTotal as amount, amountPaid as paidAmount, 
        (grandTotal - amountPaid) as remainingAmount, createdAt
      FROM bills
      WHERE customerPhone = ? AND paymentMethod = 'debt' AND paymentStatus != 'paid'
      ORDER BY createdAt DESC
    `).all(borrower.phone);

    res.json({
      success: true,
      data: {
        ...borrower,
        debts
      }
    });
  } catch (error) {
    console.error('Get borrower error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch borrower'
    });
  }
};

// Create a new borrower
export const createBorrower = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name and phone number are required'
      });
    }

    // Check if phone number already exists
    const existing = db.prepare('SELECT * FROM borrowers WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A borrower with this phone number already exists'
      });
    }

    const borrowerId = `BOR-${uuidv4().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO borrowers (borrowerId, name, phone, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(borrowerId, name, phone, now, now);

    const newBorrower = db.prepare('SELECT * FROM borrowers WHERE borrowerId = ?').get(borrowerId);

    res.status(201).json({
      success: true,
      message: 'Borrower created successfully',
      data: { ...newBorrower, totalDebt: 0 }
    });
  } catch (error) {
    console.error('Create borrower error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create borrower'
    });
  }
};

// Update a borrower
export const updateBorrower = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    const existing = db.prepare('SELECT * FROM borrowers WHERE borrowerId = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
    }

    // Check if phone number already exists for another borrower
    if (phone && phone !== existing.phone) {
      const phoneExists = db.prepare('SELECT * FROM borrowers WHERE phone = ? AND borrowerId != ?').get(phone, id);
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: 'A borrower with this phone number already exists'
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE borrowers SET name = ?, phone = ?, updatedAt = ?
      WHERE borrowerId = ?
    `).run(name || existing.name, phone || existing.phone, now, id);

    const updatedBorrower = db.prepare(`
      SELECT b.*, 
        COALESCE(SUM(CASE WHEN bills.paymentStatus != 'paid' THEN bills.grandTotal - bills.amountPaid ELSE 0 END), 0) as totalDebt
      FROM borrowers b
      LEFT JOIN bills ON bills.customerPhone = b.phone AND bills.paymentMethod = 'debt'
      WHERE b.borrowerId = ?
      GROUP BY b.borrowerId
    `).get(id);

    res.json({
      success: true,
      message: 'Borrower updated successfully',
      data: updatedBorrower
    });
  } catch (error) {
    console.error('Update borrower error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update borrower'
    });
  }
};

// Delete a borrower
export const deleteBorrower = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM borrowers WHERE borrowerId = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
    }

    // Check if borrower has unpaid debts
    const unpaidDebts = db.prepare(`
      SELECT COUNT(*) as count FROM bills 
      WHERE customerPhone = ? AND paymentMethod = 'debt' AND paymentStatus != 'paid'
    `).get(existing.phone);

    if (unpaidDebts.count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete borrower with unpaid debts'
      });
    }

    db.prepare('DELETE FROM borrowers WHERE borrowerId = ?').run(id);

    res.json({
      success: true,
      message: 'Borrower deleted successfully'
    });
  } catch (error) {
    console.error('Delete borrower error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete borrower'
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

    const borrower = db.prepare('SELECT * FROM borrowers WHERE borrowerId = ?').get(id);
    if (!borrower) {
      return res.status(404).json({
        success: false,
        message: 'Borrower not found'
      });
    }

    const bill = db.prepare('SELECT * FROM bills WHERE billId = ? AND customerPhone = ?').get(billId, borrower.phone);
    if (!bill) {
      return res.status(404).json({
        success: false,
        message: 'Bill not found for this borrower'
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
