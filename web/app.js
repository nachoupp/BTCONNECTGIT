// BTCONNECT Web - Core Application Logic
let editor;
let device;
let server;
let pybricksService;
let commandChar;
let isConnected = false;

// UUIDs for Pybricks
const PYBRICKS_SERVICE_UUID = 'c5f21234-55ac-4700-85c4-c2c6b36a7665';
const PYBRICKS_COMMAND_UUID = 'c5f20002-55ac-4700-85c4-c2c6b36a7665';

// Monaco Editor Initialization
window.onload = () => {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.46.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: [
                'from pybricks.hubs import PrimeHub',
                'from pybricks.tools import wait',
                '',
                'hub = PrimeHub()',
                'hub.light.on((0, 255, 0))',
                'print("Hello from Web Bluetooth!")',
                'wait(2000)',
                'hub.light.off()',
            ].join('\n'),
            language: 'python',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            minimap: { enabled: false },
            roundedSelection: true,
            scrollBeyondLastLine: false,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: "on",
            padding: { top: 16 }
        });
    });

    setupUIListeners();
};

function setupUIListeners() {
    document.getElementById('connectBtn').addEventListener('click', toggleConnect);
    document.getElementById('runBtn').addEventListener('click', runScript);
    document.getElementById('stopBtn').addEventListener('click', stopScript);
    document.getElementById('clearBtn').addEventListener('click', () => {
        document.getElementById('console').innerHTML = '<div class="text-gray-500 italic">Console output cleared.</div>';
    });
}

function logToConsole(message, type = 'info') {
    const consoleEl = document.getElementById('console');
    const colorClass = type === 'error' ? 'text-red-400' : (type === 'success' ? 'text-green-400' : 'text-gray-300');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Auto-remove placeholder if first message
    if (consoleEl.innerHTML.includes('will appear here')) consoleEl.innerHTML = '';
    
    const div = document.createElement('div');
    div.className = `flex gap-3 px-1`;
    div.innerHTML = `
        <span class="text-gray-600 shrink-0 font-normal">[${time}]</span>
        <span class="${colorClass}">${message}</span>
    `;
    consoleEl.appendChild(div);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

async function toggleConnect() {
    if (isConnected) {
        await disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    try {
        logToConsole("Requesting Bluetooth device...", "info");
        device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Pybricks' }],
            optionalServices: [PYBRICKS_SERVICE_UUID]
        });

        logToConsole(`Connecting to ${device.name}...`, "info");
        device.addEventListener('gattserverdisconnected', onDisconnected);
        
        server = await device.gatt.connect();
        pybricksService = await server.getPrimaryService(PYBRICKS_SERVICE_UUID);
        commandChar = await pybricksService.getCharacteristic(PYBRICKS_COMMAND_UUID);
        
        // Start notifications for output
        await commandChar.startNotifications();
        commandChar.addEventListener('characteristicvaluechanged', handleOutput);

        setConnectedState(true);
        logToConsole("Successfully connected to Hub!", "success");
    } catch (error) {
        logToConsole(`Connection error: ${error.message}`, "error");
        console.error(error);
    }
}

async function disconnect() {
    if (device && device.gatt.connected) {
        await device.gatt.disconnect();
    }
}

function onDisconnected() {
    setConnectedState(false);
    logToConsole("Disconnected from Hub.", "info");
}

function setConnectedState(connected) {
    isConnected = connected;
    const connectBtn = document.getElementById('connectBtn');
    const statusText = document.getElementById('connStatusText');
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (connected) {
        connectBtn.classList.add('border-green-500/50', 'bg-green-500/10');
        statusText.innerText = "Connected";
        statusText.classList.add('text-green-400');
        runBtn.disabled = false;
        stopBtn.disabled = false;
    } else {
        connectBtn.classList.remove('border-green-500/50', 'bg-green-500/10');
        statusText.innerText = "Connect Hub";
        statusText.classList.remove('text-green-400');
        runBtn.disabled = true;
        stopBtn.disabled = true;
    }
}

function handleOutput(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const text = decoder.decode(value);
    
    // Pybricks sends a mix of protocol packets and raw text
    // For now, we'll just log anything that looks like text
    if (text.length > 0) {
        // Simple filter for raw UART-like output
        // Protocol packets usually start with non-printable bytes
        const cleanText = text.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
        if (cleanText) logToConsole(cleanText, 'success');
    }
}

async function runScript() {
    if (!isConnected || !commandChar) return;

    const code = editor.getValue();
    logToConsole("Uploading and running script...", "info");

    try {
        // Pybricks protocol for running a script:
        // 1. Send start command (0x01)
        // 2. Send script data in chunks
        // 3. Send stop command (0x03)? 
        // Actually, many hubs just take the raw code if you prefix it correctly.
        
        const encoder = new TextEncoder();
        const codeBytes = encoder.encode(code);
        
        // This is a simplified version of the Pybricks upload protocol
        // In a full implementation, we'd handle flow control and checksums
        const payload = new Uint8Array(codeBytes.length + 1);
        payload[0] = 0x01; // Command: Run Script
        payload.set(codeBytes, 1);

        // Max BLE write size is usually 20-251 bytes. We'll chunk it at 20 for safety.
        const CHUNK_SIZE = 20;
        for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
            const chunk = payload.slice(i, i + CHUNK_SIZE);
            await commandChar.writeValue(chunk);
        }

        logToConsole("Script execution started!", "success");
    } catch (error) {
        logToConsole(`Run error: ${error.message}`, "error");
    }
}

async function stopScript() {
    if (!isConnected || !commandChar) return;

    try {
        logToConsole("Stopping script...", "info");
        // Command 0x02 is usually "Stop/Cancel"
        await commandChar.writeValue(new Uint8Array([0x02]));
        logToConsole("Script stopped.", "info");
    } catch (error) {
        logToConsole(`Stop error: ${error.message}`, "error");
    }
}
