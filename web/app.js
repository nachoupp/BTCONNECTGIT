// BTCONNECT Web - Protocolo Pybricks Completo
let editor;
let device;
let server;
let pybricksService;
let commandChar;
let capabilitiesChar;
let isConnected = false;
let hubCapabilities = null;

// UUIDs oficiales de Pybricks
const PYBRICKS_SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
const PYBRICKS_COMMAND_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';
const PYBRICKS_HUB_CAPABILITIES_UUID = 'c5f50003-8280-46da-89f4-6d8051e4aeef';

// Comandos del protocolo Pybricks
const CMD_STOP_USER_PROGRAM = 0;
const CMD_START_USER_PROGRAM = 1;
const CMD_START_REPL = 2;
const CMD_WRITE_USER_PROGRAM_META = 3;
const CMD_WRITE_USER_RAM = 4;
const CMD_WRITE_STDIN = 6;

// Eventos del protocolo
const EVENT_STATUS_REPORT = 0;
const EVENT_WRITE_STDOUT = 1;

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
                'print("¡Hola desde BTCONNECT Web!")',
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
        window.editor = editor; // Hacerlo accesible globalmente
    });
};

// Asegurar que setupUIListeners se ejecute solo cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUIListeners);
} else {
    setupUIListeners();
}

function setupUIListeners() {
    const connectBtn = document.getElementById('connectBtn');
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    const clearBtn = document.getElementById('clearBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const saveBtn = document.getElementById('saveBtn');
    const fileInput = document.getElementById('fileInput');

    if (connectBtn) connectBtn.addEventListener('click', toggleConnect);
    if (runBtn) runBtn.addEventListener('click', runScript);
    if (stopBtn) stopBtn.addEventListener('click', stopScript);
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('consoleOutput').innerHTML = '';
        });
    }
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }
    if (saveBtn) saveBtn.addEventListener('click', saveCode);
    if (fileInput) fileInput.addEventListener('change', loadFile);
}

function logToConsole(message, type = 'info') {
    const consoleEl = document.getElementById('consoleOutput');

    const colorClass = type === 'error' ? 'text-red-400' : (type === 'success' ? 'text-green-400' : (type === 'warn' ? 'text-yellow-400' : 'text-gray-300'));
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    if (consoleEl.innerHTML.includes('will appear here') || consoleEl.innerHTML.includes('limpiada')) {
        consoleEl.innerHTML = '';
    }
    
    const div = document.createElement('div');
    div.className = `flex gap-3 px-1`;
    const prefix = type === 'error' ? '❌' : (type === 'success' ? '✅' : (type === 'warn' ? '⚠️' : 'ℹ️'));
    div.innerHTML = `<span class="text-gray-500">[${time}]</span> <span>${prefix}</span> <span class="${colorClass}">${message}</span>`;
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
        logToConsole('Solicitando dispositivo Bluetooth...', 'info');
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Pybricks' }],
            optionalServices: [PYBRICKS_SERVICE_UUID]
        });
        
        logToConsole(`Conectando a ${device.name}...`, 'info');
        device.addEventListener('gattserverdisconnected', onDisconnected);
        
        server = await device.gatt.connect();
        pybricksService = await server.getPrimaryService(PYBRICKS_SERVICE_UUID);
        
        // Leer capabilities del hub
        logToConsole('Leyendo capacidades del hub...', 'info');
        capabilitiesChar = await pybricksService.getCharacteristic(PYBRICKS_HUB_CAPABILITIES_UUID);
        const capData = await capabilitiesChar.readValue();
        hubCapabilities = parseHubCapabilities(capData);
        logToConsole(`Tamaño máximo de escritura: ${hubCapabilities.maxCharSize} bytes`, 'success');
        logToConsole(`Tamaño máximo de programa: ${hubCapabilities.maxUserProgSize} bytes`, 'success');
        
        // Obtener characteristic de comandos
        commandChar = await pybricksService.getCharacteristic(PYBRICKS_COMMAND_UUID);
        
        // Suscribirse a notificaciones para output
        await commandChar.startNotifications();
        commandChar.addEventListener('characteristicvaluechanged', handleOutput);
        
        setConnectedState(true);
        logToConsole('¡Conectado exitosamente al hub!', 'success');
    } catch (error) {
        if (error.name === 'NotFoundError') {
            logToConsole('Conexión cancelada por el usuario.', 'warn');
        } else {
            logToConsole(`Error de conexión: ${error.message}`, 'error');
        }
        setConnectedState(false);
        console.error(error);
    }
}

function parseHubCapabilities(dataView) {
    const maxCharSize = dataView.getUint16(0, true);
    const flags = dataView.getUint32(2, true);
    const maxUserProgSize = dataView.getUint32(6, true);
    return { maxCharSize, flags, maxUserProgSize };
}

async function disconnect() {
    if (device && device.gatt.connected) {
        await device.gatt.disconnect();
    }
}

function onDisconnected() {
    setConnectedState(false);
    logToConsole('Desconectado del hub.', 'info');
}

function setConnectedState(connected) {
    isConnected = connected;
    const connectBtn = document.getElementById('connectBtn');
    const statusText = document.getElementById('connStatusText');
    const runBtn = document.getElementById('runBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (connected) {
        connectBtn.classList.add('border-green-500/50', 'bg-green-500/10');
        if (statusText) {
            statusText.innerText = 'Conectado';
            statusText.classList.add('text-green-400');
        }
        if (runBtn) runBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
    } else {
        connectBtn.classList.remove('border-green-500/50', 'bg-green-500/10');
        if (statusText) {
            statusText.innerText = 'Conectar Hub';
            statusText.classList.remove('text-green-400');
        }
        if (runBtn) runBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
    }
}

function handleOutput(event) {
    const value = event.target.value;
    const eventType = value.getUint8(0);
    
    if (eventType === EVENT_WRITE_STDOUT) {
        // Event 1: STDOUT del programa
        const decoder = new TextDecoder();
        const text = decoder.decode(new Uint8Array(value.buffer, 1));
        if (text.trim()) {
            logToConsole(text.trim(), 'success');
        }
    } else if (eventType === EVENT_STATUS_REPORT) {
        // Event 0: Status report - ignorar por ahora
        console.log('Status report recibido');
    }
}

async function runScript() {
    if (!isConnected || !commandChar || !hubCapabilities) return;
    
    // Extraer texto correctamente desde Monaco Editor usando window.editor.getValue()
    const code = window.editor ? window.editor.getValue() : "";
    const encoder = new TextEncoder();
    // Convertir el script a un array de bytes (UTF-8) para calcular el tamaño real
    const codeBytes = encoder.encode(code);
    const scriptSize = codeBytes.length;
    
    logToConsole(`Preparando subida: ${scriptSize} bytes`, 'info');
    
    try {
        // Secuencia de Control: Paso 1: STOP_USER_PROGRAM -> Esperar confirmación
        logToConsole('Deteniendo programa actual...', 'info');
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
        await sleep(100);
        
        // Secuencia de Control: Paso 2: START_USER_PROGRAM_METADATA (con tamaño real)
        // Modificar el Uint8Array de metadatos para incluir el tamaño real (Little-endian)
        const metaData = new Uint8Array(5);
        metaData[0] = CMD_WRITE_USER_PROGRAM_META;
        const view = new DataView(metaData.buffer);
        view.setUint32(1, scriptSize, true); // Tamaño real del script en Little-endian
        
        await commandChar.writeValueWithoutResponse(metaData);
        logToConsole(`Metadata enviada: ${scriptSize} bytes`, 'info');
        await sleep(50);
        
        // Secuencia de Control: Paso 3: Envío de fragmentos (chunks) respetando el maxCharSize (MTU)
        const maxPayloadSize = hubCapabilities.maxCharSize - 5; // 1 byte comando + 4 bytes offset
        let offset = 0;
        let chunkCount = 0;
        
        logToConsole('Subiendo chunks al hub...', 'info');
        while (offset < scriptSize) {
            const chunkSize = Math.min(maxPayloadSize, scriptSize - offset);
            const chunk = new Uint8Array(5 + chunkSize);
            chunk[0] = CMD_WRITE_USER_RAM;
            new DataView(chunk.buffer).setUint32(1, offset, true);
            chunk.set(codeBytes.slice(offset, offset + chunkSize), 5);
            
            await commandChar.writeValueWithoutResponse(chunk);
            offset += chunkSize;
            chunkCount++;
            
            // Pausa estratégica para no saturar el canal BLE
            if (chunkCount % 10 === 0) {
                await sleep(10);
            }
        }
        
        logToConsole(`Código subido: ${chunkCount} chunks enviados.`, 'success');
        
        // Paso Final: Iniciar ejecución del programa
        await sleep(100);
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_START_USER_PROGRAM]));
        logToConsole('¡Programa iniciado con éxito!', 'success');
        
    } catch (error) {
        logToConsole(`Error en la subida: ${error.message}`, 'error');
        console.error(error);
    }
}

async function stopScript() {
    if (!isConnected || !commandChar) return;
    
    try {
        logToConsole('Deteniendo programa...', 'info');
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP_USER_PROGRAM]));
        logToConsole('Programa detenido.', 'success');
    } catch (error) {
        logToConsole(`Error al detener: ${error.message}`, 'error');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// File Management Functions
function saveCode() {
    if (!window.editor) return;
    const code = window.editor.getValue();
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'main.py';
    a.click();
    URL.revokeObjectURL(url);
    logToConsole('Archivo guardado como main.py', 'success');
}

function loadFile(event) {
    const file = event.target.files[0];
    if (file && window.editor) {
        const reader = new FileReader();
        reader.onload = (e) => {
            window.editor.setValue(e.target.result);
            logToConsole(`Archivo cargado: ${file.name}`, 'success');
        };
        reader.readAsText(file);
    }
}
