# Intel 8080 Emulator & Assembler - Version 2.0.0

A web-based Intel 8080 CPU emulator and assembler built with 100% pure JavaScript, HTML, and CSS. No frameworks, no dependencies. Designed for educational purposes and fully compatible with GitHub Pages.

---

## What's New in Version 2.0.0 (V2) 🚀

- **Correct CPU Flag Management**:
  - **Auxiliary Carry (`AC`) flag** calculations are fully corrected for subtraction instructions (`SUB`, `SBB`, `CMP`) and decrements (`DCR`), matching the exact micro-operation behaviors of the physical Intel 8080 chip.
  - Added strict 8-bit masking (`& 0xFF`) on all rotates (`RLC`, `RAL`, etc.) to prevent accumulator overflow and ensure emulator stability.
- **Enhanced Assembler**:
  - Supports register pair aliases natively (`BC`, `DE`, `HL`, `SP`, `PSW`). For example, you can write `LXI BC, 1000H` and it compiles perfectly.
  - Strict assembler validations that reject illegal combinations such as `MOV M, M` or invalid registers (e.g. `MOV B, X`).
  - Strict validation of labels that prevents silent compilation failures when utilizing undefined labels.
  - Fully supports `RST` (Restart) instruction assembly.
- **Visual "Version 2" Badge**: Beautiful and stylized badge added to the header interface.
- **Unit and Regression Test Suite**: A comprehensive test suite in `test.js` to ensure the core CPU and Assembler stability.
- **Comprehensive Spanish Documentation (`INSTRUCTIONS.md`)**: A detailed manual detailing all commands, directives, registers, instruction sets, and a complete interactive **"Hello World"** template program!

---

## Features

- **8080 CPU Core**: Accurate emulation of the Intel 8080 instruction set.
  - Full support for Arithmetic, Logic, Data Transfer, Branching, and Stack instructions.
  - Implemented `DAA` (Decimal Adjust Accumulator).
  - Accurate Flag management (Sign, Zero, Auxiliary Carry, Parity, Carry).
- **Integrated Assembler**: Write and assemble 8080 mnemonics directly in the browser.
  - Supports labels and comments.
  - Supports `ORG` and `DB` directives.
  - Handles hex (e.g., `12H`, `0x12`) and decimal values.
- **CPU Dashboard**:
  - Real-time visualization of all registers (A, B, C, D, E, H, L, PC, SP).
  - Individual flag indicators.
  - Status display (Idle, Running, Halted).
- **Interactive Memory Viewer**:
  - Live memory grid with search-by-address functionality.
  - Highlights the current instruction pointer (PC).
- **Execution Controls**:
  - **Assemble & Load**: Compiles your code and places it in memory.
  - **Run**: Executes the code at high speed.
  - **Stop**: Pauses execution.
  - **Step**: Executes one instruction at a time.
  - **Reset**: Clears registers and flags, resets PC to 0000H.

## How to Use

1. Open `index.html` in any modern web browser.
2. Write your 8080 Assembly code in the "Assembler" text area.
3. Click **Assemble & Load**.
4. Use **Step** to debug or **Run** to execute the full program.
5. Watch the **Registers** and **Memory View** to see your code in action.

### Example Code (Hello World / Text Buffer Copy)
See `INSTRUCTIONS.md` for a complete step-by-step interactive walk-through!
```assembly
; This program copies a string to 2000H
        ORG 0000H
        LXI HL, CADENA
        LXI DE, 2000H
BUCLE:  MOV A, M
        CPI 0
        JZ FIN
        STAX DE
        INX HL
        INX DE
        JMP BUCLE
FIN:    HLT
CADENA: DB 48H, 45H, 4CH, 4CH, 4FH, 20H, 4DH, 55H, 4EH, 44H, 4FH, 21H, 00H ; "HELLO MUNDO!"
```

## Project Structure

- `index.html`: Main UI structure (with the Version 2 badge).
- `styles.css`: UI styling and layout.
- `cpu.js`: Intel 8080 CPU emulation logic (V2 accurate flag logic).
- `assembler.js`: 8080 Assembler and machine code generator (with registers & labels validation).
- `main.js`: UI integration and execution loop.
- `INSTRUCTIONS.md`: Comprehensive user manual and interactive tutorial guide.
- `test.js`: Core CPU and Assembler unit test file.

## Running Tests

To run the unit tests, execute:
```bash
node test.js
```

## Deployment

Simply push this repository to GitHub and enable **GitHub Pages** in the repository settings.

---
**Version**: 2.0.0
**License**: MIT
