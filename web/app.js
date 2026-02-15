let editor;
let device;
let server;
let commandChar;
let isConnected = false;
// Capacidad segura por defecto para BLE
let hubCapabilities = { maxCharSize: 20 };

// UUIDs Pybricks
const PYBRICKS_SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
const PYBRICKS_COMMAND_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';

// Comandos del Protocolo
const CMD_STOP_USER_PROGRAM = 0;
const CMD_START_USER_PROGRAM = 1;
const CMD_WRITE_USER_PROGRAM_META = 3;
const CMD_WRITE_USER_RAM = 4;

// Eventos
const EVENT_WRITE_STDOUT = 1;

// Inicialización de Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.46.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: [
            'from pybricks.hubs import PrimeHub',
            'from pybricks.tools import wait',
            '',
            '# Inicializar Hub',
            'hub = PrimeHub()',
            'hub.light.on((0, 255, 0))',
            'print("Hola desde BTCONNECT")',
            'wait(2000)',
            'hub.light.off()'
        ].join('\n'),
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true
    });
});

// Configuración de botones
window.addEventListener('load', () => {
    document.getElementById('connectBtn').addEventListener('click', toggleConnect);
    document.getElementById('runBtn').addEventListener('click', runScript);
    document.getElementById('stopBtn').addEventListener('click', stopScript);
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('saveBtn').addEventListener('click', saveCode);
    document.getElementById('fileInput').addEventListener('change', loadFile);
});

function logToConsole(msg, type = 'info') {
    const box = document.getElementById('consoleOutput');
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString().split(' ')[0];
    div.className = 'log-entry';
    div.innerHTML = `<span class="text-gray">[${time}]</span> <span class="${type === 'error' ? 'text-red' : (type === 'success' ? 'text-green' : '')}">${msg}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

async function toggleConnect() {
    if (isConnected) {
        if (device && device.gatt.connected) await device.gatt.disconnect();
    } else {
        try {
            logToConsole('Buscando Pybricks Hub...', 'info');
            device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'Pybricks' }],
                optionalServices: [PYBRICKS_SERVICE_UUID]
            });
            device.addEventListener('gattserverdisconnected', () => {
                isConnected = false;
                updateUI(false);
                logToConsole('Desconectado.', 'info');
            });

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(PYBRICKS_SERVICE_UUID);
            commandChar = await service.getCharacteristic(PYBRICKS_COMMAND_UUID);

            // Suscribirse a notificaciones (STDOUT)
            await commandChar.startNotifications();
            commandChar.addEventListener('characteristicvaluechanged', (e) => {
                const view = e.target.value;
                if (view.getUint8(0) === EVENT_WRITE_STDOUT) {
                    const text = new TextDecoder().decode(new DataView(view.buffer, 1));
                    logToConsole(text, 'success');
                }
            });

            isConnected = true;
            updateUI(true);
            logToConsole('¡Conectado!', 'success');

        } catch (e) {
            logToConsole('Error: ' + e.message, 'error');
        }
    }
}

function updateUI(connected) {
    document.getElementById('connectBtn').innerText = connected ? 'Desconectar' : 'Conectar Hub';
    document.getElementById('runBtn').disabled = !connected;
    document.getElementById('stopBtn').disabled = !connected;
    document.getElementById('connectBtn').className = connected ? 'btn-danger' : 'btn-primary';
}

async function runScript() {
    if (!isConnected) return;

    // 1. SANITIZAR CÓDIGO: Convertir CRLF (Windows) a LF (Unix/Hub)
    // Esto es crucial para que el tamaño en bytes coincida exactamente
    const rawCode = editor.getValue();
    const code = rawCode.replace(/\r\n/g, '\n');

    const codeBytes = new TextEncoder().encode(code);
    const size = codeBytes.length;

    logToConsole(`Iniciando subida (${size} bytes)...`, 'info');

    try {
        // A. Detener programa previo y ESPERAR
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
        await new Promise(r => setTimeout(r, 200)); // Espera aumentada a 200ms

        // B. Enviar METADATA con el TAMAÑO REAL
        const meta = new ArrayBuffer(5);
        const view = new DataView(meta);
        view.setUint8(0, CMD_WRITE_USER_PROGRAM_META);
        view.setUint32(1, size, true); // Little Endian
        await commandChar.writeValueWithoutResponse(meta);

        // Espera técnica para que el Hub procese la metadata
        await new Promise(r => setTimeout(r, 50));

        // C. Enviar CÓDIGO en trozos (Chunks)
        // Usamos 15 bytes por paquete para ser extremadamente conservadores y evitar pérdidas
        const maxChunk = 15;
        let offset = 0;

        while (offset < size) {
            const chunkPayloadSize = Math.min(maxChunk, size - offset);
            const packet = new ArrayBuffer(5 + chunkPayloadSize);
            const packetView = new DataView(packet);

            // Cabecera: [CMD, Offset (Little Endian uint32)]
            packetView.setUint8(0, CMD_WRITE_USER_RAM);
            packetView.setUint32(1, offset, true);

            // Datos
            const chunkData = codeBytes.slice(offset, offset + chunkPayloadSize);
            new Uint8Array(packet, 5).set(chunkData);

            await commandChar.writeValueWithoutResponse(packet);
            offset += chunkPayloadSize;

            // Pausa entre paquetes para evitar saturar el buffer del Hub
            await new Promise(r => setTimeout(r, 30));
        }

        logToConsole('Subida completada. Ejecutando...', 'success');

        // D. Arrancar programa
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_START_USER_PROGRAM]));

    } catch (e) {
        logToConsole('Error subida: ' + e.message, 'error');
    }
}

async function stopScript() {
    if (isConnected) await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
}

function saveCode() {
    const blob = new Blob([editor.getValue()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'main.py';
    a.click();
}

function loadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => editor.setValue(ev.target.result);
    reader.readAsText(file);
}
