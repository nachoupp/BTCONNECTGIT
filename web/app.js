let editor, device, server, commandChar, isConnected = false;

// --- CONFIGURACIÓN BLINDADA ---
const CHUNK_PAYLOAD_SIZE = 10; // 10 bytes (Seguridad máxima)
const PACKET_DELAY = 100;      // 100ms (Estabilidad)
const ERASE_DELAY = 1500;      // 1.5s (Borrado flash)

const SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
const CHAR_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';

const CMD_STOP = 0;
const CMD_START = 1;
const CMD_META = 3; // Contiene metadatos
const CMD_RAM = 4;  // Carga en RAM/Flash

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.46.0/min/vs' } });
require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        // --- SCRIPT DE TELEMETRÍA Y DIAGNÓSTICO ---
        // Este código Python está diseñado para fallar "con gracia" y reportar todo.
        value: [
            'from pybricks.hubs import PrimeHub',
            'from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor',
            'from pybricks.parameters import Port, Stop, Direction, Button, Color',
            'from pybricks.tools import wait, stopwatch',
            'import usys',
            '',
            '# --- SISTEMA DE TELEMETRIA ---',
            'def log(msg):',
            '    print("[ROBOT]: " + str(msg))',
            '',
            'log("Iniciando Diagnostico...")',
            '',
            'try:',
            '    # 1. Inicializar HUB',
            '    hub = PrimeHub()',
            '    voltage = hub.battery.voltage()',
            '    log("Hub OK. Bateria: " + str(voltage) + "mV")',
            '    hub.display.char("D")',
            '',
            '    # 2. Escaneo de Puertos (Blindado)',
            '    ports = [Port.A, Port.B, Port.C, Port.D, Port.E, Port.F]',
            '    port_names = ["A", "B", "C", "D", "E", "F"]',
            '',
            '    for i in range(len(ports)):',
            '        p = ports[i]',
            '        name = port_names[i]',
            '        try:',
            '            # Intentamos detectar motor',
            '            m = Motor(p)',
            '            log("Puerto " + name + ": MOTOR DETECTADO")',
            '            # Pequeña vibracion para confirmar',
            '            m.run_time(500, 200)',
            '        except OSError:',
            '            # Si no es motor, quizas es sensor?',
            '            try:',
            '                s = ColorSensor(p)',
            '                log("Puerto " + name + ": SENSOR COLOR")',
            '            except OSError:',
            '                 log("Puerto " + name + ": VACIO o DESCONOCIDO")',
            '        except Exception as e:',
            '            log("Puerto " + name + " Error: " + str(e))',
            '',
            '    log("Diagnostico completado. Esperando...")',
            '    while True:',
            '        wait(1000)',
            '        log("Ping...")',
            '',
            'except Exception as e:',
            '    # CAPTURA DE ERROR FATAL',
            '    # Esto es lo que nos dira por que falla el codigo real',
            '    import uio',
            '    log("!!! ERROR FATAL !!!")',
            '    log(str(e))',
            '    if hasattr(e, "value"): log("Val: " + hex(e.value))',
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

// Log mejorado para decodificar saltos de línea correctamente
function log(msg, type = '') {
    const box = document.getElementById('consoleOutput');
    const time = new Date().toLocaleTimeString().split(' ')[0];

    // Tratamiento de saltos de línea para que se vea limpio
    const cleanMsg = msg.replace(/\n/g, '<br>');

    const color = type === 'error' ? 'text-red' : (type === 'success' ? 'text-green' : 'text-gray');
    box.innerHTML += `<div class="log-entry" style="font-family: monospace;"><span class="text-gray">[${time}]</span> <span class="${color}">${cleanMsg}</span></div>`;
    box.scrollTop = box.scrollHeight;
}

async function toggleConnect() {
    if (isConnected) {
        if (device && device.gatt.connected) await device.gatt.disconnect();
    } else {
        try {
            log('Buscando Hub Pybricks...');
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
                // PROTOCOLO: El byte 0 es el tipo de mensaje. 0x01 es STDOUT.
                if (view.getUint8(0) === 1) {
                    // Decodificamos del byte 1 en adelante de forma segura
                    const msg = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + 1, view.byteLength - 1));
                    log(msg, 'success');
                }
                // Si recibimos 0x00 es un error de sistema de Pybricks, también lo mostramos
                if (view.getUint8(0) === 0) {
                    const msg = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + 1, view.byteLength - 1));
                    log("SYS_ERR: " + msg, 'error');
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

    const raw = editor.getValue();
    const code = raw.replace(/\r\n/g, '\n');
    const bytes = new TextEncoder().encode(code);
    const size = bytes.length;

    log(`Iniciando PROTOCOLO LENTO (${size} bytes)...`);

    try {
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP]));
        await wait(200);
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP]));
        await wait(500);

        const meta = new ArrayBuffer(5);
        new DataView(meta).setUint8(0, CMD_META);
        new DataView(meta).setUint32(1, size, true);
        await commandChar.writeValueWithoutResponse(meta);

        log('Borrando memoria (Wait 1.5s)...');
        await wait(ERASE_DELAY);

        let offset = 0;
        while (offset < size) {
            const chunkSize = Math.min(CHUNK_PAYLOAD_SIZE, size - offset);
            const packet = new ArrayBuffer(5 + chunkSize);

            new DataView(packet).setUint8(0, CMD_RAM);
            new DataView(packet).setUint32(1, offset, true);
            new Uint8Array(packet, 5).set(bytes.slice(offset, offset + chunkSize));

            await commandChar.writeValueWithoutResponse(packet);

            offset += chunkSize;
            await wait(PACKET_DELAY);
        }

        log('Subida finalizada. Ejecutando...', 'success');

        await wait(500);
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_START]));

    } catch (e) {
        log('Error Fatal en Subida: ' + e.message, 'error');
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