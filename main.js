const cpu = new Intel8080();
const fpu = new FPU8080();
cpu.attachFPU(fpu);
const assembler = new Assembler8080();

let runInterval = null;
let memoryStart = 0;
let ieeeSource = { type: 'st', i: 0 };   // qué valor muestra el panel IEEE 754
let lastEventSeq = 0;

const $ = (id) => document.getElementById(id);
const hex = (v, n) => (v >>> 0).toString(16).toUpperCase().padStart(n, '0');
const fmtF = FPU8080.formatFloat;

// ============================================================
//  CPU
// ============================================================

function updateUI() {
    // Registros
    $('reg-a').textContent = hex(cpu.registers.a, 2);
    $('reg-b').textContent = hex(cpu.registers.b, 2);
    $('reg-c').textContent = hex(cpu.registers.c, 2);
    $('reg-d').textContent = hex(cpu.registers.d, 2);
    $('reg-e').textContent = hex(cpu.registers.e, 2);
    $('reg-h').textContent = hex(cpu.registers.h, 2);
    $('reg-l').textContent = hex(cpu.registers.l, 2);
    $('reg-pc').textContent = hex(cpu.registers.pc, 4);
    $('reg-sp').textContent = hex(cpu.registers.sp, 4);
    $('reg-f').textContent = hex(cpu.getFlagByte(), 2);

    // Banderas
    $('flag-s').textContent = cpu.flags.s ? '1' : '0';
    $('flag-z').textContent = cpu.flags.z ? '1' : '0';
    $('flag-ac').textContent = cpu.flags.ac ? '1' : '0';
    $('flag-p').textContent = cpu.flags.p ? '1' : '0';
    $('flag-cy').textContent = cpu.flags.cy ? '1' : '0';

    // Contadores
    $('cpu-cycles').textContent = cpu.cycles;
    $('fpu-ops').textContent = fpu.opsCount;
    $('fpu-stalls').textContent = fpu.stallCycles;

    // Estado
    const badge = $('status-badge');
    let text, color;
    if (cpu.halted) { text = 'Detenido (HLT)'; color = '#fee2e2'; }
    else if (cpu.stalled) { text = 'En espera (WAIT FPU)'; color = '#fef3c7'; }
    else if (runInterval) { text = 'Ejecutando'; color = '#f0fdf4'; }
    else { text = 'Inactivo'; color = '#e2e8f0'; }
    badge.textContent = text;
    badge.style.backgroundColor = color;

    renderMemory();
    renderStack();
    renderFPU();
}

function renderStack() {
    const table = $('stack-table');
    if (!table) return;
    table.innerHTML = '';
    const currentSP = cpu.registers.sp;

    for (let offset = 6; offset >= -4; offset -= 2) {
        const addr = (currentSP + offset) & 0xFFFF;
        const row = document.createElement('div');
        row.className = 'stack-row';
        if (offset === 0) row.classList.add('active');

        const addrSpan = document.createElement('span');
        addrSpan.className = 'stack-addr';
        addrSpan.textContent = (offset === 0 ? 'SP ➔ ' : '     ') + hex(addr, 4) + ':';

        const low = cpu.readMemory(addr);
        const high = cpu.readMemory((addr + 1) & 0xFFFF);
        const val16 = (high << 8) | low;

        const valSpan = document.createElement('span');
        valSpan.className = 'stack-val';
        valSpan.textContent = hex(val16, 4) + 'H (' + hex(high, 2) + ' ' + hex(low, 2) + ')';

        row.appendChild(addrSpan);
        row.appendChild(valSpan);
        table.appendChild(row);
    }
}

function renderMemory() {
    const table = $('memory-table');
    table.innerHTML = '';

    const empty = document.createElement('div');
    empty.className = 'mem-cell mem-header';
    table.appendChild(empty);

    for (let i = 0; i < 16; i++) {
        const h = document.createElement('div');
        h.className = 'mem-cell mem-header';
        h.textContent = i.toString(16).toUpperCase();
        table.appendChild(h);
    }

    const lm = fpu.lastMem;
    for (let row = 0; row < 8; row++) {
        const addr = (memoryStart + row * 16) & 0xFFFF;
        const h = document.createElement('div');
        h.className = 'mem-cell mem-addr';
        h.textContent = hex(addr, 4);
        table.appendChild(h);

        for (let col = 0; col < 16; col++) {
            const cellAddr = (addr + col) & 0xFFFF;
            const c = document.createElement('div');
            c.className = 'mem-cell';
            if (lm && cellAddr >= lm.addr && cellAddr < lm.addr + lm.len) {
                c.classList.add(lm.type === 'write' ? 'mem-fpu-write' : 'mem-fpu-read');
            }
            if (cellAddr === cpu.registers.pc) c.classList.add('mem-pc');
            c.textContent = hex(cpu.readMemory(cellAddr), 2);
            c.title = hex(cellAddr, 4) + 'H';
            table.appendChild(c);
        }
    }
}

// ============================================================
//  Coprocesador
// ============================================================

// Desensambla la instrucción FPU que empieza en la dirección dada (ESC ya leído).
function disassembleFPU(pc) {
    const op = cpu.readMemory(pc + 1);
    const hex4 = (v) => hex(v, 4) + 'H';
    if (op < 0x10 && FPU8080.MEM_OPS[op]) {
        const addr = cpu.readMemory(pc + 2) | (cpu.readMemory(pc + 3) << 8);
        return `${FPU8080.MEM_OPS[op]} ${hex4(addr)}`;
    }
    if (op >= 0x40 && op < 0x50 && FPU8080.MEM_OPS[op & 0x0F]) return `${FPU8080.MEM_OPS[op & 0x0F]} M`;
    if (op >= 0x10 && op < 0x1B && (op & 3) !== 3) {
        return `${['FILD', 'FIST', 'FISTP'][(op >> 2) & 3]} ${['BC', 'DE', 'HL'][op & 3]}`;
    }
    if (FPU8080.STACK_OPS[op]) {
        const name = FPU8080.STACK_OPS[op];
        return name === 'FLDCW' ? `${name} ${cpu.readMemory(pc + 2)}` : name;
    }
    return `?? (${hex(op, 2)}H)`;
}

function renderFPU() {
    // Estado general
    const status = $('fpu-status');
    status.className = 'fpu-status';
    if (!fpu.enabled) { status.textContent = 'Desconectado'; status.classList.add('off'); }
    else if (cpu.stalled) { status.textContent = `CPU en WAIT · FPU ocupada (${fpu.busy})`; status.classList.add('wait'); }
    else if (fpu.busy > 0) { status.textContent = `Ocupado · ${fpu.busy} ${fpu.busy === 1 ? 'ciclo' : 'ciclos'} restantes`; status.classList.add('busy'); }
    else { status.textContent = 'Listo'; status.classList.add('idle'); }

    $('fpu-top').textContent = fpu.top;
    $('fpu-sw-hex').textContent = hex(fpu.getStatusWord(), 4);
    $('fpu-rc').value = String(fpu.control.rc);

    renderFPUStack();
    renderIEEE();
    renderStatusLEDs();
    renderTrace();
    renderBus();
}

function renderFPUStack() {
    const box = $('fpu-stack');
    box.innerHTML = '';
    const tagNames = ['válido', 'cero', 'especial', 'vacío'];
    for (let i = 0; i < 8; i++) {
        const idx = fpu.phys(i);
        const tag = fpu.tags[idx];
        const row = document.createElement('div');
        row.className = 'st-row';
        if (i === 0) row.classList.add('top');
        if (tag === FPU8080.TAG.EMPTY) row.classList.add('empty');
        if (idx === fpu.lastWritten && tag !== FPU8080.TAG.EMPTY) row.classList.add('written');
        if (ieeeSource.type === 'st' && ieeeSource.i === i) row.classList.add('selected');

        const v = fpu.regs[idx];
        const valueText = tag === FPU8080.TAG.EMPTY ? '—' : fmtF(v);
        const hexText = tag === FPU8080.TAG.EMPTY ? '' : hex(FPU8080.floatToBits(v), 8) + 'H';
        row.innerHTML = `
            <span class="st-name">${i === 0 ? 'ST(0) ➔' : `ST(${i})`}</span>
            <span class="st-phys">R${idx}</span>
            <span class="st-tag tag-${tag}">${tagNames[tag]}</span>
            <span class="st-val">${valueText}</span>
            <span class="st-hex">${hexText}</span>`;
        row.addEventListener('click', () => {
            ieeeSource = { type: 'st', i };
            $('ieee-manual').value = '';
            renderFPU();
        });
        box.appendChild(row);
    }
}

function parseManualFloat(text) {
    const t = text.trim();
    if (!t) return null;
    const low = t.toLowerCase();
    if (low === 'inf' || low === '+inf' || low === 'infinity') return Infinity;
    if (low === '-inf' || low === '-infinity') return -Infinity;
    if (low === 'nan') return NaN;
    if (/^0x[0-9a-f]{1,8}$/i.test(t)) return FPU8080.bitsToFloat(parseInt(t.slice(2), 16));
    if (/^[0-9a-f]{8}h$/i.test(t)) return FPU8080.bitsToFloat(parseInt(t.slice(0, -1), 16));
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Math.fround(parseFloat(t));
    return undefined;
}

function renderIEEE() {
    let value, label;
    if (ieeeSource.type === 'manual') {
        value = ieeeSource.value;
        label = '— valor de prueba';
    } else {
        const idx = fpu.phys(ieeeSource.i);
        const empty = fpu.tags[idx] === FPU8080.TAG.EMPTY;
        value = empty ? 0 : fpu.regs[idx];
        label = `— ST(${ieeeSource.i}) / R${idx}${empty ? ' (vacío)' : ''}`;
    }
    $('ieee-source').textContent = label;

    const d = FPU8080.decodeIEEE(value);
    const bitsBox = $('ieee-bits');
    bitsBox.innerHTML = '';
    for (let b = 31; b >= 0; b--) {
        const cell = document.createElement('div');
        cell.className = 'bit ' + (b === 31 ? 'bit-sign' : b >= 23 ? 'bit-exp' : 'bit-man');
        if (b === 31 || b === 23) cell.classList.add('group-start');
        cell.textContent = (d.bits >>> b) & 1;
        cell.title = `bit ${b}`;
        bitsBox.appendChild(cell);
    }

    const expBin = d.exp.toString(2).padStart(8, '0');
    const manBin = d.man.toString(2).padStart(23, '0');
    const signTxt = `${d.sign} → ${d.sign ? 'negativo (−)' : 'positivo (+)'}`;
    let expTxt, manTxt, formula;
    switch (d.kind) {
        case 'zero':
            expTxt = `${expBin}₂ = 0 → caso especial: cero`;
            manTxt = `${manBin}₂ = 0`;
            formula = `E = 0 y M = 0 → ${d.sign ? '−0.0' : '+0.0'}`;
            break;
        case 'subnormal':
            expTxt = `${expBin}₂ = 0 → subnormal: exponente fijo 2^−126, sin bit implícito`;
            manTxt = `0.${manBin}₂ = ${d.mantissaValue.toPrecision(7)}`;
            formula = `(−1)^${d.sign} × ${d.mantissaValue.toPrecision(7)} × 2^−126 = ${fmtF(value)}`;
            break;
        case 'infinity':
            expTxt = `${expBin}₂ = 255 → caso especial`;
            manTxt = `${manBin}₂ = 0`;
            formula = `E = 255 y M = 0 → ${d.sign ? '−∞' : '+∞'}`;
            break;
        case 'nan':
            expTxt = `${expBin}₂ = 255 → caso especial`;
            manTxt = `${manBin}₂ ≠ 0`;
            formula = 'E = 255 y M ≠ 0 → NaN (Not a Number, resultado indefinido)';
            break;
        default:
            expTxt = `${expBin}₂ = ${d.exp} → ${d.exp} − 127 = ${d.exponentValue}`;
            manTxt = `1.${manBin}₂ = ${d.mantissaValue.toPrecision(8)}`;
            formula = `(−1)^${d.sign} × ${d.mantissaValue.toPrecision(8)} × 2^${d.exponentValue} = ${fmtF(value)}`;
    }
    $('ieee-detail').innerHTML = `
        <div><b>Valor:</b> <code>${fmtF(value)}</code> &nbsp; <b>Hex:</b> <code>${d.hex}H</code></div>
        <div><b><i class="sw-sign"></i>Signo:</b> ${signTxt}</div>
        <div><b><i class="sw-exp"></i>Exponente:</b> ${expTxt}</div>
        <div><b><i class="sw-man"></i>Mantisa:</b> ${manTxt}</div>
        <div><b>Fórmula:</b> ${formula}</div>
        <div><b>Bytes en memoria (little-endian):</b> <code>${d.bytesLE.map(b => hex(b, 2)).join(' ')}</code></div>`;
}

function renderStatusLEDs() {
    const set = (id, on) => $(id).classList.toggle('on', !!on);
    set('led-c0', fpu.cc.c0); set('led-c1', fpu.cc.c1); set('led-c2', fpu.cc.c2); set('led-c3', fpu.cc.c3);
    for (const k of ['ie', 'de', 'ze', 'oe', 'ue', 'pe', 'sf']) set('led-' + k, fpu.exc[k]);
}

function renderTrace() {
    const box = $('fpu-trace');
    box.innerHTML = '';
    if (fpu.trace.length === 0) {
        box.innerHTML = '<div class="tr-empty">Sin actividad. Ejecuta un programa con instrucciones F… para ver el diálogo CPU ↔ FPU.</div>';
        return;
    }
    const items = fpu.trace.slice(-25).reverse();
    for (const t of items) {
        const row = document.createElement('div');
        row.className = 'tr-row tr-' + t.type;
        row.innerHTML = `<span class="tr-cycle">${t.cycle}</span><span class="tr-text"></span>`;
        row.querySelector('.tr-text').textContent = t.text;
        box.appendChild(row);
    }
}

// ---------- Diagrama del bus ----------

function fireAnim(id) {
    const el = $(id);
    if (el && typeof el.beginElement === 'function') {
        try { el.beginElement(); } catch (e) { /* navegador sin SMIL */ }
    }
}

function flash(id, cls = 'active') {
    const el = $(id);
    if (!el) return;
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 700);
}

function renderBus() {
    const pc = cpu.registers.pc;
    $('bus-cpu-pc').textContent = `PC: ${hex(pc, 4)}`;
    const opcode = cpu.readMemory(pc);
    $('bus-cpu-instr').textContent = opcode === 0xED ? `ESC → ${disassembleFPU(pc)}` : `Opcode: ${hex(opcode, 2)}H`;
    $('bus-cpu-state').textContent = cpu.halted ? 'HLT' : (cpu.stalled ? 'WAIT' : 'EJECUTANDO');

    const topIdx = fpu.top;
    $('bus-fpu-st0').textContent = 'ST(0): ' + (fpu.tags[topIdx] === FPU8080.TAG.EMPTY ? 'vacío' : fmtF(fpu.regs[topIdx]));
    $('bus-fpu-op').textContent = fpu.pending ? `${fpu.pending.text} (${fpu.busy})` : '—';
    $('bus-fpu-state').textContent = !fpu.enabled ? 'DESCONECTADO' : (fpu.busy > 0 ? `BUSY (${fpu.busy})` : 'LISTO');

    const svg = $('bus-diagram');
    svg.classList.toggle('fpu-off', !fpu.enabled);
    svg.classList.toggle('stalled', cpu.stalled);
    svg.classList.toggle('busy', fpu.busy > 0);

    // Animación de los eventos nuevos (solo los últimos para no saturar)
    const fresh = fpu.events.filter(e => e.seq > lastEventSeq);
    if (fresh.length === 0) return;
    lastEventSeq = fresh[fresh.length - 1].seq;
    const issue = [...fresh].reverse().find(e => e.type === 'issue' || e.type === 'ignored');
    const after = [...fresh].reverse().find(e => e.type === 'done' || e.type === 'stall');

    if (issue) {
        flash('line-esc', issue.type === 'ignored' ? 'ignored' : 'active');
        fireAnim('anim-esc');
        if (issue.memRead) { flash('line-data'); fireAnim('anim-data-out'); }
    }
    if (after && after.type === 'done') {
        flash('bus-fpu', 'pulse');
        if (after.memWrite || after.toCPU) { flash('line-data'); fireAnim('anim-data-in'); }
    } else if (after && after.type === 'stall') {
        flash('line-wait', 'stalled');
        fireAnim('anim-wait');
    }
}

// ---------- Referencia e inspector ----------

function renderReference() {
    const table = $('fpu-reference');
    let html = '<tr><th>Mnemónico</th><th>Operando</th><th>Latencia</th><th>Descripción</th></tr>';
    for (const r of FPU8080.REFERENCE) {
        const lat = FPU8080.LATENCY[r.m];
        html += `<tr><td><code>${r.m}</code></td><td>${r.op}</td><td>${lat === undefined ? 1 : lat}</td><td>${r.desc}</td></tr>`;
    }
    table.innerHTML = html;
}

function inspectFloat() {
    const addr = parseInt($('float-addr').value, 16);
    const out = $('float-inspect-out');
    if (isNaN(addr)) { out.textContent = 'Dirección inválida'; return; }
    const bytes = [0, 1, 2, 3].map(i => cpu.readMemory(addr + i));
    const bits = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    const v = FPU8080.bitsToFloat(bits);
    out.innerHTML = `<code>${bytes.map(b => hex(b, 2)).join(' ')}</code> → <b>${fmtF(v)}</b> (${hex(bits, 8)}H)`;
    ieeeSource = { type: 'manual', value: v };
    $('ieee-manual').value = fmtF(v);
    renderFPU();
}

// ============================================================
//  Eventos de la interfaz
// ============================================================

$('btn-assemble').addEventListener('click', () => {
    const source = $('code-editor').value;
    const output = $('assembler-output');
    try {
        const result = assembler.assemble(source);
        cpu.memory.set(result.binary);
        output.textContent = `Ensamblado correcto. ${result.maxAddr} bytes escritos en memoria.`;
        output.className = 'success';
        updateUI();
    } catch (e) {
        output.textContent = 'Error: ' + e.message;
        output.className = 'error';
    }
});

$('btn-clear-code').addEventListener('click', () => {
    $('code-editor').value = '';
    $('example-select').value = '';
    const output = $('assembler-output');
    output.textContent = '';
    output.className = '';
});

$('btn-step').addEventListener('click', () => {
    cpu.step();
    updateUI();
});

function stopRun() {
    if (runInterval) {
        clearInterval(runInterval);
        runInterval = null;
    }
}

$('btn-run').addEventListener('click', () => {
    if (runInterval) return;
    runInterval = setInterval(() => {
        if (cpu.halted && fpu.busy === 0) {
            stopRun();
            updateUI();
            return;
        }
        for (let i = 0; i < 100; i++) {
            cpu.step();
            if (cpu.halted && fpu.busy === 0) break;
        }
        updateUI();
    }, 10);
    updateUI();
});

$('btn-stop').addEventListener('click', () => {
    if (runInterval) {
        stopRun();
        updateUI();
    }
});

$('btn-reset').addEventListener('click', () => {
    stopRun();
    cpu.reset();
    lastEventSeq = 0;
    ieeeSource = { type: 'st', i: 0 };
    $('ieee-manual').value = '';
    $('float-inspect-out').textContent = '—';

    const output = $('assembler-output');
    output.textContent = '';
    output.className = '';

    $('mem-start-addr').value = '0000';
    memoryStart = 0;
    updateUI();
});

$('btn-mem-go').addEventListener('click', () => {
    memoryStart = parseInt($('mem-start-addr').value, 16) || 0;
    renderMemory();
});

$('mem-start-addr').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-mem-go').click(); });

$('btn-float-inspect').addEventListener('click', inspectFloat);
$('float-addr').addEventListener('keydown', (e) => { if (e.key === 'Enter') inspectFloat(); });

// Coprocesador
$('fpu-enabled').addEventListener('change', (e) => {
    fpu.enabled = e.target.checked;
    fpu.log('warn', fpu.enabled ? 'Coprocesador conectado al bus.' : 'Coprocesador desconectado: las instrucciones ESC actuarán como NOP.');
    updateUI();
});

$('fpu-latency').addEventListener('change', (e) => {
    fpu.simulateLatency = e.target.checked;
    fpu.log('warn', fpu.simulateLatency ? 'Simulación de latencia activada.' : 'Simulación de latencia desactivada: cada operación termina en el mismo ciclo.');
    updateUI();
});

$('fpu-rc').addEventListener('change', (e) => {
    fpu.setControlWord(parseInt(e.target.value, 10));
    fpu.log('done', `Palabra de control modificada desde el panel: RC = ${fpu.control.rc} (${FPU8080.RC_NAMES[fpu.control.rc]})`);
    updateUI();
});

$('btn-fpu-clex').addEventListener('click', () => {
    fpu.clearExceptions();
    fpu.log('done', 'FCLEX desde el panel: excepciones limpiadas.');
    updateUI();
});

$('btn-fpu-init').addEventListener('click', () => {
    fpu.init();
    fpu.log('done', 'FINIT desde el panel: pila vacía, banderas en 0, RC = 0.');
    updateUI();
});

$('ieee-manual').addEventListener('input', (e) => {
    const v = parseManualFloat(e.target.value);
    if (v === null) { ieeeSource = { type: 'st', i: 0 }; }
    else if (v !== undefined) { ieeeSource = { type: 'manual', value: v }; }
    renderFPU();
});

$('btn-ieee-st0').addEventListener('click', () => {
    ieeeSource = { type: 'st', i: 0 };
    $('ieee-manual').value = '';
    renderFPU();
});

// Ejemplos
(function initExamples() {
    const sel = $('example-select');
    if (typeof EXAMPLES === 'undefined') return;
    for (const ex of EXAMPLES) {
        const opt = document.createElement('option');
        opt.value = ex.id;
        opt.textContent = ex.title;
        sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
        const ex = EXAMPLES.find(x => x.id === sel.value);
        if (!ex) return;
        $('code-editor').value = ex.code;
        $('btn-assemble').click();
    });
})();

$('fpu-enabled').checked = fpu.enabled;
$('fpu-latency').checked = fpu.simulateLatency;
renderReference();
updateUI();
