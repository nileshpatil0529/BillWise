import express from 'express';
import {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  getReport
} from '../controllers/billController.js';
import { requestPrint, markKOTPrinted } from '../controllers/printerController.js';
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
router.delete('/:id', deleteBill);
router.post('/print', requestPrint);
router.post('/print-kot', (req, res) => { req.body.type = 'kot'; return requestPrint(req, res); });
router.post('/:id/mark-kot-printed', markKOTPrinted);

export default router;
