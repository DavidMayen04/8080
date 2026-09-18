// examples.js - Programas de ejemplo para el emulador con coprocesador.
// Cada ejemplo se carga en el editor desde el menú desplegable.

const EXAMPLES = [
    {
        id: 'suma',
        title: '1. Suma de dos números flotantes',
        code: `; Suma de dos números en punto flotante
; RES = 3.5 + 2.25 = 5.75
ORG 0000H
    FLD X        ; apila 3.5           ST(0) = 3.5
    FLD Y        ; apila 2.25          ST(0) = 2.25, ST(1) = 3.5
    FADD         ; ST(1) + ST(0), pop  ST(0) = 5.75
    FSTP RES     ; guarda en RES y desapila
    FWAIT        ; espera a que la FPU termine de escribir
    HLT

ORG 2000H
X:   DF 3.5
Y:   DF 2.25
RES: DS 4        ; reserva 4 bytes para el resultado
`
    },
    {
        id: 'celsius',
        title: '2. Celsius a Fahrenheit (enteros ↔ flotantes)',
        code: `; Convierte una temperatura entera en °C a °F
; F = C × 1.8 + 32   (37 °C → 98.6 °F)
ORG 0000H
    LXI HL, 37       ; HL = 37 (entero de 16 bits)
    FILD HL          ; convierte HL a float: ST(0) = 37.0
    FMUL FACTOR      ; ST(0) = 37.0 × 1.8 = 66.6
    FADD OFFSET      ; ST(0) = 66.6 + 32.0 = 98.6
    FST FAHR         ; guarda el float exacto en memoria
    FISTP BC         ; redondea a entero y lo deja en BC (99), desapila
    FWAIT
    HLT

ORG 2000H
FACTOR: DF 1.8
OFFSET: DF 32.0
FAHR:   DS 4
`
    },
    {
        id: 'latencia',
        title: '3. Latencia y FWAIT (riesgo de datos)',
        code: `; ¿Por qué hace falta FWAIT antes de leer un resultado de la FPU?
; B recibe el valor viejo; A el correcto.
ORG 0000H
    FLD X
    FLD Y
    FMUL           ; 6 ciclos de latencia (ST(0) = 3.14)
    FSTP RES       ; la FPU escribirá RES cuando termine (2 ciclos)
    LDA RES        ; ¡Riesgo! RES aún no fue escrito → A = 00
    MOV B, A       ; B conserva el valor viejo (00)
    FWAIT          ; espera a que la FPU termine de escribir
    LDA RES        ; ahora sí: A = C3H (byte bajo de 3.14 = 4048F5C3H)
    HLT

ORG 2000H
X:   DF 1.0
Y:   DF 3.14
RES: DS 4
`
    },
    {
        id: 'comparar',
        title: '4. Comparación y salto condicional (FCOM + FSTSW)',
        code: `; Compara X con Y y deja en RESULT:
;   1 si X < Y,  2 si X = Y,  0 si X > Y
ORG 0000H
    FLD Y            ; ST(0) = Y
    FLD X            ; ST(0) = X, ST(1) = Y
    FCOM             ; compara ST(0) con ST(1): C3 = igual, C0 = menor
    FSTSW            ; A = byte alto de la palabra de estado
    ANI 41H          ; conserva C3 (bit 6) y C0 (bit 0)
    CPI 40H          ; ¿solo C3?
    JZ IGUALES
    ANI 01H          ; ¿C0?
    JNZ MENOR
    MVI A, 0         ; X > Y
    JMP FIN
MENOR:
    MVI A, 1
    JMP FIN
IGUALES:
    MVI A, 2
FIN:
    STA RESULT
    HLT

ORG 2000H
X:      DF 2.5
Y:      DF 7.0
RESULT: DS 1
`
    },
    {
        id: 'excepciones',
        title: '5. Excepciones: ÷0, √negativo, overflow, inexacto',
        code: `; Provoca excepciones y observa la palabra de estado
ORG 0000H
    FLD1
    FLDZ
    FDIV           ; 1.0 ÷ 0.0 → ZE, resultado +Inf
    FPOP
    FLD NEG
    FSQRT          ; √(-4.0) → IE, resultado NaN
    FPOP
    FLD GRANDE
    FDUP
    FMUL           ; 1e30 × 1e30 → OE, resultado +Inf
    FPOP
    FLD1
    FLD TRES
    FDIV           ; 1 ÷ 3 no es exacto → PE
    FSTSW ESTADO   ; guarda la palabra de estado completa (16 bits)
    FWAIT
    HLT

ORG 2000H
NEG:    DF -4.0
GRANDE: DF 1e30
TRES:   DF 3.0
ESTADO: DS 2
`
    },
    {
        id: 'circulo',
        title: '6. Área de un círculo (π · r²)',
        code: `; Área de un círculo: AREA = π × r × r
ORG 0000H
    FLDPI        ; ST(0) = π
    FLD RADIO    ; ST(0) = r,  ST(1) = π
    FDUP         ; ST(0) = r,  ST(1) = r,  ST(2) = π
    FMUL         ; ST(0) = r², ST(1) = π
    FMUL         ; ST(0) = π·r²
    FSTP AREA    ; guarda el resultado (19.634954)
    FWAIT
    HLT

ORG 2000H
RADIO: DF 2.5
AREA:  DS 4
`
    },
    {
        id: 'redondeo',
        title: '7. Modos de redondeo (FLDCW + FIST)',
        code: `; Convierte 2.5 a entero con los cuatro modos de redondeo
ORG 0000H
    FLD X            ; ST(0) = 2.5
    FLDCW 0          ; al más cercano (par) → 2
    FIST R0
    FLDCW 1          ; hacia -inf (piso)     → 2
    FIST R1
    FLDCW 2          ; hacia +inf (techo)    → 3
    FIST R2
    FLDCW 3          ; truncar               → 2
    FISTP R3
    FWAIT
    HLT

ORG 2000H
X:  DF 2.5
R0: DS 2
R1: DS 2
R2: DS 2
R3: DS 2
`
    }
];

if (typeof module !== 'undefined') {
    module.exports = EXAMPLES;
}
