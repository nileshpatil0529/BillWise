import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';

let io;

// userId → socketId for all connected users (for targeted responses)
const userSockets = new Map();
// userId → socketId for users who have printer registered
const printerUsers = new Map();
// requestId → { requesterUserId, billId, type } for pending routed jobs
const pendingPrintJobs = new Map();

/**
 * Initialize Socket.IO server
 * @param {import('http').Server} httpServer
 */
export const initializeSocketIO = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,   // how often to ping clients
    pingTimeout: 60000,    // wait up to 60s for pong — tolerates PWA timer throttling
  });

  io.on('connection', (socket) => {
    console.log('✅ Socket client connected:', socket.id);

    // Join rooms for specific updates
    socket.on('join-tables-room', () => {
      socket.join('tables');
      console.log(`🎯 Socket ${socket.id} joined tables room`);
    });

    socket.on('join-bills-room', () => {
      socket.join('bills');
      console.log(`🎯 Socket ${socket.id} joined bills room`);
    });

    socket.on('join-products-room', () => {
      socket.join('products');
      console.log(`🎯 Socket ${socket.id} joined products room`);
    });

    // User identification — places them in a personal room for targeted events
    socket.on('identify', ({ userId }) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
      userSockets.set(userId, socket.id);
      socket.data.userId = userId;
    });

    // Register as a printer-capable client
    socket.on('register-printer', ({ userId }) => {
      if (!userId) return;
      printerUsers.set(userId, socket.id);
      console.log(`🖨️ Printer registered: user=${userId}, socket=${socket.id}`);
    });

    // Unregister printer (e.g., user disabled config or closed printer tab)
    socket.on('unregister-printer', ({ userId }) => {
      printerUsers.delete(userId);
      console.log(`🖨️ Printer unregistered: user=${userId}`);
    });

    // Printer client responds with result of a routed print job
    socket.on('print-job-result', ({ requestId, success, error, type }) => {
      const pending = pendingPrintJobs.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer); // cancel the stale-job timeout
      pendingPrintJobs.delete(requestId);

      // For KOT: mark items as printed in DB on success
      if (type === 'kot' && success && pending.billId) {
        try {
          const now = new Date().toISOString();
          db.prepare(`
            UPDATE bill_items
            SET kotPrinted = 1, kotPrintedQuantity = quantity
            WHERE billId = ? AND quantity > COALESCE(kotPrintedQuantity, 0)
          `).run(pending.billId);
          db.prepare('UPDATE bills SET kotPrintedAt = ?, updatedAt = ? WHERE billId = ?')
            .run(now, now, pending.billId);

          const updatedBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(pending.billId);
          if (updatedBill) {
            const billData = { ...updatedBill, businessTypeData: JSON.parse(updatedBill.businessTypeData || '{}') };
            emitKOTPrinted(billData);
            if (updatedBill.tableId) {
              emitTableUpdate({ tableId: updatedBill.tableId, billId: updatedBill.billId, billStatus: updatedBill.billStatus });
            }
          }
        } catch (e) {
          console.error('Socket: Error marking KOT printed:', e.message);
        }
      }

      // Relay result back to the original requester
      if (pending.requesterUserId) {
        io.to(`user:${pending.requesterUserId}`).emit('print-response', {
          requestId,
          success,
          error: error || null,
          type
        });
      }
    });

    socket.on('disconnect', (reason) => {
      const userId = socket.data.userId;
      if (userId) {
        // Avoid reconnect race: only clear mappings if they still point to this socket.
        if (userSockets.get(userId) === socket.id) {
          userSockets.delete(userId);
        }
        if (printerUsers.get(userId) === socket.id) {
          printerUsers.delete(userId);
        }
      }
      console.log('❌ Socket client disconnected:', socket.id, reason);
    });

    // Send welcome message
    socket.emit('connected', { message: 'Connected to Biller WebSocket server' });
  });

  console.log('🔌 Socket.IO server initialized');
  return io;
};

const PRINT_JOB_TIMEOUT_MS = 30_000;
const MAX_PRINT_RETRIES = 3;

/** Returns the first connected printer socket, pruning stale entries. */
const findConnectedPrinter = () => {
  for (const [uid, sid] of printerUsers.entries()) {
    const sock = io.sockets.sockets.get(sid);
    if (sock?.connected) return { socketId: sid, userId: uid };
    printerUsers.delete(uid); // stale — clean up
  }
  return { socketId: null, userId: null };
};

/** Dispatch a job to the printer and arm a timeout that auto-retries silently. */
const dispatchPrintJob = (requestId, payload, requesterUserId, retryCount) => {
  const timer = setTimeout(() => {
    if (!pendingPrintJobs.has(requestId)) return;
    pendingPrintJobs.delete(requestId);

    if (retryCount < MAX_PRINT_RETRIES) {
      const { socketId, userId } = findConnectedPrinter();
      if (socketId) {
        const newId = uuidv4();
        console.warn(`⚠️ Print job timed out, auto-retry ${retryCount + 1}/${MAX_PRINT_RETRIES}: ${newId}`);
        dispatchPrintJob(newId, payload, requesterUserId, retryCount + 1);
        io.to(socketId).emit('print-job', { requestId: newId, ...payload });
        return;
      }
    }

    // All retries exhausted — only now tell the requester
    console.warn(`❌ Print job failed after ${retryCount} retries: requestId=${requestId}`);
    if (requesterUserId) {
      io.to(`user:${requesterUserId}`).emit('print-response', {
        requestId, success: false,
        error: 'Printer unavailable after multiple attempts — please check the printer and try again.',
        type: payload.type
      });
    }
  }, PRINT_JOB_TIMEOUT_MS);

  pendingPrintJobs.set(requestId, {
    requesterUserId, billId: payload.bill?.billId || null,
    type: payload.type, payload, timer
  });
};

/**
 * Route a print job to any online user who has a printer registered.
 * Returns { success, message, requestId? }
 */
export const routePrintJob = (payload, requesterUserId) => {
  if (!io) return { success: false, message: 'Socket server not initialized' };

  const { socketId: printerSocketId, userId: printerUserId } = findConnectedPrinter();

  if (!printerSocketId) {
    return {
      success: false,
      message: 'No printer is currently available. Ask a user with printer setup to stay connected.'
    };
  }

  const requestId = uuidv4();
  dispatchPrintJob(requestId, payload, requesterUserId, 0);

  io.to(printerSocketId).emit('print-job', { requestId, ...payload });
  console.log(`🖨️ Print job routed: requestId=${requestId}, type=${payload.type}, printer user=${printerUserId}`);

  return { success: true, message: 'Print job sent to printer', requestId };
};

/**
 * Get the Socket.IO instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocketIO first.');
  }
  return io;
};

/**
 * Emit table update to all clients in tables room
 */
export const emitTableUpdate = (tableData) => {
  if (io) {
    console.log('📤 Emitting table-updated event:', tableData);
    io.to('tables').emit('table-updated', tableData);
  }
};

/**
 * Emit tables refresh needed (for bulk operations)
 */
export const emitTablesRefresh = () => {
  if (io) {
    io.to('tables').emit('tables-refresh-needed');
  }
};

/**
 * Emit bill created/updated to all clients in bills room
 */
export const emitBillUpdate = (billData) => {
  if (io) {
    console.log('📤 Emitting bill-updated event for billId:', billData.billId);
    io.to('bills').emit('bill-updated', billData);
  }
};

/**
 * Emit bill created event
 */
export const emitBillCreated = (billData) => {
  if (io) {
    console.log('📤 Emitting bill-created event for billId:', billData.billId);
    io.to('bills').emit('bill-created', billData);
  }
};

/**
 * Emit bill deleted event
 */
export const emitBillDeleted = (billId) => {
  if (io) {
    console.log('📤 Socket: Emitting bill-deleted event to bills room, billId:', billId);
    io.to('bills').emit('bill-deleted', { billId });
    console.log('✅ Socket: bill-deleted event emitted successfully');
  } else {
    console.error('❌ Socket: Cannot emit bill-deleted - io is null');
  }
};

/**
 * Emit bills refresh needed (for bulk operations)
 */
export const emitBillsRefresh = () => {
  if (io) {
    io.to('bills').emit('bills-refresh-needed');
  }
};

/**
 * Emit product update to all clients in products room
 */
export const emitProductUpdate = (productData) => {
  if (io) {
    io.to('products').emit('product-updated', productData);
  }
};

/**
 * Emit low stock alert
 */
export const emitLowStockAlert = (productData) => {
  if (io) {
    io.to('products').emit('low-stock-alert', productData);
  }
};

/**
 * Emit KOT printed event
 */
export const emitKOTPrinted = (billData) => {
  if (io) {
    console.log('📤 Emitting kot-printed event for billId:', billData.billId, 'printError:', billData.printError || false);
    io.to('bills').emit('kot-printed', billData);
  }
};

/**
 * Emit conflict detection (for optimistic locking)
 */
export const emitConflict = (data, socketId) => {
  if (io && socketId) {
    io.to(socketId).emit('conflict-detected', data);
  }
};
