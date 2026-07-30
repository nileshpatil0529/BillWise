import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import config from './config/config.js';
import './config/database.js'; // Initialize SQLite database
import { initializeSocketIO } from './sockets/index.js';
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

// Device detection debug endpoint
app.get('/api/device', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  res.json({
    userAgent: ua,
    detectedAs: isMobileDevice(ua) ? 'mobile' : 'desktop'
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

// Device detection - mobile/tablet vs desktop
// Uses the standard `Mobi` token (Google's recommended check) plus known mobile OS identifiers.
// Avoids the bare word "mobile" which can appear in some desktop UA strings.
const isMobileDevice = (userAgent = '') => {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Windows Phone/i.test(userAgent);
};

// Serve Angular built apps (static files)
const desktopPath = path.join(__dirname, '..', 'public', 'desktop', 'browser');
const mobilePath  = path.join(__dirname, '..', 'public', 'mobile', 'browser');

// Serve static assets from both build folders
app.use('/desktop', express.static(desktopPath));
app.use('/mobile',  express.static(mobilePath));

// Root static - serve shared assets (whichever folder exists first wins)
app.use(express.static(desktopPath));
app.use(express.static(mobilePath));

// SPA fallback - detect device and serve correct index.html
// Express 5 requires named wildcard parameter
// Override: add ?app=desktop or ?app=mobile to force a specific app
app.get('/{*splat}', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    return next();
  }
  const ua = req.headers['user-agent'] || '';
  const override = req.query.app; // ?app=desktop or ?app=mobile
  const serveMobile = override === 'mobile' || (override !== 'desktop' && isMobileDevice(ua));
  if (serveMobile) {
    res.sendFile(path.join(mobilePath, 'index.html'));
  } else {
    res.sendFile(path.join(desktopPath, 'index.html'));
  }
});

// API 404 handler (only for /api routes)
app.use('/api/{*splat}', notFound);
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

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
initializeSocketIO(httpServer);

httpServer.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  const ipUrl       = `http://${localIP}:${PORT}`.padEnd(38);
  const localUrl    = `http://localhost:${PORT}`.padEnd(38);
  const networkName = `http://local.billwise:${PORT}`.padEnd(38);

  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║   🚀 BillWise Server Started Successfully!                   ║
  ║                                                              ║
  ║   📍 Local:        ${localUrl}║
  ║   🌐 Network IP:   ${ipUrl}║
  ║   🏷️  Network Name: ${networkName}║
  ║                                                              ║
  ║   📱 Mobile/Tablet → mobile app served automatically         ║
  ║   🖥️  Desktop/Laptop → desktop app served automatically      ║
  ║                                                              ║
  ║   🌍 Environment: ${config.nodeEnv.padEnd(41)}║
  ║   📅 Started:     ${new Date().toLocaleString().padEnd(41)}║
  ║                                                              ║
  ║   💡 To use local.billwise on devices:                       ║
  ║      Add to each device's hosts file:                        ║
  ║      ${`${localIP}  local.billwise`.padEnd(54)}║
  ╚══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
