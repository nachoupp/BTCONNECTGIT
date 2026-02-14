"""
Pybricks Hub Manager - Bluetooth LE communication with SPIKE Prime/Robot Inventor
"""
import asyncio
import os
import logging
from typing import Optional, List, Callable
from bleak import BleakScanner, BleakClient
from pybricksdev.ble import find_device
from pybricksdev.connections.pybricks import PybricksHubBLE

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Disable tqdm globally to prevent conflicts with Streamlit on Windows
os.environ['TQDM_DISABLE'] = '1'

class PybricksManager:
    """Manages Bluetooth connection and script deployment to Pybricks hub"""
    
    def __init__(self):
        self.hub: Optional[PybricksHubBLE] = None
        self.client: Optional[BleakClient] = None
        self.connected = False
        self.output_callback: Optional[Callable[[str], None]] = None
        
    async def scan_devices(self, timeout: float = 5.0) -> List[dict]:
        """
        Scan for Pybricks-compatible Bluetooth devices
        
        Args:
            timeout: Scan duration in seconds
            
        Returns:
            List of device dictionaries with 'name' and 'address' keys
        """
        logger.info(f"Scanning for Pybricks devices (timeout: {timeout}s)...")
        devices = []
        
        try:
            # Simple scan with bleak 0.20.2 (works on Windows)
            discovered = await BleakScanner.discover(timeout=timeout)
            
            # Filter for Pybricks hubs
            for device in discovered:
                # Check for Pybricks name
                if device.name and "Pybricks" in device.name:
                    devices.append({
                        "name": device.name,
                        "address": device.address
                    })
                    logger.info(f"Found device: {device.name} ({device.address})")
            
            if not devices:
                logger.warning("No Pybricks devices found. Make sure hub is on and in range.")
                
        except Exception as e:
            logger.error(f"Error during device scan: {e}")
            raise RuntimeError(f"Bluetooth scanning failed: {str(e)}")
            
        return devices
    
    async def connect(self, device_address: str) -> bool:
        """
        Connect to a Pybricks hub
        
        Args:
            device_address: Bluetooth address of the hub
            
        Returns:
            True if connection successful, False otherwise
        """
        try:
            logger.info(f"Connecting to {device_address}...")
            
            # We need to find the BLEDevice object first because PybricksHubBLE requires it
            logger.info("Scanning for device object...")
            device = await BleakScanner.find_device_by_address(device_address, timeout=10.0)
            
            if not device:
                # Fallback: try discover and filter
                logger.warning(f"Device {device_address} not found by address, trying discover...")
                found = await BleakScanner.discover(timeout=5.0)
                for d in found:
                    if d.address == device_address:
                        device = d
                        break
            
            if not device:
                raise RuntimeError(f"Device {device_address} not found in scan")
            
            logger.info(f"Found device object: {device}")
            
            # Use PybricksHubBLE which handles BLE connections
            self.hub = PybricksHubBLE(device)
            await self.hub.connect()
            
            self.connected = True
            logger.info("Connected successfully!")
            return True
            
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self.connected = False
            # Clean up hub instance on failure
            self.hub = None
            raise e # Re-raise to show specific error in UI
    
    async def disconnect(self):
        """Disconnect from the hub"""
        if self.hub:
            try:
                await self.hub.disconnect()
                logger.info("Disconnected from hub")
            except Exception as e:
                logger.error(f"Error during disconnect: {e}")
            finally:
                self.hub = None
                self.connected = False
    
    async def run_script(self, script: str):
        """
        Upload and execute a Python script on the hub
        
        Args:
            script: Python code to execute
        """
        if not self.connected or not self.hub:
            raise RuntimeError("Not connected to hub")
        
        # Create temp file for the script
        import os
        import tempfile
        
        # Sanitize script
        script_code = str(script).strip()
        
        # Write script to temp file with explicit UTF-8 encoding
        fd, script_path = tempfile.mkstemp(suffix='.py', text=True)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', errors='replace') as f:
                f.write(script_code)
            
            logger.info(f"Running script from {script_path}...")
            
            # Simple run (blocking until finished)
            await self.hub.run(script_path, wait=True, print_output=True)
            logger.info("Script execution finished")
            
        except Exception as e:
            logger.error(f"Error running script: {e}")
            raise
        finally:
            # Clean up temp file
            if os.path.exists(script_path):
                try:
                    os.unlink(script_path)
                except:
                    pass
    
    async def stop_script(self):
        """Stop the currently running script"""
        if not self.connected or not self.hub:
            raise RuntimeError("Not connected to hub")
        
        try:
            logger.info("Stopping script execution...")
            await self.hub.disconnect()
            await self.connect(self.hub.device.address)
            logger.info("Script stopped (reconnected to hub)")
        except Exception as e:
            logger.error(f"Error stopping script: {e}")
            raise
