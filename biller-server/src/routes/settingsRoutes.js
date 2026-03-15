import express from 'express';
import multer from 'multer';
import {
  getSettings,
  updateSettings,
  getApplicationTypes,
  uploadLogo,
  getCurrencies
} from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use(authenticate);

// Settings routes
router.get('/', getSettings);
router.put('/', authorize('admin'), updateSettings);
router.get('/application-types', getApplicationTypes);
router.get('/currencies', getCurrencies);
router.post('/logo', authorize('admin'), upload.single('logo'), uploadLogo);

export default router;
