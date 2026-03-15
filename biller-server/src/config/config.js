import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@biller.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123'
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:4200'
  }
};
