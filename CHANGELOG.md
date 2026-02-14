# Changelog

## [v1.0.0] - 2026-02-13

### Added
- **Ultra-Detailed Debug Console:** Real-time logging of all connection events, errors, and status changes.
- **Connection Test Tool:** `connection_test.py` diagnostic tool to verify BLE connectivity methods.
- **Robust BLE Connection:** Implemented `PybricksHubBLE` based connection Logic in `pybricks_manager.py`.
- **Streamlit UI:** text editor, run/stop controls, and log viewer.

### Fixed
- **Windows Bluetooth Scanning:** Fixed `bleak` version compatibility issues (downgraded to 0.20.2).
- **AttributeError Fix:** Resolved `bleak.version` attribute error by using `importlib.metadata`.
- **Connection Signature:** Fixed `PybricksHub.connect()` signature mismatch by switching to `PybricksHubBLE(device).connect()`.

### Known Issues
- Windows Bluetooth stack may occasionally require toggling ON/OFF if scanning gets stuck (OS limitation).
