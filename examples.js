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
    },
    {
        id: 'calibracion',
        title: '4. Calibración de sensor (mínimos cuadrados)',
        code: `ORG 0000H
INICIO: LXI SP, 3000H
    FINIT
    FILD NPARES
    FSTP NF
    FLDZ
    FST SX
    FST SY
    FST SXX
    FST SXY
    FSTP SSE
    LXI H, PARES
    LDA NPARES
    MOV B, A
SUMAS: FLD SX
    FADD M
    FSTP SX
    FLD M
    FMUL M
    FADD SXX
    FSTP SXX
    FLD M
    CALL AVANZA
    FMUL M
    FADD SXY
    FSTP SXY
    FLD SY
    FADD M
    FSTP SY
    CALL AVANZA
    DCR B
    JNZ SUMAS
    FLD NF
    FMUL SXX
    FLD SX
    FMUL SX
    FSUB
    FTST
    FSTSW
    ANI 40H
    JNZ ERROR
    FSTP DEN
    FLD NF
    FMUL SXY
    FLD SX
    FMUL SY
    FSUB
    FDIV DEN
    FST PEND
    FMUL SX
    FLD SY
    FXCH
    FSUB
    FDIV NF
    FSTP INTER
    LXI H, PARES
    LDA NPARES
    MOV B, A
RESID: FLD M
    FMUL PEND
    FADD INTER
    CALL AVANZA
    FSUB M
    FDUP
    FMUL
    FADD SSE
    FSTP SSE
    CALL AVANZA
    DCR B
    JNZ RESID
    FLD SSE
    FDIV NF
    FSQRT
    FST RMSE
    FCOM LIMITE
    FSTSW
    FPOP
    ANI 01H
    MOV C, A
    LXI H, LECTURAS
    LXI D, CORREGIDAS
    LDA NLECTURAS
    MOV B, A
CORREGIR: FLD M
    FMUL PEND
    FADD INTER
    XCHG
    FSTP M
    CALL AVANZA
    XCHG
    CALL AVANZA
    DCR B
    JNZ CORREGIR
    MOV A, C
    ORA A
    JZ ERROR
    MVI A, 01H
    JMP FIN
ERROR: FINIT
    MVI A, 0FFH
FIN: FWAIT
    STA ESTADO
    HLT
AVANZA: INX H
    INX H
    INX H
    INX H
    RET

ORG 2000H
PARES: DF 10.0, 15.0
    DF 20.0, 24.0
    DF 30.0, 38.0
    DF 40.0, 45.0
    DF 50.0, 65.0

ORG 2030H
LECTURAS: DF 16.25, 27.5, 38.75, 42.0

ORG 2040H
PEND: DS 4
INTER: DS 4
RMSE: DS 4
CORREGIDAS: DS 16
ESTADO: DS 1

ORG 2060H
NPARES: DW 5
NLECTURAS: DB 4
LIMITE: DF 3.0
NF: DS 4
SX: DS 4
SY: DS 4
SXX: DS 4
SXY: DS 4
DEN: DS 4
SSE: DS 4
`
    },
    {
        id: 'calibracion-error',
        title: '5. Calibración con x iguales (división por cero)',
        code: `ORG 0000H
INICIO: LXI SP, 3000H
    FINIT
    FILD NPARES
    FSTP NF
    FLDZ
    FST SX
    FST SY
    FST SXX
    FST SXY
    FSTP SSE
    LXI H, PARES
    LDA NPARES
    MOV B, A
SUMAS: FLD SX
    FADD M
    FSTP SX
    FLD M
    FMUL M
    FADD SXX
    FSTP SXX
    FLD M
    CALL AVANZA
    FMUL M
    FADD SXY
    FSTP SXY
    FLD SY
    FADD M
    FSTP SY
    CALL AVANZA
    DCR B
    JNZ SUMAS
    FLD NF
    FMUL SXX
    FLD SX
    FMUL SX
    FSUB
    FTST
    FSTSW
    ANI 40H
    JNZ ERROR
    FSTP DEN
    FLD NF
    FMUL SXY
    FLD SX
    FMUL SY
    FSUB
    FDIV DEN
    FST PEND
    FMUL SX
    FLD SY
    FXCH
    FSUB
    FDIV NF
    FSTP INTER
    LXI H, PARES
    LDA NPARES
    MOV B, A
RESID: FLD M
    FMUL PEND
    FADD INTER
    CALL AVANZA
    FSUB M
    FDUP
    FMUL
    FADD SSE
    FSTP SSE
    CALL AVANZA
    DCR B
    JNZ RESID
    FLD SSE
    FDIV NF
    FSQRT
    FST RMSE
    FCOM LIMITE
    FSTSW
    FPOP
    ANI 01H
    MOV C, A
    LXI H, LECTURAS
    LXI D, CORREGIDAS
    LDA NLECTURAS
    MOV B, A
CORREGIR: FLD M
    FMUL PEND
    FADD INTER
    XCHG
    FSTP M
    CALL AVANZA
    XCHG
    CALL AVANZA
    DCR B
    JNZ CORREGIR
    MOV A, C
    ORA A
    JZ ERROR
    MVI A, 01H
    JMP FIN
ERROR: FINIT
    MVI A, 0FFH
FIN: FWAIT
    STA ESTADO
    HLT
AVANZA: INX H
    INX H
    INX H
    INX H
    RET

ORG 2000H
PARES: DF 10.0, 15.0
    DF 10.0, 24.0
    DF 10.0, 38.0
    DF 10.0, 45.0
    DF 10.0, 65.0

ORG 2030H
LECTURAS: DF 16.25, 27.5, 38.75, 42.0

ORG 2040H
PEND: DS 4
INTER: DS 4
RMSE: DS 4
CORREGIDAS: DS 16
ESTADO: DS 1

ORG 2060H
NPARES: DW 5
NLECTURAS: DB 4
LIMITE: DF 3.0
NF: DS 4
SX: DS 4
SY: DS 4
SXX: DS 4
SXY: DS 4
DEN: DS 4
SSE: DS 4
`
    }
];

if (typeof module !== 'undefined') {
    module.exports = EXAMPLES;
}
