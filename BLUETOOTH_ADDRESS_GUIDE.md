# How to Find Your Hub's Bluetooth Address

If scanning doesn't work on your Windows system, you can connect manually using your hub's Bluetooth MAC address.

## Method 1: Windows Settings

1. **Turn on your SPIKE Prime/Robot Inventor hub**
2. **Open Windows Settings** → Bluetooth & devices
3. **Look for your hub** in the device list (it should show as "Pybricks Hub" or similar)
4. **Click on the device** → More Bluetooth settings or device properties
5. **Copy the Bluetooth address** (format: XX:XX:XX:XX:XX:XX)

## Method 2: Windows Device Manager

1. **Open Device Manager** (Win + X → Device Manager)
2. **Expand "Bluetooth"** section
3. **Find your Pybricks hub** in the list
4. **Right-click** → Properties → Details tab
5. **Select "Bluetooth device address"** from the dropdown
6. **Copy the address**

## Method 3: PowerShell

Run this command in PowerShell:

```powershell
Get-PnpDevice -Class Bluetooth | Where-Object {$_.FriendlyName -like "*Pybricks*"} | Select-Object FriendlyName, InstanceId
```

The address will be in the InstanceId field.

## Using the Address

Once you have the address:
1. Open the Pybricks IDE (http://localhost:8504)
2. Paste the address in the "Bluetooth Address" field
3. Click "Connect Manually"

**Example address format:** `A4:C1:38:12:34:56`
