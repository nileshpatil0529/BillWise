import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import config from './config/config.js';
import './config/database.js'; // Initialize SQLite database
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import billRoutes from './routes/billRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import userRoutes from './routes/userRoutes.js';
import hotelRoutes from './routes/hotelRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// ES Module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (development only)
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Biller API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/hotel', hotelRoutes);

// Serve Angular built app (static files)
const publicPath = path.join(__dirname, '..', 'public', 'browser');
app.use(express.static(publicPath));

// SPA fallback - redirect all non-API routes to index.html
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// API 404 handler (only for /api routes)
app.use('/api/*', notFound);
app.use(errorHandler);

// Get local IP address for display
const getLocalIP = () => {
  const networkInterfaces = os.networkInterfaces();
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
};

// Start server
const PORT = config.port;
const HOST = '0.0.0.0'; // Bind to all network interfaces for WiFi access
app.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  const ipPadded = `http://${localIP}:${PORT}`.padEnd(25);
  
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║   🚀 Biller Server Started Successfully!                   ║
  ║   📍 Local:   http://localhost:${PORT}                       ║
  ║   🌐 Network: ${ipPadded}║
  ║   🌍 Environment: ${config.nodeEnv.padEnd(27)}║
  ║   📅 Started: ${new Date().toLocaleString().padEnd(30)}║
  ╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
