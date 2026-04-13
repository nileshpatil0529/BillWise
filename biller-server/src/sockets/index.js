import { Server } from 'socket.io';

let io;

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
    transports: ['websocket', 'polling']
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

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket client disconnected:', socket.id, reason);
    });

    // Send welcome message
    socket.emit('connected', { message: 'Connected to Biller WebSocket server' });
  });

  console.log('🔌 Socket.IO server initialized');
  return io;
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
