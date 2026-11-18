import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { emitTableUpdate, emitTablesRefresh } from '../sockets/index.js';
import {
  propagateTableStatus,
  dissolveMergeGroup
} from '../services/tableMergeService.js';

// ==================== RESTAURANT TABLES ====================

// Get all tables
export const getTables = async (req, res) => {
  try {
    const tables = db.prepare(`
      SELECT rt.*, b.billNumber, b.grandTotal
      FROM restaurant_tables rt
      LEFT JOIN bills b ON rt.currentBillId = b.billId
      ORDER BY rt.id ASC
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
    const { startNumber, endNumber, tableType = 'dine-in', capacity = 4, customTableName } = req.body;

    const type = (typeof tableType === 'string' && tableType.trim()) ? tableType.trim() : 'dine-in';

    if (customTableName && String(customTableName).trim()) {
      const manualName = String(customTableName).trim();
      const existing = db.prepare('SELECT id FROM restaurant_tables WHERE LOWER(tableNumber) = LOWER(?)').get(manualName);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Table name already exists'
        });
      }

      db.prepare(`
        INSERT INTO restaurant_tables (tableNumber, tableType, capacity, status)
        VALUES (?, ?, ?, 'available')
      `).run(manualName, type, capacity);

      emitTablesRefresh();
      return res.status(201).json({
        success: true,
        message: 'Table created successfully',
        data: { created: [manualName], skipped: [] }
      });
    }

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

    // Derive prefix: P for parcel, T for dine-in, first-letter(s) of each word for custom types
    const getPrefix = (t) => {
      if (t === 'parcel') return 'P';
      if (t === 'dine-in') return 'T';
      return t.split(/[\s-]+/).map(w => (w[0] || '').toUpperCase()).join('') || 'X';
    };
    const prefix = getPrefix(type);

    for (let i = start; i <= end; i++) {
      const tableNumber = `${prefix}${i}`;
      
      try {
        insertTable.run(tableNumber, type, capacity);
        createdTables.push(tableNumber);
      } catch (e) {
        // Table already exists
        skippedTables.push(tableNumber);
      }
    }

    // Emit WebSocket event if tables were created
    if (createdTables.length > 0) {
      emitTablesRefresh();
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

    // Emit WebSocket events for real-time updates
    emitTablesRefresh(); // Refresh all table grids

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

    // Leave any merge group cleanly — free every sibling to 'available' (the whole
    // shared order ends when one of its tables is removed) so none are left stranded.
    if (table.mergeGroupId) {
      const affectedIds = propagateTableStatus(table.id, { status: 'available', currentBillId: null });
      dissolveMergeGroup(table.id);
      for (const affectedId of affectedIds) {
        if (affectedId !== table.id) {
          emitTableUpdate({ tableId: affectedId, status: 'available', currentBillId: null });
        }
      }
    }

    db.prepare('DELETE FROM restaurant_tables WHERE id = ?').run(id);

    // Emit WebSocket event for real-time updates
    emitTablesRefresh();

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
    const tableId = parseInt(id);

    // Propagate to every table sharing a merge group with this one, so merged
    // tables always mirror the same occupied/unsettled/available state and bill.
    const affectedIds = propagateTableStatus(tableId, { status, currentBillId: currentBillId || null });

    // Emit WebSocket events for real-time updates
    for (const affectedId of affectedIds) {
      emitTableUpdate({ tableId: affectedId, status, currentBillId: currentBillId || null });
    }
    emitTablesRefresh(); // Refresh all table grids

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

// Settle table (Admin only) — marks an unsettled table as available
export const settleTable = async (req, res) => {
  try {
    const { id } = req.params;
    const tableId = parseInt(id);

    const table = db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found' });
    }

    if (table.status !== 'unsettled') {
      return res.status(400).json({ success: false, message: 'Table is not in unsettled state' });
    }

    // Free every table in the merge group (if any) — settling ends the whole shared order
    const affectedIds = propagateTableStatus(tableId, { status: 'available', currentBillId: null });
    if (table.mergeGroupId) {
      dissolveMergeGroup(tableId);
    }

    for (const affectedId of affectedIds) {
      emitTableUpdate({ tableId: affectedId, status: 'available', currentBillId: null });
    }
    emitTablesRefresh();

    res.json({ success: true, message: 'Table settled successfully' });
  } catch (error) {
    console.error('Settle table error:', error);
    res.status(500).json({ success: false, message: 'Failed to settle table' });
  }
};

// ==================== TABLE MERGING ====================

// Merge two or more tables into a single shared-bill group. If one of the
// selected tables already has an active order (occupied/unsettled) that
// table becomes the "primary" and the others mirror its status/bill so any
// of them can be clicked to reach the same order.
export const mergeTables = async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body.tableIds) ? req.body.tableIds : [];
    const tableIds = [...new Set(rawIds.map(id => parseInt(id)))].filter(id => !Number.isNaN(id));

    if (tableIds.length < 2) {
      return res.status(400).json({ success: false, message: 'Select at least two tables to merge' });
    }

    const tables = tableIds.map(id => db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(id));
    const missingIndex = tables.findIndex(t => !t);
    if (missingIndex !== -1) {
      return res.status(404).json({ success: false, message: `Table ${tableIds[missingIndex]} not found` });
    }

    const alreadyMerged = tables.find(t => t.mergeGroupId);
    if (alreadyMerged) {
      return res.status(400).json({ success: false, message: `Table ${alreadyMerged.tableNumber} is already part of a merge group` });
    }

    const invalidStatus = tables.find(t => !['available', 'occupied', 'unsettled'].includes(t.status));
    if (invalidStatus) {
      return res.status(400).json({ success: false, message: `Table ${invalidStatus.tableNumber} is not available to merge` });
    }

    const activeTables = tables.filter(t => t.status === 'occupied' || t.status === 'unsettled');
    if (activeTables.length > 1) {
      return res.status(400).json({ success: false, message: 'Only one of the selected tables can have an active order' });
    }

    let primaryTableId = req.body.primaryTableId ? parseInt(req.body.primaryTableId) : null;
    if (primaryTableId && !tableIds.includes(primaryTableId)) {
      return res.status(400).json({ success: false, message: 'Primary table must be one of the selected tables' });
    }
    if (!primaryTableId) {
      primaryTableId = activeTables.length === 1 ? activeTables[0].id : Math.min(...tableIds);
    }

    const primaryTable = tables.find(t => t.id === primaryTableId);
    const mergeGroupId = uuidv4();
    const now = new Date().toISOString();

    const applyMerge = db.transaction(() => {
      const update = db.prepare(`
        UPDATE restaurant_tables
        SET mergeGroupId = ?, isMergePrimary = ?, status = ?, currentBillId = ?, updatedAt = ?
        WHERE id = ?
      `);
      for (const id of tableIds) {
        update.run(mergeGroupId, id === primaryTableId ? 1 : 0, primaryTable.status, primaryTable.currentBillId, now, id);
      }
    });
    applyMerge();

    for (const id of tableIds) {
      emitTableUpdate({ tableId: id, status: primaryTable.status, currentBillId: primaryTable.currentBillId });
    }
    emitTablesRefresh();

    res.status(201).json({
      success: true,
      message: 'Tables merged successfully',
      data: { mergeGroupId, primaryTableId, tableIds }
    });
  } catch (error) {
    console.error('Merge tables error:', error);
    res.status(500).json({ success: false, message: 'Failed to merge tables' });
  }
};

// Change which tables belong to an existing merge group (e.g. switch 4,5,6 -> 6,7,8).
// Tables leaving the group are freed to 'available'; tables joining must currently
// be available. The primary table keeps (or hands off) the real bill reference.
export const updateMergeGroup = async (req, res) => {
  try {
    const { mergeGroupId } = req.params;
    const rawIds = Array.isArray(req.body.tableIds) ? req.body.tableIds : [];
    const newIds = [...new Set(rawIds.map(id => parseInt(id)))].filter(id => !Number.isNaN(id));

    const members = db.prepare('SELECT * FROM restaurant_tables WHERE mergeGroupId = ?').all(mergeGroupId);
    if (members.length === 0) {
      return res.status(404).json({ success: false, message: 'Merge group not found' });
    }

    const currentIds = members.map(m => m.id);
    const currentPrimary = members.find(m => m.isMergePrimary) || members[0];

    const toAdd = newIds.filter(id => !currentIds.includes(id));
    const toRemove = currentIds.filter(id => !newIds.includes(id));
    const toKeep = currentIds.filter(id => newIds.includes(id));
    const finalSet = [...toKeep, ...toAdd];

    if (toAdd.length > 0) {
      const addedTables = toAdd.map(id => db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(id));
      const missingIndex = addedTables.findIndex(t => !t);
      if (missingIndex !== -1) {
        return res.status(404).json({ success: false, message: `Table ${toAdd[missingIndex]} not found` });
      }
      const notAvailable = addedTables.find(t => t.status !== 'available' || t.mergeGroupId);
      if (notAvailable) {
        return res.status(400).json({ success: false, message: `Table ${notAvailable.tableNumber} is not available to merge` });
      }
    }

    const now = new Date().toISOString();

    // Fewer than 2 tables left — dissolve the group entirely instead of leaving a 1-table "merge".
    if (finalSet.length < 2) {
      const dissolve = db.transaction(() => {
        const free = db.prepare('UPDATE restaurant_tables SET status = ?, currentBillId = NULL, mergeGroupId = NULL, isMergePrimary = 0, updatedAt = ? WHERE id = ?');
        for (const id of toRemove) {
          free.run('available', now, id);
        }
        const clear = db.prepare('UPDATE restaurant_tables SET mergeGroupId = NULL, isMergePrimary = 0, updatedAt = ? WHERE id = ?');
        for (const id of finalSet) {
          clear.run(now, id);
        }
      });
      dissolve();

      for (const id of currentIds) {
        emitTableUpdate({ tableId: id, status: finalSet.includes(id) ? undefined : 'available', currentBillId: finalSet.includes(id) ? undefined : null });
      }
      emitTablesRefresh();

      return res.json({
        success: true,
        message: 'Merge group dissolved',
        data: { dissolved: true, tableIds: finalSet }
      });
    }

    let newPrimaryId = req.body.primaryTableId ? parseInt(req.body.primaryTableId) : null;
    if (newPrimaryId && !finalSet.includes(newPrimaryId)) {
      return res.status(400).json({ success: false, message: 'Primary table must be one of the merged tables' });
    }
    if (!newPrimaryId) {
      newPrimaryId = finalSet.includes(currentPrimary.id) ? currentPrimary.id : Math.min(...finalSet);
    }

    const groupStatus = currentPrimary.status;
    const groupBillId = currentPrimary.currentBillId;

    const applyUpdate = db.transaction(() => {
      const free = db.prepare('UPDATE restaurant_tables SET status = ?, currentBillId = NULL, mergeGroupId = NULL, isMergePrimary = 0, updatedAt = ? WHERE id = ?');
      for (const id of toRemove) {
        free.run('available', now, id);
      }

      const join = db.prepare('UPDATE restaurant_tables SET mergeGroupId = ?, status = ?, currentBillId = ?, updatedAt = ? WHERE id = ?');
      for (const id of toAdd) {
        join.run(mergeGroupId, groupStatus, groupBillId, now, id);
      }

      const setPrimaryFlag = db.prepare('UPDATE restaurant_tables SET isMergePrimary = ?, updatedAt = ? WHERE id = ?');
      for (const id of finalSet) {
        setPrimaryFlag.run(id === newPrimaryId ? 1 : 0, now, id);
      }

      // Keep bills.tableId pointing at the primary so existing billController sync logic keeps working
      if (newPrimaryId !== currentPrimary.id && groupBillId) {
        db.prepare('UPDATE bills SET tableId = ?, updatedAt = ? WHERE billId = ?').run(newPrimaryId, now, groupBillId);
      }
    });
    applyUpdate();

    for (const id of [...toRemove, ...toAdd]) {
      const isRemoved = toRemove.includes(id);
      emitTableUpdate({
        tableId: id,
        status: isRemoved ? 'available' : groupStatus,
        currentBillId: isRemoved ? null : groupBillId
      });
    }
    emitTablesRefresh();

    res.json({
      success: true,
      message: 'Merge group updated successfully',
      data: { mergeGroupId, primaryTableId: newPrimaryId, tableIds: finalSet }
    });
  } catch (error) {
    console.error('Update merge group error:', error);
    res.status(500).json({ success: false, message: 'Failed to update merge group' });
  }
};

// Dissolve a merge group entirely. Non-primary members are freed to 'available';
// the primary table keeps its current status/bill and simply stops being "merged".
export const unmergeTables = async (req, res) => {
  try {
    const { mergeGroupId } = req.params;

    const members = db.prepare('SELECT * FROM restaurant_tables WHERE mergeGroupId = ?').all(mergeGroupId);
    if (members.length === 0) {
      return res.status(404).json({ success: false, message: 'Merge group not found' });
    }

    const primary = members.find(m => m.isMergePrimary) || members[0];
    const now = new Date().toISOString();

    const applyUnmerge = db.transaction(() => {
      const free = db.prepare('UPDATE restaurant_tables SET status = ?, currentBillId = NULL, mergeGroupId = NULL, isMergePrimary = 0, updatedAt = ? WHERE id = ?');
      const clear = db.prepare('UPDATE restaurant_tables SET mergeGroupId = NULL, isMergePrimary = 0, updatedAt = ? WHERE id = ?');
      for (const member of members) {
        if (member.id === primary.id) {
          clear.run(now, member.id);
        } else {
          free.run('available', now, member.id);
        }
      }
    });
    applyUnmerge();

    for (const member of members) {
      const isPrimary = member.id === primary.id;
      emitTableUpdate({
        tableId: member.id,
        status: isPrimary ? member.status : 'available',
        currentBillId: isPrimary ? member.currentBillId : null
      });
    }
    emitTablesRefresh();

    res.json({
      success: true,
      message: 'Tables unmerged successfully',
      data: { primaryTableId: primary.id, tableIds: members.map(m => m.id) }
    });
  } catch (error) {
    console.error('Unmerge tables error:', error);
    res.status(500).json({ success: false, message: 'Failed to unmerge tables' });
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
  settleTable,
  mergeTables,
  updateMergeGroup,
  unmergeTables,
  getTipOptions,
  createTipOption,
  updateTipOption,
  deleteTipOption,
  getItemNotes,
  createItemNote,
  updateItemNote,
  deleteItemNote
};
