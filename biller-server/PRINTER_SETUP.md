# Thermal Printer Setup Guide

This guide will help you set up and configure TSPL thermal printers for barcode printing in BillWise.

## Supported Printers

The application uses TSPL (TSC Printer Language) commands and supports:
- **TSC** label printers (TTP-244, TTP-345, etc.)
- **Zebra** printers with TSPL mode
- Most label printers that support TSPL commands
- 58mm thermal printer labels

## Prerequisites

### Windows
1. Install the printer driver from manufacturer
2. Share the printer or note the COM port
3. Configure printer as a network share (\\\\localhost\\PrinterName) or use COM port

### Linux
```bash
# For USB printers
sudo usermod -a -G lp $USER
sudo usermod -a -G dialout $USER
```

### macOS
```bash
# For USB printers, identify the device
ls /dev/cu.*
```

## Configuration

### 1. Windows Shared Printer (Recommended for Windows)
Edit `.env` file and set:
```env
PRINTER_INTERFACE=\\\\localhost\\MyPOS
```
Replace `MyPOS` with your printer's share name.

**How to share a printer:**
1. Open Settings > Printers & scanners
2. Select your printer > Manage > Printer properties
3. Go to Sharing tab > Share this printer
4. Note the share name

### 2. Windows COM Port
```env
PRINTER_INTERFACE=COM4
```
Check Device Manager for the correct COM port number.

### 3. Network Printer
```env
PRINTER_INTERFACE=tcp://192.168.1.100:9100
```
Replace with your printer's IP address.

### 4. USB Printer (Linux)
```env
PRINTER_INTERFACE=/dev/usb/lp0
```

### 5. USB Printer (macOS)
```env
PRINTER_INTERFACE=/dev/cu.usbserial
```

## How It Works

The application uses **TSPL commands** to print barcode labels. TSPL provides precise control over label printing with:
- Exact positioning (X, Y coordinates)
- Multiple barcode types (CODE128, EAN13, QR, etc.)
- Text formatting and box drawing
- Label size configuration

Example TSPL command:
```
SIZE 58 mm, 40 mm
GAP 3 mm, 0
CLS
BOX 10,10,440,300,3
TEXT 30,25,"3",0,1,1,"Product Name"
BARCODE 30,110,"128",80,1,0,2,2,"1234567890"
PRINT 1,1
```

## Label Format

The barcode label includes:
- **Border box** for professional appearance
- **Product name** (up to 20 characters)
- **Price** in Rupees
- **CODE128 barcode** with human-readable text
- Label size: 58mm × 40mm

## Troubleshooting

### Printer Not Working
1. **Check Printer Connection**
   - Printer is powered on
   - USB/Network cable connected
   - Windows: Verify share name or COM port
   - Network: Ping the printer IP

2. **Verify PRINTER_INTERFACE in .env**
   - Correct path/port/share name
   - Proper escape characters for Windows paths (\\\\\\\\)
   - Restart server after changing .env

3. **Test Printer Manually**
   - Windows: Print a test page from Printers & Scanners
   - Linux: `echo "Test" > /dev/usb/lp0`
   - Network: `telnet 192.168.1.100 9100`

4. **Check Permissions (Linux)**
   ```bash
   sudo chmod 666 /dev/usb/lp0
   ```

### Label Not Printing Correctly
1. **Wrong Label Size**
   - Adjust SIZE in productController.js
   - Default is 58mm × 40mm

2. **Barcode Too Large**
   - Reduce barcode height or scale in TSPL command
   - Adjust coordinates if elements overlap

3. **Text Cut Off**
   - Product names are limited to 20 characters
   - Adjust TEXT position or font size

### Common Error Messages

| Error | Solution |
|-------|----------|
| `ENOENT` | Check PRINTER_INTERFACE path, verify printer exists |
| `EACCES` | Fix permissions (Linux/Mac) or check share access (Windows) |
| `ECONNREFUSED` | Network printer not reachable, check IP and port |

## Usage

1. Go to **Products** page
2. Click the **actions menu (⋮)** for any product  
3. Select **"Print Barcode"**
4. Enter the number of labels (1-100)
5. Click **"Print"**

The printer will produce labels with:
- Product name
- Price
- CODE128 barcode

## Custom Label Format

Edit `printBarcode` in `biller-server/src/controllers/productController.js`:

```javascript
const tsplCommand = 
  `SIZE 58 mm, 40 mm\r\n` +
  `GAP 3 mm, 0\r\n` +
  `DIRECTION 1\r\n` +
  `CLS\r\n` +
  `BOX 10,10,440,300,3\r\n` +
  // Add your custom fields here
  `TEXT 30,25,"3",0,1,1,"${product.name}"\r\n` +
  `TEXT 30,60,"2",0,1,1,"Stock: ${product.stockQuantity}"\r\n` +  // New field
  `BARCODE 30,110,"128",80,1,0,2,2,"${barcode}"\r\n` +
  `PRINT ${quantity},1\r\n`;
```

## TSPL Command Reference

### Common Commands
- `SIZE width, height` - Set label size
- `GAP gap, offset` - Set gap between labels  
- `CLS` - Clear buffer
- `BOX x1,y1,x2,y2,thickness` - Draw rectangle
- `TEXT x,y,font,rotation,x_mul,y_mul,"text"` - Print text
- `BARCODE x,y,type,height,readable,rotation,narrow,wide,"data"` - Print barcode
- `PRINT quantity,copies` - Print labels

### Barcode Types
- `"128"` - CODE128 (alphanumeric)
- `"EAN13"` - EAN-13 (13 digits)
- `"QRCODE"` - QR Code (2D)
- `"39"` - CODE39

## Resources

- [TSPL Programming Manual](https://www.tscprinters.com/EN/Download/Programming-Manual)
- [TSC Printer Utilities](https://www.tscprinters.com/EN/Download/Software)

## Support

For issues:
1. Verify PRINTER_INTERFACE in .env
2. Test printer with manufacturer's tools
3. Check server logs for detailed errors
4. Ensure barcode exists for the product
