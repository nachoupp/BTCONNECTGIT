let editor, device, server, commandChar, isConnected = false;

// --- CONFIGURACIÓN DEL PROTOCOLO (CORREGIDA) ---
// El Hub usa MTU de ~23 bytes por defecto en negociaciones simples.
// Estructura: [CMD(1) + OFFSET(4) + DATA(N)]
// Max Payload por paquete = 18 bytes (para ir seguros con cabeceras)
const PAYLOAD_SIZE = 18;
const PACKET_DELAY = 50;  // 50ms es seguro y fluido

const SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
const CHAR_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';

// --- COMANDOS OFICIALES PYBRICKS ---
const CMD_STOP_USER = 0;  // Detener programa
const CMD_START_USER = 1; // Iniciar programa
const CMD_WRITE_RAM = 2;  // Escribir en RAM (Offset + Datos)

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.46.0/min/vs' } });
require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
        // MANTENEMOS EL SCRIPT DE TELEMETRIA (Es correcto)
        value: [
            'from pybricks.hubs import PrimeHub',
            'from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor',
            'from pybricks.parameters import Port',
            'from pybricks.tools import wait',
            '',
            '# --- SISTEMA DE TELEMETRIA ---',
            'def log(msg):',
            '    print("[ROBOT]: " + str(msg))',
            '',
            'log("Iniciando Diagnostico V2...")',
            '',
            'try:',
            '    hub = PrimeHub()',
            '    log("Voltaje: " + str(hub.battery.voltage()) + "mV")',
            '    hub.display.char("OK")',
            '',
            '    ports = [Port.A, Port.B, Port.C, Port.D, Port.E, Port.F]',
            '    p_names = "ABCDEF"',
            '',
            '    for i in range(6):',
            '        p = ports[i]',
            '        name = p_names[i]',
            '        try:',
            '            m = Motor(p)',
            '            log("P-" + name + ": MOTOR OK")',
            '            m.run_time(1000, 200) # Girar 1 seg',
            '        except OSError:',
            '            log("P-" + name + ": ---")',
            '        except Exception as e:',
            '            log("P-" + name + " Err: " + str(e))',
            '',
            '    log("Test finalizado.")',
            '',
            'except Exception as e:',
            '    log("FATAL: " + str(e))'
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
    // Botones extra ocultos o simplificados para esta prueba
};

function log(msg, type = '') {
    const box = document.getElementById('consoleOutput');
    const time = new Date().toLocaleTimeString().split(' ')[0];
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
            commandChar.addEventListener('characteristicvaluechanged', handleNotifications);

            isConnected = true; updateUI(); log('Conectado. Listo para subir.', 'success');
        } catch (e) { log(e.message, 'error'); }
    }
}

function handleNotifications(e) {
    const view = e.target.value;
    const type = view.getUint8(0);

    // TIPO 1: Salida de texto (print del robot)
    if (type === 1) {
        const msg = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + 1, view.byteLength - 1));
        log(msg, 'success');
    }
    // TIPO 0: Status Update (Flags)
    // 0x02 = IDLE. No es un error, es información.
    else if (type === 0) {
        // Ignoramos el spam de status para no ensuciar la consola, 
        // a menos que sea útil para debugging interno.
    }
}

function updateUI() {
    const btn = document.getElementById('connectBtn');
    btn.innerText = isConnected ? 'Desconectar' : 'Conectar';
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

    log(`Compilando envío (${size} bytes)...`);

    try {
        // 1. DETENER (Para limpiar estado)
        await commandChar.writeValueWithResponse(new Uint8Array([CMD_STOP_USER]));
        await wait(100);

        // 2. BUCLE DE ENVIO (Usando CMD_WRITE_RAM = 2)
        // Estructura del paquete: [ CMD(1) | OFFSET(4 bytes Little Endian) | DATA(...) ]
        let offset = 0;

        while (offset < size) {
            const chunkSize = Math.min(PAYLOAD_SIZE, size - offset);

            // Crear Buffer: 1 byte CMD + 4 bytes Offset + N bytes Data
            const packet = new ArrayBuffer(5 + chunkSize);
            const view = new DataView(packet);

            view.setUint8(0, CMD_WRITE_RAM);        // Comando 2
            view.setUint32(1, offset, true);        // Offset Little Endian

            // Copiar datos del script al paquete
            new Uint8Array(packet, 5).set(bytes.slice(offset, offset + chunkSize));

            // Enviar sin respuesta para velocidad, pero con delay controlado
            await commandChar.writeValueWithoutResponse(packet);

            offset += chunkSize;
            // Pequeña pausa para que el Hub procese y no se ahogue
            await wait(PACKET_DELAY);
        }

        log('Carga completada al 100%.', 'success');

        // 3. EJECUTAR
        await wait(200);
        await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_START_USER]));
        log('Comando de INICIO enviado.');

    } catch (e) {
        log('Error de Subida: ' + e.message, 'error');
    }
}

async function stopScript() {
    if (isConnected) await commandChar.writeValueWithoutResponse(new Uint8Array([CMD_STOP_USER]));
}