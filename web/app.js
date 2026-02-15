let editor, device, server, commandChar, isConnected = false;
let hubCapabilities = { maxCharSize: 20 };

const SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
const CHAR_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';

// Comandos Pybricks
const CMD_STOP = 0;
const CMD_START = 1;
const CMD_META = 3;
const CMD_RAM = 4;

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.46.0/min/vs' } });
require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: [
            'from pybricks.hubs import PrimeHub',
            'from pybricks.tools import wait',
            '',
            'hub = PrimeHub()',
            'print("Hello BTCONNECT!")',
            'hub.display.text("OK")',
            'wait(2000)'
        ].join('\n'),
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true
    });
});

window.onload = () => {
    document.getElementById('connectBtn').onclick = toggleConnect;
    document.getElementById('runBtn').onclick = runScript;
    document.getElementById('stopBtn').onclick = stopScript;
    document.getElementById('uploadBtn').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('saveBtn').onclick = saveCode;
    document.getElementById('fileInput').onchange = loadFile;
};

function log(msg, type = '') {
    const box = document.getElementById('consoleOutput');
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const color = type === 'error' ? 'text-red' : (type === 'success' ? 'text-green' : 'text-gray');
    box.innerHTML += `<div class="log-entry"><span class="text-gray">[${time}]</span> <span class="${color}">${msg}</span></div>`;
    box.scrollTop = box.scrollHeight;
}

async function toggleConnect() {
    if (isConnected) {
        if (device && device.gatt.connected) await device.gatt.disconnect();
    } else {
        try {
            log('Buscando Hub...');
            device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'Pybricks' }],
                optionalServices: [SERVICE_UUID]
            });
            device.addEventListener('gattserverdisconnected', () => {
                isConnected = false; updateUI(); log('Desconectado.');
            });
            server = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            commandChar = await service.getCharacteristic(CHAR_UUID);

            await commandChar.startNotifications();
            commandChar.addEventListener('characteristicvaluechanged', (e) => {
                const view = e.target.value;
                if (view.getUint8(0) === 1) { // STDOUT
                    log(new TextDecoder().decode(new DataView(view.buffer, 1)), 'success');
                }
            });
            isConnected = true; updateUI(); log('¡Conectado!', 'success');
        } catch (e) { log(e.message, 'error'); }
    }
}

function updateUI() {
    const btn = document.getElementById('connectBtn');
    btn.innerText = isConnected ? 'Desconectar' : 'Conectar Hub';
    btn.className = isConnected ? 'btn btn-danger' : 'btn btn-primary';
    document.getElementById('runBtn').disabled = !isConnected;
    document.getElementById('stopBtn').disabled = !isConnected;
}

async function runScript() {
    if (!isConnected) return;

    // 1. PREPARAR CÓDIGO (Sanitizar saltos de línea es CLAVE)
    const raw = editor.getValue();
    const code = raw.replace(/\r\n/g, '\n'); // Convertir Windows CRLF a Unix LF
    const bytes = new TextEncoder().encode(code);
    const size = bytes.length;

    log(`Subiendo ${size} bytes...`);

    try {
        // A. STOP (Rápido)
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP]));
        await new Promise(r => setTimeout(r, 100)); // Espera breve estándar

        // B. METADATA (Tamaño real)
        const meta = new ArrayBuffer(5);
        new DataView(meta).setUint8(0, CMD_META);
        new DataView(meta).setUint32(1, size, true); // Little Endian
        await commandChar.writeValueWithoutResponse(meta);

        // C. CHUNKS (Optimizado para no saturar pero no dormir)
        const maxChunk = 18; // Seguro para BLE estándar
        let offset = 0;

        while (offset < size) {
            const chunkSize = Math.min(maxChunk, size - offset);
            const packet = new ArrayBuffer(5 + chunkSize);

            new DataView(packet).setUint8(0, CMD_RAM);
            new DataView(packet).setUint32(1, offset, true);
            new Uint8Array(packet, 5).set(bytes.slice(offset, offset + chunkSize));

            await commandChar.writeValueWithoutResponse(packet);
            offset += chunkSize;

            // Pausa mínima necesaria para que el stack Bluetooth respire
            // 20ms es suficiente para evitar GATT ERROR
            await new Promise(r => setTimeout(r, 20));
        }

        log('Ejecutando...', 'success');
        // D. START
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_START]));

    } catch (e) {
        log('Error: ' + e.message, 'error');
    }
}

async function stopScript() {
    if (isConnected) await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP]));
}

function saveCode() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([editor.getValue()], { type: 'text/plain' }));
    a.download = 'main.py';
    a.click();
}

function loadFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => editor.setValue(ev.target.result);
    r.readAsText(f);
}
