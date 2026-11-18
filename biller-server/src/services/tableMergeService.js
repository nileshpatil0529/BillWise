import db from '../config/database.js';

// ==================== TABLE MERGE HELPERS ====================
// A "merge group" is a set of restaurant_tables rows sharing the same mergeGroupId.
// Exactly one member is the "primary" (isMergePrimary = 1) and holds the real
// bills.tableId reference; the rest just mirror the primary's status/currentBillId
// so any merged table can be clicked to reach the same shared bill.

// Get every table id that shares a merge group with the given table (including itself).
// Returns [tableId] when the table is not merged.
export const getMergeGroupTableIds = (tableId) => {
  const table = db.prepare('SELECT id, mergeGroupId FROM restaurant_tables WHERE id = ?').get(tableId);
  if (!table || !table.mergeGroupId) return [tableId];

  const rows = db.prepare('SELECT id FROM restaurant_tables WHERE mergeGroupId = ?').all(table.mergeGroupId);
  return rows.map(r => r.id);
};

// Get the primary table id of the merge group that tableId belongs to (or tableId itself if unmerged).
export const getPrimaryTableId = (tableId) => {
  const table = db.prepare('SELECT id, mergeGroupId FROM restaurant_tables WHERE id = ?').get(tableId);
  if (!table || !table.mergeGroupId) return tableId;

  const primary = db.prepare('SELECT id FROM restaurant_tables WHERE mergeGroupId = ? AND isMergePrimary = 1')
    .get(table.mergeGroupId);
  return primary ? primary.id : tableId;
};

// Apply a status/currentBillId change to every table in tableId's merge group
// (or just tableId when it isn't merged). Mirrors the status everywhere so any
// merged table reflects the same occupied/unsettled/available state and bill.
export const propagateTableStatus = (tableId, { status, currentBillId, updatedAt }) => {
  const groupIds = getMergeGroupTableIds(tableId);
  const ts = updatedAt || new Date().toISOString();

  const update = db.prepare('UPDATE restaurant_tables SET status = ?, currentBillId = ?, updatedAt = ? WHERE id = ?');
  for (const id of groupIds) {
    update.run(status, currentBillId ?? null, ts, id);
  }
  return groupIds;
};

// Like propagateTableStatus, but only touches the status column (used for
// completed/reopened transitions where currentBillId must stay unchanged).
// When onlyIfStatus is given, a member is only updated if its current status matches it.
export const propagateTableStatusOnly = (tableId, status, updatedAt, onlyIfStatus) => {
  const groupIds = getMergeGroupTableIds(tableId);
  const ts = updatedAt || new Date().toISOString();

  const update = onlyIfStatus
    ? db.prepare('UPDATE restaurant_tables SET status = ?, updatedAt = ? WHERE id = ? AND status = ?')
    : db.prepare('UPDATE restaurant_tables SET status = ?, updatedAt = ? WHERE id = ?');

  for (const id of groupIds) {
    if (onlyIfStatus) {
      update.run(status, ts, id, onlyIfStatus);
    } else {
      update.run(status, ts, id);
    }
  }
  return groupIds;
};

// Dissolve the merge group tableId belongs to: clears mergeGroupId/isMergePrimary
// from every member. Does not otherwise change status/currentBillId.
export const dissolveMergeGroup = (tableId) => {
  const groupIds = getMergeGroupTableIds(tableId);
  if (groupIds.length <= 1) return groupIds;

  const now = new Date().toISOString();
  const clear = db.prepare('UPDATE restaurant_tables SET mergeGroupId = NULL, isMergePrimary = 0, updatedAt = ? WHERE id = ?');
  for (const id of groupIds) {
    clear.run(now, id);
  }
  return groupIds;
};

// Get the table numbers (e.g. ["T1", "T2", "T3"]) of every table currently
// merged with tableId, ordered by id. Returns null when tableId isn't merged —
// used to snapshot merge membership onto a bill before the merge may later be
// dissolved (e.g. on settle), so historical bills keep showing all merged tables.
export const getMergeGroupTableNumbers = (tableId) => {
  const table = db.prepare('SELECT id, mergeGroupId FROM restaurant_tables WHERE id = ?').get(tableId);
  if (!table || !table.mergeGroupId) return null;

  const rows = db.prepare('SELECT tableNumber FROM restaurant_tables WHERE mergeGroupId = ? ORDER BY id ASC').all(table.mergeGroupId);
  return rows.length > 1 ? rows.map(r => r.tableNumber) : null;
};
