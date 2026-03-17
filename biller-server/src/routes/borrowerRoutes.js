import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getBorrowers,
  searchBorrowers,
  getBorrowerById,
  createBorrower,
  updateBorrower,
  deleteBorrower,
  payDebt
} from '../controllers/borrowerController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/borrowers - Get all borrowers
router.get('/', getBorrowers);

// GET /api/borrowers/search - Search borrowers
router.get('/search', searchBorrowers);

// GET /api/borrowers/:id - Get borrower by ID with debt details
router.get('/:id', getBorrowerById);

// POST /api/borrowers - Create a new borrower
router.post('/', createBorrower);

// PUT /api/borrowers/:id - Update a borrower
router.put('/:id', updateBorrower);

// DELETE /api/borrowers/:id - Delete a borrower
router.delete('/:id', deleteBorrower);

// POST /api/borrowers/:id/pay - Pay debt for a borrower
router.post('/:id/pay', payDebt);

export default router;
