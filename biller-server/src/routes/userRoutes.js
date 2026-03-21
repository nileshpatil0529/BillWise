import express from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  changePassword
} from '../controllers/userController.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// User management routes (admin only)
router.get('/', requireAdmin, getAllUsers);
router.post('/', requireAdmin, createUser);
router.put('/:uid', requireAdmin, updateUser);
router.delete('/:uid', requireAdmin, deleteUser);
router.post('/:uid/reset-password', requireAdmin, resetUserPassword);

// Change own password (any authenticated user)
router.post('/change-password', changePassword);

export default router;
