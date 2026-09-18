// test.js - Unit tests for Intel 8080 CPU and Assembler
const Intel8080 = require('./cpu.js');
const Assembler8080 = require('./assembler.js');
const FPU8080 = require('./fpu.js');
const EXAMPLES = require('./examples.js');
const assert = require('assert');

console.log('--- Running Intel 8080 Emulator & Assembler Tests ---');

// Helper to run a test block and report status
function runTest(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
    } catch (e) {
        console.error(`[FAIL] ${name}`);
        console.error(e);
        process.exit(1);
    }
}

runTest('CPU Reset & Initial Values', () => {
    const cpu = new Intel8080();
    assert.strictEqual(cpu.registers.a, 0);
    assert.strictEqual(cpu.registers.b, 0);
    assert.strictEqual(cpu.registers.sp, 0xFFFF);
    assert.strictEqual(cpu.registers.pc, 0);
    assert.strictEqual(cpu.flags.z, false);
    assert.strictEqual(cpu.flags.cy, false);
    assert.strictEqual(cpu.halted, false);
});

runTest('INR / DCR AC Flag Behavior', () => {
    const cpu = new Intel8080();

    // INR 0x0F -> should set AC
    cpu.registers.a = 0x0F;
    cpu.execute(0x3C); // INR A
    assert.strictEqual(cpu.registers.a, 0x10);
    assert.strictEqual(cpu.flags.ac, true, 'INR 0x0F should set AC flag');

    // DCR 0x10 -> should clear AC (as there is a borrow out of low order nibble, complement of borrow is 0)
    cpu.registers.a = 0x10;
    cpu.execute(0x3D); // DCR A
    assert.strictEqual(cpu.registers.a, 0x0F);
    assert.strictEqual(cpu.flags.ac, false, 'DCR 0x10 should clear AC flag');

    // DCR 0x0F -> should set AC (as there is no borrow out of low order nibble, complement of borrow is 1)
    cpu.registers.a = 0x0F;
    cpu.execute(0x3D); // DCR A
    assert.strictEqual(cpu.registers.a, 0x0E);
    assert.strictEqual(cpu.flags.ac, true, 'DCR 0x0F should set AC flag');
});

runTest('Subtraction AC and Carry Flag Logic', () => {
    const cpu = new Intel8080();

    // Test: 0x3E - 0x05 (no borrow)
    cpu.registers.a = 0x3E;
    cpu.executeALU(2, 0x05); // SUB 0x05 (ALU op 2 is SUB)
    assert.strictEqual(cpu.registers.a, 0x39);
    assert.strictEqual(cpu.flags.cy, false);
    // (0x0E & 0x0F) - (0x05 & 0x0F) = 0x0E - 0x05 = 0x09 >= 0, so AC flag calculation should match physical 8080
    // In physical 8080, SUB does: A + ~B + 1.
    // Let's check AC logic: 0x3E + ~0x05 + 1 = 0x3E + 0xFA + 1. Low nibbles: 0x0E + 0x0A + 1 = 0x19 (carry out is 1)
    // Physical 8080 does not invert AC after subtraction, so AC = 1.
    assert.strictEqual(cpu.flags.ac, true, 'SUB 0x3E - 0x05 should result in AC = 1 (since 0x0E + 0x0A + 1 = 0x19)');

    // Test: 0x00 - 0x01
    cpu.reset();
    cpu.registers.a = 0x00;
    cpu.executeALU(2, 0x01); // SUB 0x01
    assert.strictEqual(cpu.registers.a, 0xFF);
    assert.strictEqual(cpu.flags.cy, true, '0x00 - 0x01 should set carry (borrow)');
    // Low nibbles: 0x00 + ~0x01 + 1 = 0x00 + 0x0E + 1 = 0x0F (carry out is 0). Thus AC = 0.
    assert.strictEqual(cpu.flags.ac, false, '0x00 - 0x01 should result in AC = 0');
});

runTest('Rotate Masking (RLC / RAL accumulator 8-bit safety)', () => {
    const cpu = new Intel8080();

    // RLC with MSB set: 0x80 -> should rotate to 0x01, CY = true
    cpu.registers.a = 0x80;
    cpu.execute(0x07); // RLC
    assert.strictEqual(cpu.registers.a, 0x01);
    assert.strictEqual(cpu.flags.cy, true);

    // RAL with MSB set and CY = false: 0x80 -> should rotate to 0x00, CY = true
    cpu.reset();
    cpu.registers.a = 0x80;
    cpu.flags.cy = false;
    cpu.execute(0x17); // RAL
    assert.strictEqual(cpu.registers.a, 0x00);
    assert.strictEqual(cpu.flags.cy, true);
});

runTest('Assembler Supports Pair Names (BC, DE, HL)', () => {
    const assembler = new Assembler8080();
    const source = `
        LXI BC, 1234H
        LXI DE, 5678H
        LXI HL, 9ABCH
    `;
    const result = assembler.assemble(source);
    const bin = result.binary;

    // LXI BC, 1234H -> 01 34 12
    assert.strictEqual(bin[0], 0x01);
    assert.strictEqual(bin[1], 0x34);
    assert.strictEqual(bin[2], 0x12);

    // LXI DE, 5678H -> 11 78 56
    assert.strictEqual(bin[3], 0x11);
    assert.strictEqual(bin[4], 0x78);
    assert.strictEqual(bin[5], 0x56);

    // LXI HL, 9ABCH -> 21 BC 9A
    assert.strictEqual(bin[6], 0x21);
    assert.strictEqual(bin[7], 0xBC);
    assert.strictEqual(bin[8], 0x9A);
});

runTest('Assembler Supports RST 0 - RST 7 Instructions', () => {
    const assembler = new Assembler8080();
    const source = `
        RST 0
        RST 3
        RST 7
    `;
    const result = assembler.assemble(source);
    const bin = result.binary;

    assert.strictEqual(bin[0], 0xC7); // RST 0
    assert.strictEqual(bin[1], 0xDF); // RST 3
    assert.strictEqual(bin[2], 0xFF); // RST 7
});

runTest('Assembler Rejects Invalid Code & Registers', () => {
    const assembler = new Assembler8080();

    // Test invalid register
    assert.throws(() => {
        assembler.assemble('MOV B, X');
    }, /Invalid register/i);

    // Test MOV M, M (illegal instruction on 8080)
    assert.throws(() => {
        assembler.assemble('MOV M, M');
    }, /Cannot use MOV M, M/i);

    // Test undefined labels
    assert.throws(() => {
        assembler.assemble('JMP UNDEFINED_LABEL');
    }, /Undefined label/i);
});

// ------------------------------------------------------------------
//  Coprocesador de punto flotante
// ------------------------------------------------------------------

function makeSystem(source, { latency = true } = {}) {
    const cpu = new Intel8080();
    const fpu = new FPU8080();
    fpu.simulateLatency = latency;
    cpu.attachFPU(fpu);
    const asm = new Assembler8080();
    cpu.memory.set(asm.assemble(source).binary);
    return { cpu, fpu };
}

function runUntilHalt(cpu, fpu, max = 5000) {
    let n = 0;
    while (!(cpu.halted && fpu.busy === 0) && n < max) { cpu.step(); n++; }
    assert.ok(cpu.halted, 'el programa debe terminar en HLT');
    return n;
}

runTest('FPU: Assembler encodes ESC-prefixed instructions and DF/DW/DS', () => {
    const asm = new Assembler8080();
    const bin = asm.assemble(`
        FLD 2000H
        FLD M
        FILD HL
        FADD
        FLDCW 3
        FSTSW
        DF 1.0
        DW 1234H
        DS 2
        FSTP 2004H
    `).binary;
    assert.deepStrictEqual(Array.from(bin.slice(0, 4)), [0xED, 0x00, 0x00, 0x20]);   // FLD 2000H
    assert.deepStrictEqual(Array.from(bin.slice(4, 6)), [0xED, 0x40]);               // FLD M
    assert.deepStrictEqual(Array.from(bin.slice(6, 8)), [0xED, 0x12]);               // FILD HL
    assert.deepStrictEqual(Array.from(bin.slice(8, 10)), [0xED, 0x80]);              // FADD
    assert.deepStrictEqual(Array.from(bin.slice(10, 13)), [0xED, 0x98, 0x03]);       // FLDCW 3
    assert.deepStrictEqual(Array.from(bin.slice(13, 15)), [0xED, 0x94]);             // FSTSW -> A
    assert.deepStrictEqual(Array.from(bin.slice(15, 19)), [0x00, 0x00, 0x80, 0x3F]); // DF 1.0
    assert.deepStrictEqual(Array.from(bin.slice(19, 21)), [0x34, 0x12]);             // DW 1234H
    assert.deepStrictEqual(Array.from(bin.slice(23, 27)), [0xED, 0x02, 0x04, 0x20]); // FSTP tras DS 2
    assert.throws(() => asm.assemble('FSQRT 2000H'), /no acepta operandos/);
    assert.throws(() => asm.assemble('FLD'), /requiere un operando/);
    assert.throws(() => asm.assemble('DF abc'), /punto flotante inválido/);
});

runTest('FPU: IEEE 754 encoding/decoding helpers', () => {
    assert.strictEqual(FPU8080.floatToBits(1.0), 0x3F800000);
    assert.strictEqual(FPU8080.floatToBits(-2.5), 0xC0200000);
    assert.strictEqual(FPU8080.bitsToFloat(0x40490FDB), Math.fround(Math.PI));
    const d = FPU8080.decodeIEEE(-6.25);
    assert.strictEqual(d.sign, 1);
    assert.strictEqual(d.exp, 129);
    assert.strictEqual(d.exponentValue, 2);
    assert.strictEqual(d.mantissaValue, 1.5625);
    assert.deepStrictEqual(d.bytesLE, [0x00, 0x00, 0xC8, 0xC0]);
    assert.strictEqual(FPU8080.decodeIEEE(Infinity).kind, 'infinity');
    assert.strictEqual(FPU8080.decodeIEEE(NaN).kind, 'nan');
    assert.strictEqual(FPU8080.decodeIEEE(0).kind, 'zero');
    assert.strictEqual(FPU8080.decodeIEEE(1e-40).kind, 'subnormal');
});

runTest('FPU: Rounding modes to single precision', () => {
    const x = 0.1; // no representable en simple precisión
    const nearest = FPU8080.toSingle(x, 0);
    const down = FPU8080.toSingle(x, 1);
    const up = FPU8080.toSingle(x, 2);
    const trunc = FPU8080.toSingle(x, 3);
    assert.strictEqual(nearest, Math.fround(0.1));
    assert.ok(down <= x && up >= x && up > down, 'piso <= x <= techo');
    assert.strictEqual(trunc, down, 'truncar un positivo es el piso');
    assert.strictEqual(FPU8080.toSingle(-x, 3), -down, 'truncar un negativo va hacia cero');
    assert.strictEqual(FPU8080.toSingle(1e39, 3), 3.4028234663852886e38, 'truncar no desborda a infinito');
});

runTest('FPU: Load, arithmetic, store and integer conversion', () => {
    const { cpu, fpu } = makeSystem(`
        FLD X
        FLD Y
        FADD
        FST RES
        FISTP BC
        FWAIT
        HLT
        ORG 2000H
        X:   DF 3.5
        Y:   DF 2.25
        RES: DS 4
    `);
    runUntilHalt(cpu, fpu);
    assert.strictEqual(fpu.readFloat(cpu, 0x2008), 5.75);
    assert.strictEqual(cpu.getRP('bc'), 6, 'FISTP redondea 5.75 al entero más cercano (6)');
    assert.strictEqual(fpu.depth(), 0, 'la pila termina vacía');
    assert.strictEqual(fpu.exc.pe, true, 'la conversión 5.75 -> 6 es inexacta (PE)');
});

runTest('FPU: Latency stalls the CPU only on ESC; FWAIT resolves the data hazard', () => {
    const src = `
        FLD X
        FLD Y
        FMUL
        FSTP RES
        LDA RES
        MOV B, A
        FWAIT
        LDA RES
        HLT
        ORG 2000H
        X:   DF 1.0
        Y:   DF 3.14
        RES: DS 4
    `;
    const withLat = makeSystem(src);
    runUntilHalt(withLat.cpu, withLat.fpu);
    assert.strictEqual(withLat.cpu.registers.b, 0x00, 'sin FWAIT se lee el valor viejo');
    assert.strictEqual(withLat.cpu.registers.a, 0xC3, 'tras FWAIT se lee el byte bajo de 3.14 (4048F5C3H)');
    assert.ok(withLat.fpu.stallCycles > 0, 'debe haber ciclos de espera');

    const noLat = makeSystem(src, { latency: false });
    runUntilHalt(noLat.cpu, noLat.fpu);
    assert.strictEqual(noLat.cpu.registers.b, 0xC3, 'sin latencia el dato ya está escrito');
    assert.strictEqual(noLat.fpu.stallCycles, 0);
});

runTest('FPU: Stall bookkeeping (busy countdown and PC frozen while waiting)', () => {
    const { cpu, fpu } = makeSystem(`
        FLDZ
        FLD1
        FDIV
        FSQRT
        HLT
    `);
    cpu.step(); // FLDZ (latencia 1)
    cpu.step(); // FLD1 -> FLDZ completa antes; FLD1 pendiente
    cpu.step(); // FDIV: latencia 10
    assert.strictEqual(fpu.busy, 10);
    const pcBefore = cpu.registers.pc;
    cpu.step();
    assert.strictEqual(cpu.stalled, true, 'el siguiente ESC (FSQRT) debe esperar');
    assert.strictEqual(cpu.registers.pc, pcBefore, 'el PC no avanza durante WAIT');
    assert.strictEqual(fpu.busy, 9);
    for (let i = 0; i < 9; i++) cpu.step();
    assert.strictEqual(cpu.stalled, false);
    assert.ok(cpu.registers.pc > pcBefore, 'FSQRT se emitió al liberarse la FPU');
});

runTest('FPU: Exceptions (ZE, IE, OE, SF) and comparison condition codes', () => {
    const { cpu, fpu } = makeSystem(`
        FLD1
        FLDZ
        FDIV
        HLT
    `, { latency: false });
    runUntilHalt(cpu, fpu);
    assert.strictEqual(fpu.getST(0), Infinity);
    assert.strictEqual(fpu.exc.ze, true);
    assert.strictEqual(fpu.exc.oe, false, 'dividir entre cero no es overflow');

    fpu.init();
    fpu.push(-4); fpu.pending = null;
    const sqrt = fpu.build(cpu, 'FSQRT', 'stack', null, null, null, 'FSQRT');
    sqrt.run();
    assert.ok(Number.isNaN(fpu.getST(0)));
    assert.strictEqual(fpu.exc.ie, true);

    fpu.init();
    fpu.push(1e30); fpu.push(1e30);
    fpu.build(cpu, 'FMUL', 'stack', null, null, null, 'FMUL').run();
    assert.strictEqual(fpu.getST(0), Infinity);
    assert.strictEqual(fpu.exc.oe, true);

    fpu.init();
    for (let i = 0; i < 9; i++) fpu.push(i);
    assert.strictEqual(fpu.exc.sf, true, 'el noveno push desborda la pila');

    fpu.init();
    fpu.push(7); fpu.push(2.5); // ST(0)=2.5, ST(1)=7
    fpu.build(cpu, 'FCOM', 'stack', null, null, null, 'FCOM').run();
    assert.strictEqual(fpu.cc.c0, true, '2.5 < 7 -> C0');
    assert.strictEqual(fpu.cc.c3, false);
    fpu.build(cpu, 'FSTSW', 'stack', null, null, null, 'FSTSW').run();
    assert.strictEqual(cpu.registers.a & 0x41, 0x01, 'FSTSW deja C0 en el bit 0 de A');
    const sw = fpu.getStatusWord();
    assert.strictEqual((sw >> 11) & 7, fpu.top, 'la palabra de estado codifica TOP en los bits 11-13');
});

runTest('FPU: Disconnected coprocessor turns ESC into NOP but consumes operand bytes', () => {
    const { cpu, fpu } = makeSystem(`
        FLD X
        MVI A, 42
        HLT
        ORG 2000H
        X: DF 9.5
    `);
    fpu.enabled = false;
    runUntilHalt(cpu, fpu);
    assert.strictEqual(fpu.opsCount, 0);
    assert.strictEqual(fpu.depth(), 0);
    assert.strictEqual(cpu.registers.a, 42, 'los bytes de dirección no se ejecutan como opcodes');
});

runTest('FPU: All bundled example programs assemble, run and halt', () => {
    for (const ex of EXAMPLES) {
        const { cpu, fpu } = makeSystem(ex.code);
        const steps = runUntilHalt(cpu, fpu);
        assert.ok(steps < 5000, `${ex.title} no debe quedarse en un bucle`);
    }
    // Comprobaciones puntuales
    const suma = makeSystem(EXAMPLES.find(e => e.id === 'suma').code);
    runUntilHalt(suma.cpu, suma.fpu);
    assert.strictEqual(suma.fpu.readFloat(suma.cpu, 0x2008), 5.75);

    const lat = makeSystem(EXAMPLES.find(e => e.id === 'latencia').code);
    runUntilHalt(lat.cpu, lat.fpu);
    assert.strictEqual(lat.cpu.registers.b, 0x00);
    assert.strictEqual(lat.cpu.registers.a, 0xC3);

    const exc = makeSystem(EXAMPLES.find(e => e.id === 'excepciones').code);
    runUntilHalt(exc.cpu, exc.fpu);
    assert.deepStrictEqual([exc.fpu.exc.ze, exc.fpu.exc.ie, exc.fpu.exc.oe, exc.fpu.exc.pe], [true, true, true, true]);
});

console.log('All tests completed successfully!');
