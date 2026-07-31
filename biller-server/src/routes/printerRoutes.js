import express from 'express';
import { getPrinterConfig, savePrinterConfig, requestPrint } from '../controllers/printerController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', getPrinterConfig);
router.put('/', savePrinterConfig);
router.post('/request', requestPrint);

export default router;
