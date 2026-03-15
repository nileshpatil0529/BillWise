import express from 'express';
import { login, logout, refreshToken, changePassword, getProfile } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);

// Protected routes
router.post('/logout', authenticate, logout);
router.post('/refresh', refreshToken);
router.put('/password', authenticate, changePassword);
router.get('/profile', authenticate, getProfile);

export default router;
