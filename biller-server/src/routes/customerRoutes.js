import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getCustomers,
  searchCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  payDebt
} from '../controllers/customerController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/customers - Get all customers
router.get('/', getCustomers);

// GET /api/customers/search - Search customers
router.get('/search', searchCustomers);

// GET /api/customers/:id - Get customer by ID with debt details
router.get('/:id', getCustomerById);

// POST /api/customers - Create a new customer
router.post('/', createCustomer);

// PUT /api/customers/:id - Update a customer
router.put('/:id', updateCustomer);

// DELETE /api/customers/:id - Delete a customer
router.delete('/:id', deleteCustomer);

// POST /api/customers/:id/pay - Pay debt for a customer
router.post('/:id/pay', payDebt);

export default router;
