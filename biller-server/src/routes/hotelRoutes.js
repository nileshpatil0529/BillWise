import express from 'express';
import {
  getTables,
  getTable,
  createTables,
  updateTable,
  deleteTable,
  updateTableStatus,
  getTipOptions,
  createTipOption,
  updateTipOption,
  deleteTipOption
} from '../controllers/hotelController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Restaurant Tables routes
router.get('/tables', getTables);
router.get('/tables/:id', getTable);
router.post('/tables', createTables);
router.put('/tables/:id', updateTable);
router.delete('/tables/:id', deleteTable);
router.patch('/tables/:id/status', updateTableStatus);

// Tip Options routes
router.get('/tips', getTipOptions);
router.post('/tips', createTipOption);
router.put('/tips/:id', updateTipOption);
router.delete('/tips/:id', deleteTipOption);

export default router;
