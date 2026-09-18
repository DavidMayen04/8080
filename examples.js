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
        id: 'latencia',
        title: '2. Latencia y FWAIT (riesgo de datos)',
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
        id: 'excepciones',
        title: '3. Excepciones: ÷0, √negativo, overflow, inexacto',
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
    }
];

if (typeof module !== 'undefined') {
    module.exports = EXAMPLES;
}
