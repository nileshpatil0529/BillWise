# Thermal Printer Setup Guide

This guide will help you set up and configure ESC/POS thermal printers for printing in BillWise.

## Supported Printers

The application uses ESC/POS commands and supports:
- **EPSON** TM series (TM-T20, TM-T82, TM-T88, etc.)
- **Star Micronics** TSP series
- Most 58mm (2 inch) thermal receipt printers
- Any ESC/POS compatible thermal printer

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

The application uses **ESC/POS commands** for thermal printing:

### Bill Printing
- Business header with company details
- Bill number and date
- Customer information
- Itemized list with quantities and prices
- Subtotal, discount, tax breakdown
- Grand total (bold)
- Payment details
- Thank you message

### Product Label Printing (QR Code)
- QR code centered (generated from barcode number)
- Product name below QR code
- Price below product name
- Divider line
- Supports printing multiple labels at once

## Label Format

The product QR label includes:
- **QR Code** (center) - encodes the product barcode
- **Product name** (centered, up to 32 characters)
- **Price** in Rupees (centered, rounded)
- **Divider** for separation

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

### QR Code Not Printing
1. **Printer Compatibility**
   - Ensure printer supports QR code printing
   - Most modern ESC/POS printers support QR codes
   - Check printer manual for QR support

2. **Barcode Too Long**
   - QR codes can handle long data
   - If issues, try shorter barcodes

### Common Error Messages

| Error | Solution |
|-------|----------|
| `ENOENT` | Check PRINTER_INTERFACE path, verify printer exists |
| `EACCES` | Fix permissions (Linux/Mac) or check share access (Windows) |
| `ECONNREFUSED` | Network printer not reachable, check IP and port |

## Usage

### Print Bills
1. Go to **Bills** page
2. Click the **Print** button for any bill
3. Receipt will print with all bill details

### Print Product Labels
1. Go to **Products** page
2. Click **actions menu (⋮)** for any product
3. Select **"Print Barcode"**
4. Enter the number of labels (1-100)
5. Click **"Print"**

The printer will produce QR code labels with:
- QR code (scannable)
- Product name
- Price

## Resources

- [ESC/POS Command Reference](https://reference.epson-biz.com/modules/ref_escpos/)

## Support

For issues:
1. Verify PRINTER_INTERFACE in .env
2. Test printer with manufacturer's tools
3. Check server logs for detailed errors
4. Ensure printer supports ESC/POS commands
