let editor;
let device;
let server;
let commandChar;
let isConnected = false;
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
            '# --- CODIGO ULTRA-ARMADO ---',
            'print(">>> PROGRAMA NUEVO CARGADO <<<")',
            'hub = PrimeHub()',
            'hub.display.char("A")',
            'hub.light.on(Color.GREEN)',
            'wait(2000)',
            'hub.light.on(Color.BLUE)',
            'print(">>> Script finalizado con exito <<<")'
        ].join('\n'),
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true
    });
});

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
                logToConsole('Hub desconectado.', 'info');
            });

            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(PYBRICKS_SERVICE_UUID);
            commandChar = await service.getCharacteristic(PYBRICKS_COMMAND_UUID);

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
            logToConsole('¡Hub conectado exitosamente!', 'success');

        } catch (e) {
            logToConsole('Error de conexión: ' + e.message, 'error');
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
    if (!isConnected || !commandChar) return;

    // 1. Sanitización de código
    const rawCode = editor.getValue();
    const code = rawCode.replace(/\r\n/g, '\n');
    const codeBytes = new TextEncoder().encode(code);
    const size = codeBytes.length;

    logToConsole(`Iniciando ciclo de subida ultra-seguro (${size} bytes)...`, 'info');

    try {
        // --- CICLO ULTRA-ARMADO: STOP -> CLEAR -> PREPARE -> CHUNKS -> COMMIT -> START ---

        // A. STOP: Forzar detención de cualquier proceso previo
        logToConsole('Deteniendo procesos previos...', 'info');
        await commandChar.writeValueWithResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
        await new Promise(r => setTimeout(r, 600));

        // B. CLEAR: Notificar al Hub que vamos a limpiar el slot (Size 0)
        logToConsole('Limpiando memoria flash del Hub...', 'info');
        const clearMeta = new Uint8Array([CMD_WRITE_USER_PROGRAM_META, 0, 0, 0, 0]);
        await commandChar.writeValueWithResponse(clearMeta);
        await new Promise(r => setTimeout(r, 400));

        // C. PREPARE: Enviar tamaño real para preparar la recepción
        logToConsole('Preparando recepción de datos...', 'info');
        const prepareMeta = new ArrayBuffer(5);
        const prepareView = new DataView(prepareMeta);
        prepareView.setUint8(0, CMD_WRITE_USER_PROGRAM_META);
        prepareView.setUint32(1, size, true);
        await commandChar.writeValueWithResponse(prepareMeta);
        await new Promise(r => setTimeout(r, 200));

        // D. UPLOAD: Enviar chunks (15 bytes c/u, con pausas periódicas)
        const maxChunk = 15;
        let offset = 0;
        let packetCount = 0;

        logToConsole('Subiendo programa en bloques protegidos...', 'info');
        while (offset < size) {
            const chunkPayloadSize = Math.min(maxChunk, size - offset);
            const packet = new ArrayBuffer(5 + chunkPayloadSize);
            const packetView = new DataView(packet);

            packetView.setUint8(0, CMD_WRITE_USER_RAM);
            packetView.setUint32(1, offset, true);

            const chunkData = codeBytes.slice(offset, offset + chunkPayloadSize);
            new Uint8Array(packet, 5).set(chunkData);

            // Usamos writeWithoutResponse para los bloques de RAM para no saturar el canal
            await commandChar.writeValueWithoutResponse(packet);
            offset += chunkPayloadSize;
            packetCount++;

            // Pausa entre paquetes (50ms para máxima estabilidad)
            await new Promise(r => setTimeout(r, 50));
        }

        logToConsole('Sincronizando memoria...', 'info');
        await new Promise(r => setTimeout(r, 600));

        // E. COMMIT: Re-confirmar el tamaño para grabar permanentemente en Flash
        logToConsole('Garantizando persistencia en Flash...', 'info');
        await commandChar.writeValueWithResponse(prepareMeta);
        await new Promise(r => setTimeout(r, 800));

        // F. START: Iniciar el nuevo programa
        logToConsole('Ejecutando script nuevo...', 'success');
        await commandChar.writeValueWithResponse(new Uint8Array([CMD_START_USER_PROGRAM]));

    } catch (e) {
        logToConsole('Fallo crítico en subida: ' + e.message, 'error');
        console.error(e);
    }
}

async function stopScript() {
    if (isConnected) await commandChar.writeValueWithResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
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
