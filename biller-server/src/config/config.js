import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@biller.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123'
  },
  defaultPassword: 'User@123',
  cors: {
    // Allow all origins in development for local network access
    origin: process.env.CORS_ORIGIN || true
  }
};
