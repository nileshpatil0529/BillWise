import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certPath = path.join(__dirname, '..', '..', 'certs', 'digital-certificate.txt');
const keyPath = path.join(__dirname, '..', '..', 'certs', 'private-key.pem');

export const getQZCertificate = (req, res) => {
  try {
    const cert = fs.readFileSync(certPath, 'utf8');
    res.type('text/plain').send(cert);
  } catch (error) {
    console.error('QZ cert read error:', error);
    res.status(500).send('Failed to load QZ certificate');
  }
};

export const signQZMessage = (req, res) => {
  try {
    const toSign = req.query.request;
    if (!toSign) {
      return res.status(400).send('Missing request');
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const signer = crypto.createSign('RSA-SHA512');
    signer.update(String(toSign));
    signer.end();

    const signature = signer.sign(privateKey, 'base64');
    res.type('text/plain').send(signature);
  } catch (error) {
    console.error('QZ sign error:', error);
    res.status(500).send('Failed to sign request');
  }
};
