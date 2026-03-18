# Thermal Printer Setup Guide

This guide will help you set up and configure thermal printers for barcode printing in BillWise.

## Supported Printers

The application supports ESC/POS compatible thermal printers, including:
- **EPSON** TM series (TM-T20, TM-T82, TM-T88, etc.)
- **Star Micronics** TSP series
- Most 58mm (2 inch) and 80mm (3 inch) thermal printers

## Prerequisites

### Windows
- Install the printer driver from manufacturer
- Connect printer via USB, Serial, or Network
- Note the COM port number (e.g., COM3) or IP address

### Linux
```bash
# Install required dependencies
sudo apt-get update
sudo apt-get install libusb-1.0-0-dev build-essential

# Give permission to USB devices
sudo usermod -a -G lp $USER
sudo usermod -a -G dialout $USER
```

### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# For USB printers, identify the device
ls /dev/cu.*
```

## Configuration

### 1. Network Printer (Recommended)
Edit `.env` file and set:
```env
PRINTER_INTERFACE=tcp://192.168.1.100:9100
```
Replace `192.168.1.100` with your printer's IP address.

**How to find printer IP:**
- Print a test page from the printer (usually hold feed button)
- Check your router's DHCP client list
- Use printer's built-in network configuration menu

### 2. USB Printer (Windows)
```env
# Check Device Manager for COM port number
PRINTER_INTERFACE=\\\\.\\COM3
```

### 3. USB Printer (Linux)
```env
PRINTER_INTERFACE=/dev/usb/lp0
# or
PRINTER_INTERFACE=/dev/ttyUSB0
```

Find your device:
```bash
ls /dev/usb/lp*
ls /dev/ttyUSB*
```

### 4. USB Printer (macOS)
```env
PRINTER_INTERFACE=/dev/cu.usbserial
```

Find your device:
```bash
ls /dev/cu.*
```

## Printer Types

If your printer is not EPSON, change the printer type in `productController.js`:

```javascript
const printer = new ThermalPrinter({
  type: PrinterTypes.STAR,  // Change to STAR if using Star Micronics
  // ... other settings
});
```

Available types:
- `PrinterTypes.EPSON` - Most common ESC/POS printers
- `PrinterTypes.STAR` - Star Micronics printers

## Testing the Printer

### 1. Network Printer Test
```bash
# Windows
telnet 192.168.1.100 9100

# Linux/Mac
nc -v 192.168.1.100 9100
```

If connection succeeds, the printer is reachable.

### 2. USB Printer Test (Linux)
```bash
# Send test data
echo "Test Print" > /dev/usb/lp0
```

## Troubleshooting

### Printer Not Connected Error
1. **Check Physical Connection**
   - USB cable properly connected
   - Printer powered on
   - Network cable connected (for network printers)

2. **Verify PRINTER_INTERFACE**
   - Correct COM port or IP address
   - Proper format in .env file
   - Restart server after changing .env

3. **Windows Firewall**
   - Allow NodeJS through firewall
   - Allow port 9100 for network printers

4. **Linux Permissions**
   ```bash
   sudo chmod 666 /dev/usb/lp0
   # or add user to lp group
   sudo usermod -a -G lp $USER
   ```

5. **Network Printer Issues**
   - Ping the printer IP: `ping 192.168.1.100`
   - Check printer port is 9100 (standard ESC/POS)
   - Ensure printer has static IP or DHCP reservation

### Barcode Not Printing Correctly
1. **Check Barcode Value**
   - Ensure product has valid barcode
   - Barcode should be alphanumeric

2. **Paper Size**
   - Default is 58mm (2 inch)
   - Adjust scale in code for different sizes

3. **Print Quality**
   - Check paper roll is installed correctly
   - Clean printer head
   - Adjust print density in printer settings

### Common Error Messages

| Error | Solution |
|-------|----------|
| `ECONNREFUSED` | Check IP address and port, ensure printer is on |
| `ENOENT` | Check COM port or device path |
| `EACCES` | Fix permissions (Linux/Mac) |
| `timeout` | Increase timeout in controller or check connection |

## Paper Size Configuration

For different paper widths, modify the barcode scale in `productController.js`:

```javascript
// 58mm (2 inch) - Default
const barcodeBuffer = await bwipjs.toBuffer({
  bcid: 'code128',
  text: barcode,
  scale: 3,
  height: 10,
  // ...
});

// 80mm (3 inch)
const barcodeBuffer = await bwipjs.toBuffer({
  bcid: 'code128',
  text: barcode,
  scale: 4,      // Increased scale
  height: 12,    // Increased height
  // ...
});
```

## Usage

1. Go to Products page
2. Click the actions menu (⋮) for any product
3. Select "Print Barcode"
4. Enter the number of barcodes to print (1-100)
5. Click "Print"

The barcode label will include:
- Product name
- Barcode image
- Price

## Advanced Configuration

### Custom Label Format

Edit the `printBarcode` function in `productController.js`:

```javascript
// Add product ID
printer.println(`ID: ${product.productId}`);

// Add category
printer.println(`Category: ${product.category}`);

// Add date
printer.println(`Date: ${new Date().toLocaleDateString()}`);
```

### Multiple Printers

To support multiple printers (e.g., one for receipts, one for labels):

```env
LABEL_PRINTER_INTERFACE=tcp://192.168.1.100:9100
RECEIPT_PRINTER_INTERFACE=tcp://192.168.1.101:9100
```

### Character Sets

Change character set for different languages:

```javascript
const printer = new ThermalPrinter({
  // ...
  characterSet: 'PC437_USA',  // Default
  // Other options:
  // 'PC850_MULTILINGUAL'
  // 'PC860_PORTUGUESE'
  // 'PC865_NORDIC'
  // 'WINDOWS1252'
});
```

## Resources

- [node-thermal-printer Documentation](https://github.com/node-thermal-printer/node-thermal-printer)
- [bwip-js Barcode Types](https://github.com/metafloor/bwip-js)
- [ESC/POS Command Reference](https://reference.epson-biz.com/modules/ref_escpos/)

## Support

For issues or questions:
1. Check this documentation
2. Verify printer connectivity
3. Check server logs for error messages
4. Test printer with manufacturer's tools first
