import db from '../config/database.js';
import { routePrintJob } from '../sockets/index.js';

export const getPrinterConfig = async (req, res) => {
  try {
    const userId = req.user.uid;
    const config = db.prepare('SELECT * FROM user_printer_configs WHERE userId = ?').get(userId);
    res.json({
      success: true,
      data: config || { userId, printerName: null, paperSize: '3inch', enabled: 0 }
    });
  } catch (error) {
    console.error('Get printer config error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch printer config' });
  }
};

export const savePrinterConfig = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { printerName, paperSize, enabled } = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO user_printer_configs (userId, printerName, paperSize, enabled, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET
        printerName = excluded.printerName,
        paperSize = excluded.paperSize,
        enabled = excluded.enabled,
        updatedAt = excluded.updatedAt
    `).run(userId, printerName || null, paperSize || '3inch', enabled ? 1 : 0, now);

    res.json({
      success: true,
      message: 'Printer configuration saved',
      data: { userId, printerName, paperSize, enabled: Boolean(enabled) }
    });
  } catch (error) {
    console.error('Save printer config error:', error);
    res.status(500).json({ success: false, message: 'Failed to save printer config' });
  }
};

// Route a print request via socket to any online user with a printer configured
export const requestPrint = async (req, res) => {
  try {
    const { billId, type } = req.body; // type: 'bill' | 'kot'
    const requesterUserId = req.user.uid;

    if (!billId) {
      return res.status(400).json({ success: false, message: 'Bill ID is required' });
    }

    const bill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const items = db.prepare(`
      SELECT bi.*, p.nameHi, p.isLooseItem,
             (bi.quantity - COALESCE(bi.kotPrintedQuantity, 0)) as newQuantity
      FROM bill_items bi
      LEFT JOIN products p ON bi.productId = p.productId
      WHERE bi.billId = ?
    `).all(billId);

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    if (type === 'kot') {
      const newItems = items.filter(i => i.quantity > (i.kotPrintedQuantity || 0));
      if (newItems.length === 0) {
        return res.status(400).json({ success: false, message: 'No new items to print on KOT' });
      }
    }

    const billData = {
      ...bill,
      items,
      businessTypeData: bill.businessTypeData ? JSON.parse(bill.businessTypeData) : {}
    };

    const settingsData = {
      businessName: settings?.businessName,
      address: settings?.address,
      phone: settings?.phone,
      taxNumber: settings?.taxNumber,
      upiId: settings?.upiId,
      footerText: settings?.footerText,
      taxRates: settings?.taxRates ? JSON.parse(settings.taxRates) : [],
      receiptLanguage: settings?.receiptLanguage || 'en'
    };

    const result = routePrintJob({ bill: billData, settings: settingsData, type }, requesterUserId);

    if (!result.success) {
      return res.status(503).json({ success: false, message: result.message });
    }

    res.json({ success: true, message: result.message, requestId: result.requestId });
  } catch (error) {
    console.error('Request print error:', error);
    res.status(500).json({ success: false, message: 'Failed to route print request' });
  }
};

// Mark KOT items as printed (called after successful local print)
export const markKOTPrinted = async (req, res) => {
  try {
    const { id: billId } = req.params;
    const bill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE bill_items
      SET kotPrinted = 1, kotPrintedQuantity = quantity
      WHERE billId = ? AND quantity > COALESCE(kotPrintedQuantity, 0)
    `).run(billId);

    db.prepare('UPDATE bills SET kotPrintedAt = ?, updatedAt = ? WHERE billId = ?')
      .run(now, now, billId);

    const { emitKOTPrinted, emitTableUpdate } = await import('../sockets/index.js');
    const updatedBill = db.prepare('SELECT * FROM bills WHERE billId = ?').get(billId);
    const billData = { ...updatedBill, businessTypeData: JSON.parse(updatedBill.businessTypeData || '{}') };
    emitKOTPrinted(billData);
    if (updatedBill.tableId) {
      emitTableUpdate({ tableId: updatedBill.tableId, billId: updatedBill.billId, billStatus: updatedBill.billStatus });
    }

    res.json({ success: true, message: 'KOT marked as printed', data: { itemsUpdated: result.changes } });
  } catch (error) {
    console.error('Mark KOT printed error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark KOT as printed' });
  }
};
