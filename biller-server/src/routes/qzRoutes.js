import express from 'express';
import { getQZCertificate, signQZMessage } from '../controllers/qzController.js';

const router = express.Router();

router.get('/cert', getQZCertificate);
router.get('/sign', signQZMessage);

export default router;
