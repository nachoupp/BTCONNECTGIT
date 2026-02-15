let editor;
let device;
let server;
let commandChar;
let isConnected = false;
// Reducimos el tamaño del paquete por seguridad
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
            'from pybricks.parameters import Color',
            '',
            '# Codigo Nuevo',
            'print("PROGRAMA NUEVO INICIADO")',
            'hub = PrimeHub()',
            'hub.display.char("A")',
            'hub.light.on(Color.GREEN)',
            'wait(2000)',
            'print("Fin del programa")'
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

    const rawCode = editor.getValue();
    // Normalizar saltos de línea para contar bytes exactos
    const code = rawCode.replace(/\r\n/g, '\n');
    const codeBytes = new TextEncoder().encode(code);
    const size = codeBytes.length;

    logToConsole(`Iniciando subida (${size} bytes)...`, 'info');

    try {
        // 1. DETENER (Tiempo extendido)
        // Damos tiempo al hub para frenar motores y cerrar procesos
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
        await new Promise(r => setTimeout(r, 500));

        // 2. ENVIAR METADATA (Informar tamaño)
        const meta = new ArrayBuffer(5);
        const view = new DataView(meta);
        view.setUint8(0, CMD_WRITE_USER_PROGRAM_META);
        view.setUint32(1, size, true); // Little Endian
        await commandChar.writeValueWithoutResponse(meta);

        // PAUSA CRÍTICA: El Hub necesita tiempo para preparar la RAM/Flash
        await new Promise(r => setTimeout(r, 200));

        // 3. ENVIAR CODIGO (Chunks lentos)
        // Usamos chunks muy pequeños para asegurar estabilidad
        const maxChunk = 15;
        let offset = 0;

        while (offset < size) {
            const chunkPayloadSize = Math.min(maxChunk, size - offset);
            const packet = new ArrayBuffer(5 + chunkPayloadSize);
            const packetView = new DataView(packet);

            packetView.setUint8(0, CMD_WRITE_USER_RAM);
            packetView.setUint32(1, offset, true);

            const chunkData = codeBytes.slice(offset, offset + chunkPayloadSize);
            new Uint8Array(packet, 5).set(chunkData);

            await commandChar.writeValueWithoutResponse(packet);
            offset += chunkPayloadSize;

            // Pausa entre paquetes (50ms es lento pero seguro)
            await new Promise(r => setTimeout(r, 50));
        }

        logToConsole('Subida completada. Esperando guardado...', 'info');

        // 4. ESPERA FINAL ANTES DE ARRANCAR
        // Dar tiempo a que el último paquete se escriba en memoria
        await new Promise(r => setTimeout(r, 1000));

        // 5. ARRANCAR
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_START_USER_PROGRAM]));
        logToConsole('Comando de arranque enviado.', 'success');

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
