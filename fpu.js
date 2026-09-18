// fpu.js - Coprocesador de Punto Flotante conceptual para el Intel 8080
//
// Modelo inspirado en el Intel 8087 (el coprocesador matemático del 8086):
//   * Pila de 8 registros de 32 bits en formato IEEE 754 (precisión simple).
//   * Palabra de estado con códigos de condición (C0..C3), puntero TOP y
//     banderas de excepción (IE, DE, ZE, OE, UE, PE, SF).
//   * Palabra de control con el modo de redondeo (RC).
//   * Latencia por operación: el coprocesador queda "ocupado" y el CPU sólo se
//     detiene (WAIT) si intenta enviarle otra instrucción antes de tiempo.
//
// Protocolo de integración con el CPU:
//   El 8080 no posee instrucciones de punto flotante. Se utiliza el opcode no
//   documentado 0xED como prefijo de escape (ESC). Cuando el CPU lo obtiene:
//     1. Lee el byte siguiente (opcode del coprocesador).
//     2. Si la instrucción usa memoria, calcula la dirección efectiva
//        (2 bytes inmediatos o el par HL) y realiza la lectura del operando.
//     3. Entrega opcode + operando al coprocesador por el bus de datos.
//     4. El coprocesador activa su línea BUSY mientras opera y, al terminar,
//        deposita el resultado (en su pila, en memoria o en un registro del CPU).

const FPU_ESC = 0xED;

const FPU_TAG = { VALID: 0, ZERO: 1, SPECIAL: 2, EMPTY: 3 };

// Instrucciones con operando en memoria (bits 0-3). El bit 6 (0x40) indica
// que la dirección está en HL en vez de en 2 bytes inmediatos.
const FPU_MEM_OPS = ['FLD', 'FST', 'FSTP', 'FILD', 'FIST', 'FISTP',
    'FADD', 'FSUB', 'FMUL', 'FDIV', 'FCOM', 'FSTSW'];

// Instrucciones que operan sobre la pila (sin operando en memoria).
const FPU_STACK_OPS = {
    0x80: 'FADD', 0x81: 'FSUB', 0x82: 'FMUL', 0x83: 'FDIV',
    0x84: 'FSQRT', 0x85: 'FCHS', 0x86: 'FABS',
    0x87: 'FSIN', 0x88: 'FCOS', 0x89: 'FTAN', 0x8A: 'FRNDINT',
    0x8B: 'FLN', 0x8C: 'FEXP',
    0x90: 'FXCH', 0x91: 'FCOM', 0x92: 'FCOMP', 0x93: 'FTST',
    0x94: 'FSTSW', 0x95: 'FWAIT', 0x96: 'FINIT', 0x97: 'FCLEX',
    0x98: 'FLDCW', 0x99: 'FLDZ', 0x9A: 'FLD1', 0x9B: 'FLDPI',
    0x9C: 'FDUP', 0x9D: 'FPOP'
};

// Latencia conceptual (en instrucciones del CPU) de cada operación.
const FPU_LATENCY = {
    FLD: 2, FST: 2, FSTP: 2, FILD: 3, FIST: 3, FISTP: 3,
    FADD: 4, FSUB: 4, FMUL: 6, FDIV: 10, FSQRT: 12,
    FSIN: 20, FCOS: 20, FTAN: 22, FLN: 18, FEXP: 18, FRNDINT: 3,
    FCOM: 3, FCOMP: 3, FTST: 3, FXCH: 1, FSTSW: 1, FWAIT: 0,
    FINIT: 1, FCLEX: 1, FLDCW: 1, FLDZ: 1, FLD1: 1, FLDPI: 1,
    FDUP: 1, FPOP: 1, FCHS: 1, FABS: 1
};

const FPU_RC_NAMES = ['Al más cercano (par)', 'Hacia −∞ (piso)', 'Hacia +∞ (techo)', 'Truncar (hacia 0)'];

const FPU_REFERENCE = [
    { m: 'FLD', op: 'dir | M', desc: 'Carga (push) un float de 32 bits desde memoria a ST(0).' },
    { m: 'FST', op: 'dir | M', desc: 'Guarda ST(0) en memoria (4 bytes, little-endian) sin sacarlo de la pila.' },
    { m: 'FSTP', op: 'dir | M', desc: 'Guarda ST(0) en memoria y hace pop.' },
    { m: 'FILD', op: 'dir | M | BC/DE/HL', desc: 'Convierte un entero de 16 bits con signo (memoria o par de registros) a float y lo apila.' },
    { m: 'FIST', op: 'dir | M | BC/DE/HL', desc: 'Convierte ST(0) a entero de 16 bits (según RC) y lo guarda en memoria o en el par.' },
    { m: 'FISTP', op: 'dir | M | BC/DE/HL', desc: 'Igual que FIST pero hace pop.' },
    { m: 'FADD', op: '— | dir | M', desc: 'Sin operando: ST(1) = ST(1) + ST(0) y pop. Con memoria: ST(0) = ST(0) + [dir].' },
    { m: 'FSUB', op: '— | dir | M', desc: 'Sin operando: ST(1) = ST(1) − ST(0) y pop. Con memoria: ST(0) = ST(0) − [dir].' },
    { m: 'FMUL', op: '— | dir | M', desc: 'Sin operando: ST(1) = ST(1) × ST(0) y pop. Con memoria: ST(0) = ST(0) × [dir].' },
    { m: 'FDIV', op: '— | dir | M', desc: 'Sin operando: ST(1) = ST(1) ÷ ST(0) y pop. Con memoria: ST(0) = ST(0) ÷ [dir].' },
    { m: 'FCOM', op: '— | dir | M', desc: 'Compara ST(0) con ST(1) o con memoria. Ajusta C3 (igual), C0 (menor), C2 (no ordenado).' },
    { m: 'FCOMP', op: '—', desc: 'Compara ST(0) con ST(1) y hace pop.' },
    { m: 'FTST', op: '—', desc: 'Compara ST(0) con 0.0.' },
    { m: 'FSTSW', op: '— | dir | M', desc: 'Sin operando: A = byte alto de la palabra de estado (C3→bit6, C2→bit2, C0→bit0). Con memoria: guarda los 16 bits.' },
    { m: 'FSQRT', op: '—', desc: 'ST(0) = √ST(0). Negativo → IE y NaN.' },
    { m: 'FCHS', op: '—', desc: 'Cambia el signo de ST(0).' },
    { m: 'FABS', op: '—', desc: 'ST(0) = |ST(0)|.' },
    { m: 'FSIN', op: '—', desc: 'ST(0) = sen(ST(0)), en radianes.' },
    { m: 'FCOS', op: '—', desc: 'ST(0) = cos(ST(0)), en radianes.' },
    { m: 'FTAN', op: '—', desc: 'ST(0) = tan(ST(0)), en radianes.' },
    { m: 'FLN', op: '—', desc: 'ST(0) = ln(ST(0)). Cero → ZE y −∞; negativo → IE y NaN.' },
    { m: 'FEXP', op: '—', desc: 'ST(0) = e^ST(0).' },
    { m: 'FRNDINT', op: '—', desc: 'Redondea ST(0) a entero usando el modo RC.' },
    { m: 'FXCH', op: '—', desc: 'Intercambia ST(0) y ST(1).' },
    { m: 'FDUP', op: '—', desc: 'Duplica ST(0) (push de una copia).' },
    { m: 'FPOP', op: '—', desc: 'Descarta ST(0).' },
    { m: 'FLDZ', op: '—', desc: 'Apila 0.0.' },
    { m: 'FLD1', op: '—', desc: 'Apila 1.0.' },
    { m: 'FLDPI', op: '—', desc: 'Apila π.' },
    { m: 'FLDCW', op: 'imm8', desc: 'Carga la palabra de control. Bits 0-1 = RC: 0 cercano, 1 piso, 2 techo, 3 truncar.' },
    { m: 'FWAIT', op: '—', desc: 'Detiene el CPU hasta que el coprocesador termine la operación pendiente.' },
    { m: 'FINIT', op: '—', desc: 'Reinicia el coprocesador (pila vacía, banderas en 0, RC = 0).' },
    { m: 'FCLEX', op: '—', desc: 'Limpia las banderas de excepción.' }
];

const FPU_F32 = new Float32Array(1);
const FPU_U32 = new Uint32Array(FPU_F32.buffer);

class FPU8080 {
    constructor() {
        this.enabled = true;          // ¿está conectado al bus?
        this.simulateLatency = true;  // ¿simular ciclos de ocupado?
        this.regs = new Float32Array(8);
        this.tags = new Uint8Array(8);
        this.trace = [];
        this.seq = 0;
        this.opsCount = 0;
        this.stallCycles = 0;
        this.lastEvent = null;
        this.events = [];
        this.lastMem = null;
        this.lastWritten = -1;
        this.reset();
    }

    // Reinicio completo (RESET del sistema).
    reset() {
        this.init();
        this.trace = [];
        this.seq = 0;
        this.opsCount = 0;
        this.stallCycles = 0;
        this.lastEvent = null;
        this.events = [];
        this.lastMem = null;
        this.lastWritten = -1;
    }

    // FINIT: estado interno inicial sin borrar el historial.
    init() {
        this.regs.fill(0);
        this.tags.fill(FPU_TAG.EMPTY);
        this.top = 0;
        this.cc = { c0: false, c1: false, c2: false, c3: false };
        this.exc = { ie: false, de: false, ze: false, oe: false, ue: false, pe: false, sf: false };
        this.control = { rc: 0 };
        this.busy = 0;
        this.pending = null;
        this.implicitWait = false;  // el CPU espera un dato que la FPU le enviará
    }

    // Eventos para la visualización (animación del bus).
    emit(ev) {
        ev.seq = ++this.seq;
        this.lastEvent = ev;
        this.events.push(ev);
        if (this.events.length > 30) this.events.shift();
    }

    clearExceptions() {
        for (const k of Object.keys(this.exc)) this.exc[k] = false;
    }

    // ---------- Utilidades IEEE 754 ----------

    static floatToBits(v) {
        FPU_F32[0] = v;
        return FPU_U32[0] >>> 0;
    }

    static bitsToFloat(bits) {
        FPU_U32[0] = bits >>> 0;
        return FPU_F32[0];
    }

    static nextUp(f) {
        if (Number.isNaN(f) || f === Infinity) return f;
        if (f === 0) return FPU8080.bitsToFloat(1);
        FPU_F32[0] = f;
        if (f > 0) FPU_U32[0]++; else FPU_U32[0]--;
        return FPU_F32[0];
    }

    static nextDown(f) {
        if (Number.isNaN(f) || f === -Infinity) return f;
        if (f === 0) return FPU8080.bitsToFloat(0x80000001);
        FPU_F32[0] = f;
        if (f > 0) FPU_U32[0]--; else FPU_U32[0]++;
        return FPU_F32[0];
    }

    // Redondea un número de doble precisión a precisión simple según RC.
    static toSingle(x, rc) {
        if (!Number.isFinite(x)) return x;
        const f = Math.fround(x);
        if (rc === 0 || f === x) return f;
        if (rc === 1) return f > x ? FPU8080.nextDown(f) : f;   // hacia −∞
        if (rc === 2) return f < x ? FPU8080.nextUp(f) : f;     // hacia +∞
        if (x > 0) return f > x ? FPU8080.nextDown(f) : f;      // truncar
        return f < x ? FPU8080.nextUp(f) : f;
    }

    static tagOf(v) {
        if (!Number.isFinite(v)) return FPU_TAG.SPECIAL;
        if (v === 0) return FPU_TAG.ZERO;
        return FPU_TAG.VALID;
    }

    static formatFloat(v) {
        if (Number.isNaN(v)) return 'NaN';
        if (v === Infinity) return '+Inf';
        if (v === -Infinity) return '-Inf';
        if (Object.is(v, -0)) return '-0.0';
        let s = String(Number(v.toPrecision(7)));
        if (!s.includes('.') && !s.includes('e')) s += '.0';
        return s;
    }

    static decodeIEEE(v) {
        const bits = FPU8080.floatToBits(v);
        const sign = bits >>> 31;
        const exp = (bits >>> 23) & 0xFF;
        const man = bits & 0x7FFFFF;
        let kind = 'normal';
        if (exp === 0) kind = man === 0 ? 'zero' : 'subnormal';
        else if (exp === 255) kind = man === 0 ? 'infinity' : 'nan';
        const mantissaValue = kind === 'subnormal' ? man / 8388608 : 1 + man / 8388608;
        const exponentValue = kind === 'subnormal' ? -126 : exp - 127;
        const hex = bits.toString(16).toUpperCase().padStart(8, '0');
        const bytesLE = [bits & 0xFF, (bits >>> 8) & 0xFF, (bits >>> 16) & 0xFF, (bits >>> 24) & 0xFF];
        return { bits, sign, exp, man, kind, mantissaValue, exponentValue, hex, bytesLE, value: v };
    }

    // ---------- Palabras de estado y control ----------

    getStatusWord() {
        let w = 0;
        if (this.exc.ie) w |= 0x01;
        if (this.exc.de) w |= 0x02;
        if (this.exc.ze) w |= 0x04;
        if (this.exc.oe) w |= 0x08;
        if (this.exc.ue) w |= 0x10;
        if (this.exc.pe) w |= 0x20;
        if (this.exc.sf) w |= 0x40;
        if (w & 0x7F) w |= 0x80;            // ES: resumen de error
        if (this.cc.c0) w |= 0x0100;
        if (this.cc.c1) w |= 0x0200;
        if (this.cc.c2) w |= 0x0400;
        w |= (this.top & 7) << 11;
        if (this.cc.c3) w |= 0x4000;
        if (this.busy > 0) w |= 0x8000;     // B: ocupado
        return w;
    }

    getControlWord() {
        return this.control.rc & 3;
    }

    setControlWord(v) {
        this.control.rc = v & 3;
    }

    // ---------- Pila de registros ----------

    phys(i) { return (this.top + i) & 7; }

    push(v) {
        const nt = (this.top - 1) & 7;
        if (this.tags[nt] !== FPU_TAG.EMPTY) {
            this.exc.sf = true; this.exc.ie = true; this.cc.c1 = true;
            this.log('warn', 'Desbordamiento de pila: los 8 registros están ocupados. Se apila NaN.');
            v = NaN;
        }
        this.top = nt;
        this.regs[nt] = v;
        this.tags[nt] = FPU8080.tagOf(v);
        this.lastWritten = nt;
    }

    pop() {
        const t = this.top;
        if (this.tags[t] === FPU_TAG.EMPTY) {
            this.exc.sf = true; this.exc.ie = true; this.cc.c1 = false;
            this.log('warn', 'Subdesbordamiento de pila: se intentó hacer pop con ST(0) vacío.');
            this.top = (t + 1) & 7;
            return NaN;
        }
        const v = this.regs[t];
        this.tags[t] = FPU_TAG.EMPTY;
        this.top = (t + 1) & 7;
        return v;
    }

    getST(i) {
        const idx = this.phys(i);
        if (this.tags[idx] === FPU_TAG.EMPTY) {
            this.exc.sf = true; this.exc.ie = true;
            this.log('warn', `ST(${i}) está vacío: se usa NaN (indefinido) como operando.`);
            return NaN;
        }
        return this.regs[idx];
    }

    setST(i, v) {
        const idx = this.phys(i);
        this.regs[idx] = v;
        this.tags[idx] = FPU8080.tagOf(v);
        this.lastWritten = idx;
    }

    depth() {
        let n = 0;
        for (let i = 0; i < 8; i++) if (this.tags[i] !== FPU_TAG.EMPTY) n++;
        return n;
    }

    // ---------- Aritmética con banderas ----------

    roundResult(r, operands) {
        if (Number.isNaN(r)) {
            if (!operands.some(Number.isNaN)) this.exc.ie = true;
            return NaN;
        }
        const rounded = FPU8080.toSingle(r, this.control.rc);
        if (!Number.isFinite(rounded) && operands.every(Number.isFinite)) this.exc.oe = true;
        if (rounded === 0 && r !== 0) this.exc.ue = true;
        if (rounded !== 0 && Number.isFinite(rounded) && Math.abs(rounded) < 1.1754943508222875e-38) {
            this.exc.de = true; this.exc.ue = true;
        }
        if (rounded !== r && Number.isFinite(r)) this.exc.pe = true;
        return rounded;
    }

    compute(name, a, b) {
        let r;
        switch (name) {
            case 'FADD': r = a + b; break;
            case 'FSUB': r = a - b; break;
            case 'FMUL': r = a * b; break;
            case 'FDIV':
                if (b === 0 && a !== 0 && !Number.isNaN(a) && Number.isFinite(a)) {
                    // División entre cero: excepción ZE y resultado ±∞ (no es un overflow).
                    this.exc.ze = true;
                    return a / b;
                }
                r = a / b;
                break;
            default: r = NaN;
        }
        return this.roundResult(r, [a, b]);
    }

    compare(a, b) {
        if (Number.isNaN(a) || Number.isNaN(b)) {
            this.cc.c3 = true; this.cc.c2 = true; this.cc.c0 = true;
            this.exc.ie = true;
            return 'no ordenado (NaN)';
        }
        this.cc.c3 = (a === b);
        this.cc.c2 = false;
        this.cc.c0 = (a < b);
        this.cc.c1 = false;
        if (a === b) return 'ST(0) = origen → C3 = 1';
        if (a < b) return 'ST(0) < origen → C0 = 1';
        return 'ST(0) > origen → C0 = 0, C3 = 0';
    }

    roundToInt(v) {
        switch (this.control.rc) {
            case 1: return Math.floor(v);
            case 2: return Math.ceil(v);
            case 3: return Math.trunc(v);
            default: {
                const f = Math.floor(v);
                const d = v - f;
                if (d < 0.5) return f;
                if (d > 0.5) return f + 1;
                return (f % 2 === 0) ? f : f + 1;
            }
        }
    }

    toInt16(v) {
        if (!Number.isFinite(v)) {
            this.exc.ie = true;
            return 0x8000;
        }
        const r = this.roundToInt(v);
        if (r < -32768 || r > 32767) {
            this.exc.ie = true;
            return 0x8000;
        }
        if (r !== v) this.exc.pe = true;
        return r & 0xFFFF;
    }

    // ---------- Acceso a memoria (a través del CPU) ----------

    readFloat(cpu, addr) {
        const b = new Uint8Array(4);
        for (let i = 0; i < 4; i++) b[i] = cpu.readMemory(addr + i);
        this.lastMem = { addr: addr & 0xFFFF, len: 4, type: 'read' };
        return new DataView(b.buffer).getFloat32(0, true);
    }

    writeFloat(cpu, addr, v) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setFloat32(0, v, true);
        for (let i = 0; i < 4; i++) cpu.writeMemory(addr + i, b[i]);
        this.lastMem = { addr: addr & 0xFFFF, len: 4, type: 'write' };
    }

    readInt16(cpu, addr) {
        const v = cpu.readMemory(addr) | (cpu.readMemory(addr + 1) << 8);
        this.lastMem = { addr: addr & 0xFFFF, len: 2, type: 'read' };
        return v >= 0x8000 ? v - 0x10000 : v;
    }

    writeInt16(cpu, addr, v) {
        cpu.writeMemory(addr, v & 0xFF);
        cpu.writeMemory(addr + 1, (v >> 8) & 0xFF);
        this.lastMem = { addr: addr & 0xFFFF, len: 2, type: 'write' };
    }

    // ---------- Historial ----------

    log(type, text, cycle) {
        this.trace.push({ seq: ++this.seq, type, text, cycle: cycle !== undefined ? cycle : this.lastCycle || 0 });
        if (this.trace.length > 60) this.trace.shift();
    }

    // ---------- Protocolo con el CPU ----------

    // El CPU llama a tick() una vez por instrucción ejecutada.
    tick() {
        if (this.busy > 0) {
            this.busy--;
            if (this.busy === 0 && this.pending) {
                const p = this.pending;
                this.pending = null;
                this.complete(p);
            }
        }
    }

    // El CPU quiere emitir un ESC pero el coprocesador sigue ocupado.
    stall(cpu, first) {
        this.stallCycles++;
        this.lastCycle = cpu.cycles;
        if (first) {
            const why = this.implicitWait ? 'espera el dato de' : 'el coprocesador está ocupado con';
            this.log('stall', `CPU en espera (WAIT): ${why} ${this.pending ? this.pending.text : '?'} (${this.busy} ${this.busy === 1 ? 'ciclo restante' : 'ciclos restantes'}).`);
        }
        this.emit({ type: 'stall', name: this.pending ? this.pending.name : 'FWAIT' });
    }

    // Llamado por el CPU al ejecutar el opcode ESC (0xED).
    execute(cpu) {
        this.lastCycle = cpu.cycles;
        const op = cpu.fetch();
        let name = null, form = null, addr = null, rp = null, imm = null;

        if (op < 0x10 && FPU_MEM_OPS[op]) {
            name = FPU_MEM_OPS[op]; form = 'addr'; addr = cpu.fetch16();
        } else if (op >= 0x40 && op < 0x50 && FPU_MEM_OPS[op & 0x0F]) {
            name = FPU_MEM_OPS[op & 0x0F]; form = 'hl'; addr = cpu.getRP('hl');
        } else if (op >= 0x10 && op < 0x1B && (op & 3) !== 3) {
            name = ['FILD', 'FIST', 'FISTP'][(op >> 2) & 3];
            rp = ['bc', 'de', 'hl'][op & 3];
            form = 'rp';
        } else if (FPU_STACK_OPS[op]) {
            name = FPU_STACK_OPS[op]; form = 'stack';
            if (name === 'FLDCW') imm = cpu.fetch();
        } else {
            this.log('warn', `Opcode de coprocesador desconocido: ${op.toString(16).toUpperCase().padStart(2, '0')}H (ignorado).`);
            return;
        }

        const text = this.describe(name, form, addr, rp, imm);

        if (!this.enabled) {
            this.log('warn', `${text}: no hay coprocesador conectado, ESC actúa como NOP.`);
            this.emit({ type: 'ignored', name });
            return;
        }

        const instr = this.build(cpu, name, form, addr, rp, imm, text);
        this.issue(cpu, instr);
    }

    describe(name, form, addr, rp, imm) {
        const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, '0') + 'H';
        if (form === 'addr') return `${name} [${hex4(addr)}]`;
        if (form === 'hl') return `${name} M (HL=${hex4(addr)})`;
        if (form === 'rp') return `${name} ${rp.toUpperCase()}`;
        if (name === 'FLDCW') return `${name} ${imm.toString(16).toUpperCase().padStart(2, '0')}H`;
        return name;
    }

    issue(cpu, instr) {
        this.opsCount++;
        const latency = this.simulateLatency ? instr.latency : 0;
        this.emit({ type: 'issue', name: instr.name, form: instr.form, memRead: !!instr.memRead });
        if (latency > 0) {
            this.pending = instr;
            this.busy = latency;
            // Si el destino es un registro del CPU, éste queda en WAIT hasta recibir el dato.
            this.implicitWait = !!instr.toCPU;
            this.log('issue', `ESC → ${instr.text}  (latencia ${latency} ${latency === 1 ? 'ciclo' : 'ciclos'})`);
        } else {
            this.log('issue', `ESC → ${instr.text}`);
            this.complete(instr);
        }
    }

    complete(instr) {
        this.implicitWait = false;
        const result = instr.run();
        this.emit({ type: 'done', name: instr.name, form: instr.form, memWrite: !!instr.memWrite, toCPU: !!instr.toCPU });
        this.log('done', `${instr.text} completada${result ? ': ' + result : ''}`);
    }

    fmt(v) { return FPU8080.formatFloat(v); }

    build(cpu, name, form, addr, rp, imm, text) {
        const instr = { name, form, text, latency: (name in FPU_LATENCY) ? FPU_LATENCY[name] : 1, run: () => '' };
        const hex4 = (v) => v.toString(16).toUpperCase().padStart(4, '0') + 'H';
        const fmt = this.fmt.bind(this);
        const isMem = form === 'addr' || form === 'hl';

        switch (name) {
            case 'FLD': {
                const v = this.readFloat(cpu, addr);
                instr.memRead = true;
                instr.run = () => { this.push(v); return `ST(0) = ${fmt(v)}`; };
                break;
            }
            case 'FST':
            case 'FSTP': {
                instr.memWrite = true;
                instr.run = () => {
                    const v = this.getST(0);
                    this.writeFloat(cpu, addr, v);
                    if (name === 'FSTP') this.pop();
                    return `[${hex4(addr)}] = ${fmt(v)} (${FPU8080.decodeIEEE(v).hex}H)`;
                };
                break;
            }
            case 'FILD': {
                let v;
                if (form === 'rp') {
                    const raw = cpu.getRP(rp);
                    v = raw >= 0x8000 ? raw - 0x10000 : raw;
                } else {
                    v = this.readInt16(cpu, addr);
                    instr.memRead = true;
                }
                instr.run = () => { this.push(v); return `entero ${v} → ST(0) = ${fmt(v)}`; };
                break;
            }
            case 'FIST':
            case 'FISTP': {
                if (form === 'rp') instr.toCPU = true; else instr.memWrite = true;
                instr.run = () => {
                    const v = this.getST(0);
                    const i = this.toInt16(v);
                    if (form === 'rp') cpu.setRP(rp, i); else this.writeInt16(cpu, addr, i);
                    if (name === 'FISTP') this.pop();
                    const signed = i >= 0x8000 ? i - 0x10000 : i;
                    return `${fmt(v)} → entero ${signed} (${hex4(i)})`;
                };
                break;
            }
            case 'FADD':
            case 'FSUB':
            case 'FMUL':
            case 'FDIV': {
                const sym = { FADD: '+', FSUB: '−', FMUL: '×', FDIV: '÷' }[name];
                if (isMem) {
                    const b = this.readFloat(cpu, addr);
                    instr.memRead = true;
                    instr.run = () => {
                        const a = this.getST(0);
                        const r = this.compute(name, a, b);
                        this.setST(0, r);
                        return `${fmt(a)} ${sym} ${fmt(b)} = ${fmt(r)}`;
                    };
                } else {
                    instr.run = () => {
                        const a = this.getST(1), b = this.getST(0);
                        const r = this.compute(name, a, b);
                        this.pop();
                        this.setST(0, r);
                        return `${fmt(a)} ${sym} ${fmt(b)} = ${fmt(r)}`;
                    };
                }
                break;
            }
            case 'FCOM':
            case 'FCOMP':
            case 'FTST': {
                let src = null;
                if (isMem) { src = this.readFloat(cpu, addr); instr.memRead = true; }
                instr.run = () => {
                    const a = this.getST(0);
                    const b = name === 'FTST' ? 0 : (isMem ? src : this.getST(1));
                    const r = this.compare(a, b);
                    if (name === 'FCOMP') this.pop();
                    return `${fmt(a)} vs ${fmt(b)} → ${r}`;
                };
                break;
            }
            case 'FSTSW': {
                if (isMem) {
                    instr.memWrite = true;
                    instr.run = () => {
                        const w = this.getStatusWord() & 0x7FFF;
                        this.writeInt16(cpu, addr, w);
                        return `[${hex4(addr)}] = ${hex4(w)}`;
                    };
                } else {
                    instr.toCPU = true;
                    instr.run = () => {
                        const hi = (this.getStatusWord() >> 8) & 0x7F;
                        cpu.registers.a = hi;
                        return `A = ${hi.toString(16).toUpperCase().padStart(2, '0')}H (C3=${+this.cc.c3} C2=${+this.cc.c2} C0=${+this.cc.c0})`;
                    };
                }
                break;
            }
            case 'FSQRT':
                instr.run = () => {
                    const x = this.getST(0);
                    let r;
                    if (x < 0) { this.exc.ie = true; r = NaN; }
                    else r = this.roundResult(Math.sqrt(x), [x]);
                    this.setST(0, r);
                    return `√${fmt(x)} = ${fmt(r)}`;
                };
                break;
            case 'FCHS':
                instr.run = () => { const x = this.getST(0); this.setST(0, -x); return `ST(0) = ${fmt(-x)}`; };
                break;
            case 'FABS':
                instr.run = () => { const x = this.getST(0); this.setST(0, Math.abs(x)); return `ST(0) = ${fmt(Math.abs(x))}`; };
                break;
            case 'FSIN':
            case 'FCOS':
            case 'FTAN': {
                const fn = { FSIN: Math.sin, FCOS: Math.cos, FTAN: Math.tan }[name];
                const label = { FSIN: 'sen', FCOS: 'cos', FTAN: 'tan' }[name];
                instr.run = () => {
                    const x = this.getST(0);
                    let r;
                    if (!Number.isFinite(x)) { this.exc.ie = true; r = NaN; }
                    else r = this.roundResult(fn(x), [x]);
                    this.setST(0, r);
                    return `${label}(${fmt(x)}) = ${fmt(r)}`;
                };
                break;
            }
            case 'FLN':
                instr.run = () => {
                    const x = this.getST(0);
                    let r;
                    if (x < 0) { this.exc.ie = true; r = NaN; }
                    else if (x === 0) { this.exc.ze = true; r = -Infinity; }
                    else r = this.roundResult(Math.log(x), [x]);
                    this.setST(0, r);
                    return `ln(${fmt(x)}) = ${fmt(r)}`;
                };
                break;
            case 'FEXP':
                instr.run = () => {
                    const x = this.getST(0);
                    const r = this.roundResult(Math.exp(x), [x]);
                    this.setST(0, r);
                    return `e^${fmt(x)} = ${fmt(r)}`;
                };
                break;
            case 'FRNDINT':
                instr.run = () => {
                    const x = this.getST(0);
                    let r = x;
                    if (Number.isFinite(x)) { r = this.roundToInt(x); if (r !== x) this.exc.pe = true; }
                    this.setST(0, r);
                    return `${fmt(x)} → ${fmt(r)} (${FPU_RC_NAMES[this.control.rc]})`;
                };
                break;
            case 'FXCH':
                instr.run = () => {
                    const a = this.phys(0), b = this.phys(1);
                    if (this.tags[a] === FPU_TAG.EMPTY || this.tags[b] === FPU_TAG.EMPTY) { this.exc.sf = true; this.exc.ie = true; }
                    const tv = this.regs[a], tt = this.tags[a];
                    this.regs[a] = this.regs[b]; this.tags[a] = this.tags[b];
                    this.regs[b] = tv; this.tags[b] = tt;
                    this.lastWritten = a;
                    return `ST(0) = ${fmt(this.regs[a])}, ST(1) = ${fmt(this.regs[b])}`;
                };
                break;
            case 'FWAIT':
                instr.run = () => 'el coprocesador está libre';
                break;
            case 'FINIT':
                instr.run = () => { this.init(); return 'pila vacía, banderas en 0, RC = 0'; };
                break;
            case 'FCLEX':
                instr.run = () => { this.clearExceptions(); return 'excepciones limpiadas'; };
                break;
            case 'FLDCW':
                instr.run = () => { this.setControlWord(imm); return `RC = ${this.control.rc} (${FPU_RC_NAMES[this.control.rc]})`; };
                break;
            case 'FLDZ':
                instr.run = () => { this.push(0); return 'ST(0) = 0.0'; };
                break;
            case 'FLD1':
                instr.run = () => { this.push(1); return 'ST(0) = 1.0'; };
                break;
            case 'FLDPI':
                instr.run = () => { const p = Math.fround(Math.PI); this.push(p); return `ST(0) = ${fmt(p)}`; };
                break;
            case 'FDUP':
                instr.run = () => { const v = this.getST(0); this.push(v); return `ST(0) = ST(1) = ${fmt(v)}`; };
                break;
            case 'FPOP':
                instr.run = () => { const v = this.pop(); return `descartado ${fmt(v)}`; };
                break;
        }
        return instr;
    }
}

FPU8080.ESC = FPU_ESC;
FPU8080.TAG = FPU_TAG;
FPU8080.LATENCY = FPU_LATENCY;
FPU8080.RC_NAMES = FPU_RC_NAMES;
FPU8080.REFERENCE = FPU_REFERENCE;
FPU8080.MEM_OPS = FPU_MEM_OPS;
FPU8080.STACK_OPS = FPU_STACK_OPS;

if (typeof module !== 'undefined') {
    module.exports = FPU8080;
}
