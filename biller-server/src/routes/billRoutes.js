import express from 'express';
import {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  getReport,
  printBill
} from '../controllers/billController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Bill routes
router.get('/', getAllBills);
router.get('/report', getReport);
router.get('/:id', getBillById);
router.post('/', createBill);
router.put('/:id', updateBill);
router.post('/print', printBill);

export default router;
