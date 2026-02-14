# Pybricks IDE - Text-Based Deployment Application

# Pybricks IDE for Windows (v1.0)

A standalone, text-based Python IDE for programming Pybricks hubs (SPIKE Prime, Robot Inventor) on Windows.

> **✅ VERSION 1.0 STABLE**
> - **Robust Bluetooth Connection:** Uses `Bleak` with `PybricksHubBLE` for reliable connectivity.
> - **Debug Console:** Ultra-detailed logging for troubleshooting.
> - **Manual & Auto Scan:** Flexible connection options.

## Features

- ✅ Text editor for writing Pybricks Python code
- ✅ Bluetooth LE connection to SPIKE Prime/Robot Inventor hub
- ✅ Deploy and execute scripts on the hub
- ✅ Real-time output from print() statements
- ✅ Stop execution button
- ✅ Cross-platform (Windows, macOS, Linux)

## Prerequisites

1. **LEGO SPIKE Prime or Robot Inventor hub** with **Pybricks firmware** installed
   - Visit [pybricks.com](https://pybricks.com) for firmware installation instructions
   
2. **Python 3.8 or higher**

3. **Bluetooth LE support** on your computer

## Installation

1. Clone or download this repository

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. **Turn on your SPIKE Prime/Robot Inventor hub** and make sure it's in range

2. **Run the application:**
   ```bash
   streamlit run app.py
   ```

3. **In the web interface:**
   - Click "🔍 Scan for Devices" to find your hub
   - Select your hub from the dropdown
   - Click "🔗 Connect"
   - Write your Python code in the editor
   - Click "▶️ Run" to execute
   - View output in the console panel

## Example Code

```python
from pybricks.hubs import PrimeHub
from pybricks.tools import wait

hub = PrimeHub()
hub.light.on((0, 255, 0))
print("Hello from SPIKE!")
wait(1000)
hub.light.off()
```

## Troubleshooting

### Scanning fails on Windows

**Quick Fix:** Use manual connection instead of scanning.

1. Find your hub's Bluetooth address (see `BLUETOOTH_ADDRESS_GUIDE.md`)
2. In the app, enter the address in "Bluetooth Address" field
3. Click "Connect Manually"

### No devices found during scan

- Make sure your hub is powered on
- Ensure Bluetooth is enabled on your computer
- Check that Pybricks firmware is installed on the hub
- Move the hub closer to your computer
- **Try manual connection** (see above)

### Connection fails

- Try turning the hub off and on again
- Make sure no other application is connected to the hub
- On Windows, you may need to run the application as Administrator

### Script doesn't execute

- Check for syntax errors in your code
- Make sure you're using valid Pybricks library functions
- Check the output console for error messages

## Technical Details

- **UI Framework:** Streamlit
- **Bluetooth Library:** bleak (cross-platform BLE)
- **Hub Communication:** pybricksdev
- **Language:** Python 3.8+

## License

This project is open source and available for educational purposes.
