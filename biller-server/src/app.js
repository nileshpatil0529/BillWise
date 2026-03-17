import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import config from './config/config.js';
import './config/database.js'; // Initialize SQLite database
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import billRoutes from './routes/billRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import borrowerRoutes from './routes/borrowerRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

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
app.use('/api/borrowers', borrowerRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║   🚀 Biller Server Started Successfully!                   ║
  ║                                                            ║
  ║   📍 Port: ${PORT}                                            ║
  ║   🌍 Environment: ${config.nodeEnv.padEnd(27)}║
  ║   📅 Started: ${new Date().toLocaleString().padEnd(30)}║
  ║                                                            ║
  ║   📖 API Endpoints:                                        ║
  ║      • GET  /api/health                                    ║
  ║      • POST /api/auth/login                                ║
  ║      • GET  /api/products                                  ║
  ║      • GET  /api/bills                                     ║
  ║      • GET  /api/settings                                  ║
  ║                                                            ║
  ╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
