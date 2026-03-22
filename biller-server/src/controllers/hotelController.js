import db from '../config/database.js';

// ==================== RESTAURANT TABLES ====================

// Get all tables
export const getTables = async (req, res) => {
  try {
    const tables = db.prepare(`
      SELECT rt.*, b.billNumber, b.grandTotal
      FROM restaurant_tables rt
      LEFT JOIN bills b ON rt.currentBillId = b.billId AND b.billStatus != 'completed'
      ORDER BY rt.tableType, CAST(SUBSTR(rt.tableNumber, 2) AS INTEGER)
    `).all();
    
    res.json({
      success: true,
      data: tables
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tables'
    });
  }
};

// Get single table
export const getTable = async (req, res) => {
  try {
    const { id } = req.params;
    const table = db.prepare(`
      SELECT rt.*, b.billId, b.billNumber, b.grandTotal, b.billStatus
      FROM restaurant_tables rt
      LEFT JOIN bills b ON rt.currentBillId = b.billId
      WHERE rt.id = ?
    `).get(id);
    
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }
    
    res.json({
      success: true,
      data: table
    });
  } catch (error) {
    console.error('Get table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch table'
    });
  }
};

// Create tables in range
export const createTables = async (req, res) => {
  try {
    const { startNumber, endNumber, tableType = 'dine-in', capacity = 4 } = req.body;

    if (!startNumber || !endNumber) {
      return res.status(400).json({
        success: false,
        message: 'Start and end number are required'
      });
    }

    const start = parseInt(startNumber);
    const end = parseInt(endNumber);

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start number must be less than or equal to end number'
      });
    }

    const insertTable = db.prepare(`
      INSERT INTO restaurant_tables (tableNumber, tableType, capacity, status)
      VALUES (?, ?, ?, 'available')
    `);

    const createdTables = [];
    const skippedTables = [];

    for (let i = start; i <= end; i++) {
      const tableNumber = tableType === 'parcel' ? `P${i}` : `T${i}`;
      
      try {
        insertTable.run(tableNumber, tableType, capacity);
        createdTables.push(tableNumber);
      } catch (e) {
        // Table already exists
        skippedTables.push(tableNumber);
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdTables.length} tables${skippedTables.length > 0 ? `, ${skippedTables.length} already existed` : ''}`,
      data: { created: createdTables, skipped: skippedTables }
    });
  } catch (error) {
    console.error('Create tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tables'
    });
  }
};

// Update table
export const updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const { tableNumber, tableType, capacity, status } = req.body;

    const existing = db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    db.prepare(`
      UPDATE restaurant_tables 
      SET tableNumber = ?, tableType = ?, capacity = ?, status = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      tableNumber || existing.tableNumber,
      tableType || existing.tableType,
      capacity || existing.capacity,
      status || existing.status,
      new Date().toISOString(),
      id
    );

    res.json({
      success: true,
      message: 'Table updated successfully'
    });
  } catch (error) {
    console.error('Update table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update table'
    });
  }
};

// Delete table
export const deleteTable = async (req, res) => {
  try {
    const { id } = req.params;

    const table = db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(id);
    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }

    if (table.status === 'occupied') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete occupied table'
      });
    }

    db.prepare('DELETE FROM restaurant_tables WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Table deleted successfully'
    });
  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete table'
    });
  }
};

// Update table status
export const updateTableStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, currentBillId } = req.body;

    db.prepare(`
      UPDATE restaurant_tables 
      SET status = ?, currentBillId = ?, updatedAt = ?
      WHERE id = ?
    `).run(status, currentBillId || null, new Date().toISOString(), id);

    res.json({
      success: true,
      message: 'Table status updated'
    });
  } catch (error) {
    console.error('Update table status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update table status'
    });
  }
};

// ==================== TIP OPTIONS ====================

// Get all tip options
export const getTipOptions = async (req, res) => {
  try {
    const tips = db.prepare(`
      SELECT * FROM tip_options 
      WHERE isActive = 1
      ORDER BY sortOrder, id
    `).all();
    
    res.json({
      success: true,
      data: tips
    });
  } catch (error) {
    console.error('Get tip options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tip options'
    });
  }
};

// Create tip option
export const createTipOption = async (req, res) => {
  try {
    const { label, value, tipType = 'percentage' } = req.body;

    if (!label) {
      return res.status(400).json({
        success: false,
        message: 'Label is required'
      });
    }

    const maxOrder = db.prepare('SELECT MAX(sortOrder) as maxOrder FROM tip_options').get();
    const sortOrder = (maxOrder.maxOrder || 0) + 1;

    const result = db.prepare(`
      INSERT INTO tip_options (label, value, tipType, sortOrder)
      VALUES (?, ?, ?, ?)
    `).run(label, value || 0, tipType, sortOrder);

    res.status(201).json({
      success: true,
      message: 'Tip option created successfully',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('Create tip option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tip option'
    });
  }
};

// Update tip option
export const updateTipOption = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, value, tipType, isActive, sortOrder } = req.body;

    const existing = db.prepare('SELECT * FROM tip_options WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Tip option not found'
      });
    }

    db.prepare(`
      UPDATE tip_options 
      SET label = ?, value = ?, tipType = ?, isActive = ?, sortOrder = ?
      WHERE id = ?
    `).run(
      label ?? existing.label,
      value ?? existing.value,
      tipType ?? existing.tipType,
      isActive ?? existing.isActive,
      sortOrder ?? existing.sortOrder,
      id
    );

    res.json({
      success: true,
      message: 'Tip option updated successfully'
    });
  } catch (error) {
    console.error('Update tip option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tip option'
    });
  }
};

// Delete tip option
export const deleteTipOption = async (req, res) => {
  try {
    const { id } = req.params;

    db.prepare('DELETE FROM tip_options WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Tip option deleted successfully'
    });
  } catch (error) {
    console.error('Delete tip option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tip option'
    });
  }
};

// ==================== ITEM NOTES ====================

// Get all item notes
export const getItemNotes = async (req, res) => {
  try {
    const notes = db.prepare(`
      SELECT * FROM item_notes 
      WHERE isActive = 1
      ORDER BY sortOrder, id
    `).all();
    
    res.json({
      success: true,
      data: notes
    });
  } catch (error) {
    console.error('Get item notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch item notes'
    });
  }
};

// Create item note
export const createItemNote = async (req, res) => {
  try {
    const { label } = req.body;

    if (!label) {
      return res.status(400).json({
        success: false,
        message: 'Label is required'
      });
    }

    const maxOrder = db.prepare('SELECT MAX(sortOrder) as maxOrder FROM item_notes').get();
    const sortOrder = (maxOrder.maxOrder || 0) + 1;

    const result = db.prepare(`
      INSERT INTO item_notes (label, sortOrder)
      VALUES (?, ?)
    `).run(label.trim(), sortOrder);

    res.status(201).json({
      success: true,
      message: 'Item note created successfully',
      data: { id: result.lastInsertRowid, label: label.trim() }
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({
        success: false,
        message: 'Note with this label already exists'
      });
    }
    console.error('Create item note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create item note'
    });
  }
};

// Update item note
export const updateItemNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, isActive, sortOrder } = req.body;

    const existing = db.prepare('SELECT * FROM item_notes WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Item note not found'
      });
    }

    db.prepare(`
      UPDATE item_notes 
      SET label = ?, isActive = ?, sortOrder = ?
      WHERE id = ?
    `).run(
      label ?? existing.label,
      isActive ?? existing.isActive,
      sortOrder ?? existing.sortOrder,
      id
    );

    res.json({
      success: true,
      message: 'Item note updated successfully'
    });
  } catch (error) {
    console.error('Update item note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item note'
    });
  }
};

// Delete item note
export const deleteItemNote = async (req, res) => {
  try {
    const { id } = req.params;

    db.prepare('DELETE FROM item_notes WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Item note deleted successfully'
    });
  } catch (error) {
    console.error('Delete item note error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete item note'
    });
  }
};

export default {
  getTables,
  getTable,
  createTables,
  updateTable,
  deleteTable,
  updateTableStatus,
  getTipOptions,
  createTipOption,
  updateTipOption,
  deleteTipOption,
  getItemNotes,
  createItemNote,
  updateItemNote,
  deleteItemNote
};
