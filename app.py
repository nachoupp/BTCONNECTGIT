"""
Pybricks IDE - Text-based deployment application for LEGO SPIKE Prime/Robot Inventor
NO BLOCKS. NO SCRATCH. PURE PYTHON CODE EDITOR.
"""
import streamlit as st
import asyncio
import os

# Disable tqdm globally to prevent conflicts with Streamlit on Windows
os.environ['TQDM_DISABLE'] = '1'

import traceback
from datetime import datetime
from pybricks_manager import PybricksManager

# Debug logging system
def debug(level, message, details=None):
    """
    Add entry to debug log with timestamp
    
    Args:
        level: INFO, SUCCESS, ERROR, WARN, DEBUG
        message: Main log message
        details: Optional dict/list/str with additional information
    """
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]  # HH:MM:SS.mmm
    
    log_entry = {
        "timestamp": timestamp,
        "level": level,
        "message": message,
        "details": details
    }
    
    if "debug_log" not in st.session_state:
        st.session_state.debug_log = []
    
    st.session_state.debug_log.append(log_entry)

# Page configuration
st.set_page_config(
    page_title="Pybricks IDE V2.0",
    page_icon="🤖",
    layout="wide"
)

# Initialize session state
if "manager" not in st.session_state:
    st.session_state.manager = PybricksManager()
if "devices" not in st.session_state:
    st.session_state.devices = []
if "output" not in st.session_state:
    st.session_state.output = []
if "debug_log" not in st.session_state:
    st.session_state.debug_log = []
if "code" not in st.session_state:
    st.session_state.code = """from pybricks.hubs import PrimeHub
from pybricks.tools import wait

hub = PrimeHub()
hub.light.on((0, 255, 0))
print("Hello from SPIKE!")
wait(1000)
hub.light.off()
"""

# Header
st.title("🤖 Pybricks IDE V1.0")
st.markdown("**Pure Python Code Editor** - Deploy MicroPython scripts to LEGO SPIKE Prime/Robot Inventor")
st.markdown("---")

# Layout: Two columns
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("📝 Code Editor")
    
    # Text editor
    code = st.text_area(
        "Write your Pybricks Python code:",
        value=st.session_state.code,
        height=400,
        key="code_editor",
        help="Write pure Python code using Pybricks library"
    )
    st.session_state.code = code
    
    # Control buttons
    btn_col1, btn_col2, btn_col3 = st.columns([1, 1, 4])
    
    with btn_col1:
        if st.button("▶️ Run", type="primary", disabled=not st.session_state.manager.connected):
            if st.session_state.manager.connected:
                debug("INFO", "Run button clicked", {"code_length": len(st.session_state.code)})
                with st.spinner("Uploading and executing..."):
                    try:
                        # Clear previous output
                        st.session_state.output = []
                        debug("DEBUG", "Cleared output buffer")
                        
                        debug("INFO", "Starting script upload and execution")
                        
                        # Use a persistent container for real-time output
                        # Run script (now a standard async call)
                        asyncio.run(st.session_state.manager.run_script(st.session_state.code))
                        
                        debug("SUCCESS", "Script executed successfully!")
                        st.success("✅ Script executed successfully!")
                    except Exception as e:
                        debug("ERROR", "Script execution failed", {
                            "exception": str(e),
                            "type": type(e).__name__,
                            "traceback": traceback.format_exc()
                        })
                        st.error(f"❌ Error: {str(e)}")
    
    with btn_col2:
        if st.button("⏹️ Stop", disabled=not st.session_state.manager.connected):
            debug("INFO", "Stop button clicked")
            try:
                debug("DEBUG", "Calling stop_script()")
                asyncio.run(st.session_state.manager.stop_script())
                debug("SUCCESS", "Script stopped successfully")
                st.info("Script stopped")
            except Exception as e:
                debug("ERROR", "Failed to stop script", {
                    "exception": str(e),
                    "traceback": traceback.format_exc()
                })
                st.error(f"Error stopping: {str(e)}")

with col2:
    st.subheader("🔌 Connection")
    
    # Connection status
    if st.session_state.manager.connected:
        st.success("✅ Connected")
    else:
        st.warning("⚠️ Not connected")
    
    # Scan for devices (NOW WORKS!)
    if st.button("🔍 Scan for Devices", type="primary", disabled=st.session_state.manager.connected):
        debug("INFO", "Scan button clicked", {"timeout": 5.0})
        with st.spinner("Scanning for Pybricks hubs..."):
            try:
                debug("DEBUG", "Starting BLE scan...")
                devices = asyncio.run(st.session_state.manager.scan_devices(timeout=5.0))
                st.session_state.devices = devices
                if devices:
                    debug("SUCCESS", f"Found {len(devices)} Pybricks device(s)", {
                        "devices": [{"name": d['name'], "address": d['address']} for d in devices]
                    })
                    st.success(f"Found {len(devices)} Pybricks device(s)!")
                else:
                    debug("WARN", "No Pybricks devices found in scan")
                    st.warning("No Pybricks devices found. Make sure hub is on.")
            except Exception as e:
                debug("ERROR", "BLE scan failed", {
                    "exception": str(e),
                    "type": type(e).__name__,
                    "traceback": traceback.format_exc()
                })
                st.error(f"Scan error: {str(e)}")
    
    # Device selection
    if st.session_state.devices:
        device_names = [f"{d['name']} ({d['address']})" for d in st.session_state.devices]
        selected = st.selectbox("Select device:", device_names)
        
        if selected:
            selected_idx = device_names.index(selected)
            selected_device = st.session_state.devices[selected_idx]
            
            if st.button("🔗 Connect", type="primary"):
                debug("INFO", "Connect button clicked", {
                    "device_name": selected_device['name'],
                    "device_address": selected_device['address']
                })
                with st.spinner(f"Connecting to {selected_device['name']}..."):
                    try:
                        debug("DEBUG", "Calling hub.connect()...", {"address": selected_device['address']})
                        success = asyncio.run(st.session_state.manager.connect(selected_device['address']))
                        if success:
                            debug("SUCCESS", "Hub connected successfully!", {
                                "device": selected_device['name'],
                                "address": selected_device['address']
                            })
                            st.success("Connected!")
                            st.rerun()
                        else:
                            debug("ERROR", "Connection returned False")
                            st.error("Connection failed")
                    except Exception as e:
                        debug("ERROR", "Connection exception", {
                            "exception": str(e),
                            "type": type(e).__name__,
                            "traceback": traceback.format_exc()
                        })
                        st.error(f"Error: {str(e)}")
    
    # Manual connection option (as backup)
    with st.expander("📝 Or connect manually"):
        manual_address = st.text_input(
            "Bluetooth Address:",
            placeholder="A4:C1:38:12:34:56",
            help="Enter hub's Bluetooth address if scanning doesn't find it"
        )
        
        if st.button("🔗 Connect Manually", disabled=not manual_address):
            debug("INFO", "Manual connect button clicked", {"address": manual_address})
            with st.spinner(f"Connecting to {manual_address}..."):
                try:
                    debug("DEBUG", "Calling hub.connect() with manual address", {"address": manual_address})
                    success = asyncio.run(st.session_state.manager.connect(manual_address))
                    if success:
                        debug("SUCCESS", "Manual connection successful!", {"address": manual_address})
                        st.success("Connected!")
                        st.rerun()
                    else:
                        debug("ERROR", "Manual connection returned False")
                        st.error("Connection failed")
                except Exception as e:
                    debug("ERROR", "Manual connection exception", {
                        "exception": str(e),
                        "type": type(e).__name__,
                        "traceback": traceback.format_exc()
                    })
                    st.error(f"Error: {str(e)}")
    
    # Disconnect button
    if st.session_state.manager.connected:
        if st.button("🔌 Disconnect"):
            debug("INFO", "Disconnect button clicked")
            try:
                debug("DEBUG", "Calling hub.disconnect()")
                asyncio.run(st.session_state.manager.disconnect())
                st.session_state.devices = []
                debug("SUCCESS", "Disconnected successfully")
                st.rerun()
            except Exception as e:
                debug("ERROR", "Disconnect failed", {
                    "exception": str(e),
                    "traceback": traceback.format_exc()
                })
    
    st.markdown("---")
    
    # Output console
    st.subheader("📟 Output")
    output_container = st.container(height=300)
    
    with output_container:
        if st.session_state.output:
            for line in st.session_state.output:
                st.code(line)
        else:
            st.text("Output will appear here...")

# Footer
st.markdown("---")
st.markdown("**Note:** Make sure your SPIKE Prime/Robot Inventor hub has Pybricks firmware installed.")
st.markdown("Visit [pybricks.com](https://pybricks.com) for firmware installation instructions.")

# ============================================================================
# DEBUG CONSOLE SECTION
# ============================================================================
st.markdown("---")
st.markdown("## 🖥️ CONSOLA DE DEBUG DETALLADA")

# Control buttons
debug_col1, debug_col2, debug_col3 = st.columns([1, 1, 4])

with debug_col1:
    if st.button("🗑️ Limpiar Log"):
        st.session_state.debug_log = []
        debug("INFO", "Debug log cleared by user")
        st.rerun()

with debug_col2:
    if st.button("📥 Descargar Log"):
        if st.session_state.debug_log:
            # Generate log file content
            log_content = "PYBRICKS IDE - DEBUG LOG\n"
            log_content += "=" * 80 + "\n"
            log_content += f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            log_content += "=" * 80 + "\n\n"
            
            for entry in st.session_state.debug_log:
                log_content += f"[{entry['timestamp']}] {entry['level']}: {entry['message']}\n"
                if entry['details']:
                    import json
                    log_content += f"  Details: {json.dumps(entry['details'], indent=2)}\n"
                log_content += "\n"
            
            # Offer download
            st.download_button(
                label="💾 Download debug.txt",
                data=log_content,
                file_name=f"pybricks_debug_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                mime="text/plain"
            )

# Debug log display
debug_container = st.container(height=400)

with debug_container:
    if st.session_state.debug_log:
        # Level emoji mapping
        level_emoji = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "ERROR": "❌",
            "WARN": "⚠️",
            "DEBUG": "🔍"
        }
        
        # Display each log entry
        for entry in st.session_state.debug_log:
            emoji = level_emoji.get(entry['level'], "📝")
            timestamp = entry['timestamp']
            level = entry['level']
            message = entry['message']
            details = entry['details']
            
            # Format log line
            log_line = f"`{timestamp}` {emoji} **{level}**: {message}"
            st.markdown(log_line)
            
            # Display details if present
            if details:
                if isinstance(details, dict):
                    # Format dict details with indentation
                    st.markdown("```")
                    import json
                    st.text(json.dumps(details, indent=2))
                    st.markdown("```")
                elif isinstance(details, list):
                    # Format list details
                    st.markdown("```")
                    import json
                    st.text(json.dumps(details, indent=2))
                    st.markdown("```")
                else:
                    # String details
                    st.markdown(f"  _{details}_")
            
            st.markdown("")  # Add spacing
    else:
        st.info("📋 El log de debug está vacío. Realiza acciones en la app para ver los mensajes de debug aquí.")
