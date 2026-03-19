import express from 'express';
import fs from 'fs';
import { printer as ThermalPrinter, types as PrinterTypes } from "node-thermal-printer";

const app = express();
app.use(express.json());

const PRINTER_PATH = '\\\\localhost\\MyPOS';

/**
 * 1. ESC/POS API - रेस्टोरेंट/रिटेल रसीद (Receipt)
 * यह रसीद रोल के लिए है। इसमें टेक्स्ट एलाइनमेंट और टेबल फॉर्मेटिंग है।
 */
app.post('/api/print/esc', async (req, res) => {
    const { orderId, items, total } = req.body;

    let printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: PRINTER_PATH,
        width: 32, // 58mm प्रिंटर के लिए
    });

    try {
        printer.alignCenter();
        printer.setTextDoubleHeight();
        printer.println("MOM'S KITCHEN");
        printer.setTextNormal();
        printer.println("Order ID: #" + (orderId || '101'));
        printer.drawLine();

        printer.alignLeft();
        // आइटम लिस्ट लूप
        if (items && items.length > 0) {
            items.forEach(item => {
                printer.println(`${item.name.padEnd(20)} ${item.price.toString().padStart(10)}`);
            });
        } else {
            printer.println("Masala Dosa             60.00");
            printer.println("Cold Coffee             40.00");
        }

        printer.drawLine();
        printer.alignRight();
        printer.setTextDoubleHeight();
        printer.println("TOTAL: RS " + (total || "100.00"));
        printer.setTextNormal();
        
        printer.newLine();
        printer.alignCenter();
        printer.println("Thank you for visiting!");
        printer.printQR("https://feedback.moms.com");
        
        printer.cut();
        await printer.execute();
        res.json({ success: true, message: "Receipt printed!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 2. TSPL API - ई-कॉमर्स शिपिंग लेबल (Shipping Label)
 * यह स्टिकर लेबल के लिए है। इसमें सटीक पोजीशनिंग और 1D बारकोड है।
 */
app.post('/api/print/tspl', (req, res) => {
    const { trackingId, customer } = req.body;

    // TSPL में हमें हर चीज़ की X और Y पोजीशन (pixels में) देनी होती है
    const tsplCommand = 
        `SIZE 58 mm, 40 mm\r\n` +   // लेबल का साइज
        `GAP 3 mm, 0\r\n` +         // लेबल के बीच का गैप
        `DIRECTION 1\r\n` + 
        `CLS\r\n` + 
        `BOX 10,10,440,300,4\r\n` + // बॉर्डर बॉक्स
        `TEXT 30,30,"3",0,1,1,"SHIP TO:"\r\n` +
        `TEXT 30,70,"2",0,1,1,"${customer || 'VISHAL VERMA'}"\r\n` +
        `TEXT 30,100,"2",0,1,1,"SECTOR 62, NOIDA"\r\n` +
        `BARCODE 30,150,"128",80,1,0,2,2,"${trackingId || 'TRK789012'}"\r\n` +
        `PRINT 1,1\r\n`;

    const buffer = Buffer.from(tsplCommand, 'ascii');

    fs.appendFile(PRINTER_PATH, buffer, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: "Shipping label printed!" });
    });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
