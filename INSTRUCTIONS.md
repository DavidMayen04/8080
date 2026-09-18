# Libro-Guía Didáctica: Programación en Bajo Nivel e Intel 8080

**Diseñado para estudiantes de lenguajes de alto nivel**

¡Bienvenido a la guía didáctica definitiva para dominar el funcionamiento interno de una computadora! Si ya sabes programar en lenguajes como Python, Java, JavaScript o C++, estás acostumbrado a pensar en términos de variables, objetos, condicionales `if-else`, bucles `for`/`while` y funciones.

En este manual, no asumimos que sepas nada sobre electrónica o lenguaje ensamblador (*Assembly*). En su lugar, utilizaremos tus conocimientos de alto nivel como un puente para entender cómo el procesador (CPU) traduce esas construcciones lógicas abstractas en instrucciones físicas reales.

---

## Índice

1. [Introducción: Del Alto Nivel al Bajo Nivel](#introducción-del-alto-nivel-al-bajo-nivel)
2. [Capítulo 1: Operando el Entorno de Simulación](#capítulo-1-operando-el-entorno-de-simulación)
3. [Capítulo 2: Primer Grupo - Aritmética Básica y Abstracciones](#capítulo-2-primer-grupo---aritmética-básica-y-abstracciones)
4. [Capítulo 3: Segundo Grupo - Estructuras de Control y Lógica de Bits](#capítulo-3-segundo-grupo---estructuras-de-control-y-lógica-de-bits)
5. [Capítulo 4: Tercer Grupo - Operando la Pila (Stack) y Funciones](#capítulo-4-tercer-grupo---operando-la-pila-stack-y-funciones)
6. [Capítulo 5: Desafío Avanzado - Operaciones de 16 Bits en un CPU de 8 Bits](#capítulo-5-desafío-avanzado---operaciones-de-16-bits-en-un-cpu-de-8-bits)
7. [Capítulo 6: El Coprocesador de Punto Flotante](#capítulo-6-el-coprocesador-de-punto-flotante)

---

## Introducción: Del Alto Nivel al Bajo Nivel

Cuando escribes código de alto nivel, el compilador o intérprete oculta los detalles físicos del procesador. Aquí veremos cómo se corresponden exactamente tus conceptos diarios con el hardware:

| Concepto de Alto Nivel | Equivalente en Bajo Nivel | ¿Qué es y cómo funciona? |
| :--- | :--- | :--- |
| **Variables simples** (ej. `x = 5`) | **Registros** (`A`, `B`, `C`, etc.) o **Celdas de Memoria RAM** | Los registros son casillas de almacenamiento ultrarrápido dentro del propio CPU. Para variables de uso constante, usamos registros; para almacenar más datos, usamos direcciones de la memoria RAM. |
| **Condicionales** (`if / else`) | **Comparaciones (`CMP`) + Banderas (*Flags*) + Saltos Condicionales** | El CPU realiza una resta interna invisible. Si el resultado es cero, se activa la bandera de cero (`Z = 1`). Luego, una instrucción de salto como `JZ` (Salta si es Cero) redirige el flujo del programa. |
| **Bucles** (`while`, `for`) | **Decremento (`DCR`) + Salto si no es cero (`JNZ`)** | Se establece un registro como contador. En cada ciclo, se decrementa en 1 y se salta al inicio del ciclo mientras el contador no sea cero. |
| **Listas o Vectores** (ej. `array[3]`) | **Punteros de Memoria** (`HL`) | La pareja de registros `H` y `L` se unen para almacenar una dirección de memoria completa de 16 bits. Al acceder al registro virtual `M`, el CPU lee o escribe en la celda a la que apunta `HL`. |
| **Funciones / Métodos** | **Subrutinas (`CALL` / `RET`) + Pila (`Stack`)** | Al llamar a una función, el CPU guarda la dirección de retorno en la Pila de memoria (LIFO), salta al código de la función y, al encontrar un `RET`, recupera la dirección para continuar donde estaba. |

---

## Capítulo 1: Operando el Entorno de Simulación

Antes de escribir tu primer programa, familiarízate con los mandos del simulador (Panel Derecho):

1. **Assemble & Load (Ensamblar y Cargar):** Toma el código del editor, lo traduce a código de máquina hexadecimal (opcodes) y lo escribe en la memoria RAM del simulador.
2. **Clear Code (Limpiar Código):** Vacía el área de escritura del ensamblador y sus salidas para que puedas empezar de nuevo limpiamente.
3. **Run (Ejecutar):** Inicia la ejecución automática del programa a alta velocidad. Si no hay una instrucción `HLT` (Halt/Detener), el programa seguirá ejecutándose indefinidamente en un bucle de instrucciones `NOP`.
4. **Stop (Detener):** Pausa el programa en cualquier momento para inspeccionar qué valores han quedado en los registros y la memoria.
5. **Step (Paso a Paso):** Ejecuta una sola instrucción. Es la herramienta de depuración (*debugging*) más potente. Te permite ver exactamente qué efecto tiene cada línea en el CPU.
6. **Reset (Reiniciar):** Detiene ejecuciones activas, rellena toda la memoria RAM con ceros, limpia la consola y devuelve todos los registros y banderas a sus estados por defecto (`PC = 0000`, `SP = FFFF`).
7. **Banderas Explicadas (Flags Tooltips):** Al pasar el ratón por encima de los indicadores de banderas (`S`, `Z`, `AC`, `P`, `CY`), verás una explicación interactiva de su significado lógico.
8. **Stack View (Vista de la Pila):** Ubicado abajo de los flags. Muestra un corte de la memoria RAM alrededor de la dirección del puntero de pila (`SP`). El renglón amarillo representa la cima de la pila (`Top of Stack`).

---

## Capítulo 2: Primer Grupo - Aritmética Básica y Abstracciones

El Intel 8080 es un procesador de **8 bits**. Esto significa que sus registros de propósito general (como `A`, `B`, `C`) solo pueden almacenar números enteros entre `0` y `255` (en decimal) o de `00H` a `FFH` (en hexadecimal).

A continuación, veremos cómo implementar operaciones aritméticas básicas que en alto nivel haces de forma directa.

### 2.1 Adición (Suma)
*   **Abstracción de Alto Nivel:** `resultado = a + b`
*   **Enfoque de Bajo Nivel:** El CPU realiza sumas usando el **Acumulador (Registro `A`)** como protagonista. Cargamos el primer número en `A`, y le sumamos el segundo desde otro registro o como un valor inmediato.

```assembly
; --- PROGRAMA DE SUMA ---
ORG 0000H          ; Inicia el programa en la dirección de memoria 0000H
MVI A, 15          ; Variable A = 15 (Carga 15 decimal en el acumulador A)
MVI B, 27          ; Variable B = 27 (Carga 27 decimal en el registro B)
ADD B              ; A = A + B (El resultado, 42, se almacena en el acumulador A)
STA 2000H          ; resultado = A (Guarda el valor 42 en la celda de memoria 2000H)
HLT                ; Detiene el CPU
```

---

### 2.2 Resta
*   **Abstracción de Alto Nivel:** `resultado = a - b`
*   **Enfoque de Bajo Nivel:** De forma similar a la suma, el minuendo debe cargarse en `A` y el sustraendo se resta usando la instrucción `SUB` (desde un registro) o `SUI` (valor inmediato).

```assembly
; --- PROGRAMA DE RESTA ---
ORG 0000H
MVI A, 50          ; Minuendo A = 50
MVI B, 18          ; Sustraendo B = 18
SUB B              ; A = A - B (El resultado, 32 / 20H, queda en A)
STA 2000H          ; Guarda el resultado en la celda de memoria 2000H
HLT
```

---

### 2.3 Resta con Resultado Negativo (Entendiendo el Complemento a 2)
*   **Abstracción de Alto Nivel:** `resultado = 5 - 8` (Esperamos `-3`)
*   **La Realidad del Bajo Nivel:** Dado que el procesador solo entiende bytes (`0` a `255`), representa los números negativos mediante el sistema de **Complemento a 2**.
    *   Si realizamos una resta donde el sustraendo es mayor, se activará la bandera de acarreo/préstamo (**`CY = 1`**) y la bandera de signo (**`S = 1`**), indicando que el resultado es negativo.
    *   El valor obtenido en `A` será `FDH` (`253` en decimal sin signo). En complemento a 2 de 8 bits, `FDH` representa exactamente `-3` (ya que `256 - 3 = 253`).

```assembly
; --- RESTA CON RESULTADO NEGATIVO ---
ORG 0000H
MVI A, 5           ; Carga 5 en el acumulador
MVI B, 8           ; Carga 8 en el registro B
SUB B              ; A = A - B. Resultado en A = FDH (que es -3 en Complemento a 2)
                   ; Se activarán las banderas S (Signo = 1) y CY (Carry/Borrow = 1)
STA 2000H          ; Almacena FDH en la dirección 2000H
HLT
```

---

### 2.4 Multiplicación (Mediante Sumas Sucesivas)
*   **Abstracción de Alto Nivel:** `resultado = multiplicando * multiplicador` (ej. `6 * 4`)
*   **Abstracción Algorítmica:** El Intel 8080 no posee una instrucción física para multiplicar. Por ende, debemos crear un ciclo que sume el *multiplicando* tantas veces como indique el *multiplicador*.
*   **Equivalencia en pseudocódigo:**
    ```python
    acumulador = 0
    multiplicando = 6
    multiplicador = 4
    while multiplicador > 0:
        acumulador += multiplicando
        multiplicador -= 1
    ```

```assembly
; --- PROGRAMA DE MULTIPLICACIÓN ---
ORG 0000H
MVI A, 0           ; Inicializa el acumulador (A = 0) para llevar la suma total
MVI B, 6           ; Registro B = Multiplicando (6)
MVI C, 4           ; Registro C = Multiplicador / Contador (4)

BUCLE_MULT:
    CPI 0          ; Compara si el contador en C ha llegado a 0 (Nota: el acumulador debe preservarse,
                   ; pero para no perder la suma temporal, sumamos y evaluamos el contador)
    MOV A, A       ; NOP virtual
    ADD B          ; Suma el multiplicando a la cuenta: A = A + B
    DCR C          ; Decrementa el contador en C: C = C - 1
    JNZ BUCLE_MULT ; Si C no es cero, repite el ciclo de suma

STA 2000H          ; Guarda el resultado (24 / 18H) en la celda 2000H
HLT
```

---

### 2.5 División (Mediante Restas Sucesivas)
*   **Abstracción de Alto Nivel:** `cociente, residuo = dividendo / divisor` (ej. `17 / 5` ➔ Cociente: `3`, Residuo: `2`)
*   **Abstracción Algorítmica:** Restamos repetidamente el *divisor* al *dividendo* hasta que lo que quede en el dividendo sea menor que el divisor. El número de restas realizadas será el **cociente**, y lo que reste en el dividendo será el **residuo**.
*   **Equivalencia en pseudocódigo:**
    ```python
    dividendo = 17
    divisor = 5
    cociente = 0
    while dividendo >= divisor:
        dividendo -= divisor
        cociente += 1
    residuo = dividendo
    ```

```assembly
; --- PROGRAMA DE DIVISIÓN ---
ORG 0000H
MVI A, 17          ; Acumulador A = Dividendo (17)
MVI B, 5           ; Registro B = Divisor (5)
MVI C, 0           ; Registro C = Cociente (inicia en 0)

BUCLE_DIV:
    CMP B          ; Compara el acumulador (dividendo actual) con el divisor (B)
    JC FIN_DIV     ; Si A < B, se activa la bandera de Carry (CY=1). Saltamos al final.

    SUB B          ; A = A - B (Resta el divisor)
    INR C          ; Incrementa el cociente: C = C + 1
    JMP BUCLE_DIV  ; Repite el proceso de comparación y resta

FIN_DIV:
    STA 2001H      ; Guarda el Residuo (lo que quedó en A, que es 2) en 2001H
    MOV A, C       ; Pasa el Cociente (C) al acumulador para poder guardarlo
    STA 2000H      ; Guarda el Cociente (3) en la dirección 2000H
    HLT
```

---

### 2.6 Exponente (Base elevada a un Exponente)
*   **Abstracción de Alto Nivel:** `resultado = base^exponente` (ej. `3^3` ➔ `27`)
*   **Abstracción Algorítmica:** La potenciación es una multiplicación repetida. Para calcular `3^3`, multiplicamos la base por sí misma `exponente - 1` veces. Dado que la multiplicación ya es un ciclo de sumas sucesivas, la potenciación se convierte en un **bucle anidado** (un bucle dentro de otro bucle).
*   **Equivalencia en pseudocódigo:**
    ```python
    base = 3
    exponente = 3
    resultado = base
    # Multiplicamos el resultado por la base tantas veces como el exponente demande
    for i in range(exponente - 1):
        temp = 0
        for j in range(base):
            temp += resultado
        resultado = temp
    ```

```assembly
; --- PROGRAMA DE EXPONENCIACIÓN (POTENCIA) ---
; Calcula 3^3 = 27 (1BH)
; Registro D: Base (3)
; Registro E: Exponente restante / Contador externo (restan 2 multiplicaciones)
; Registro C: Resultado acumulado (inicia con el valor de la base: 3)

ORG 0000H
MVI D, 3           ; Base = 3
MVI E, 2           ; Multiplicaciones a realizar (Exponente - 1 = 2)
MVI C, 3           ; Inicializa resultado temporal con la base (3)

BUCLE_POT:
    MOV A, E       ; Verifica si el contador del exponente llegó a 0
    CPI 0
    JZ FIN_POT     ; Si es cero, terminar.

    ; --- Multiplicar C (Resultado temporal) por D (Base) ---
    MVI B, 0       ; Limpia B (guardará el resultado de la multiplicación actual)
    MOV H, D       ; H = Contador interno (número de sumas = Base)

SUMA_REP:
    MOV A, B
    ADD C          ; Suma el resultado acumulado anterior
    MOV B, A       ; Guarda la suma parcial en B
    DCR H          ; Decrementa contador de sumas
    JNZ SUMA_REP   ; Repite la suma hasta sumar 'Base' veces

    MOV C, B       ; C = Nuevo resultado acumulado
    DCR E          ; Decrementa el contador externo de multiplicaciones
    JMP BUCLE_POT

FIN_POT:
    MOV A, C       ; Copia resultado final a A
    STA 2000H      ; Almacena 27 (1BH) en la dirección de memoria 2000H
    HLT
```

---

## Capítulo 3: Segundo Grupo - Estructuras de Control y Lógica de Bits

En los lenguajes de alto nivel, tomas decisiones lógicas complejas con palabras clave simples. En bajo nivel, dependes enteramente de evaluar banderas aritméticas o manipular bits de forma individual.

### 3.1 Condicionales (`If / Else`)
*   **Abstracción de Alto Nivel:**
    ```python
    if x == y:
        registro_a = 100
    else:
        registro_a = 200
    ```
*   **Enfoque de Bajo Nivel:** Usamos la instrucción de comparación `CMP`. Esta resta temporalmente los valores y ajusta las banderas. Si los números son iguales, la resta da cero y activa la bandera `Z = 1`. Evaluamos esto mediante saltos condicionales (`JZ` o `JNZ`).

```assembly
; --- ESTRUCTURA CONDICIONAL (IF / ELSE) ---
ORG 0000H
MVI B, 15          ; Variable x = 15
MVI C, 15          ; Variable y = 15

MOV A, B           ; Mueve x al acumulador para la comparación
CMP C              ; Compara A (x) con C (y). Si x == y, se activa Z (Z = 1)
JZ CASO_IGUAL      ; Si Z = 1, salta a la etiqueta CASO_IGUAL (Bloque IF)

; --- BLOQUE ELSE ---
MVI A, 200         ; Si no fueron iguales, carga 200 en A
JMP FIN_IF         ; Salta para no ejecutar el bloque IF

CASO_IGUAL:
; --- BLOQUE IF ---
MVI A, 100         ; Si fueron iguales, carga 100 en A

FIN_IF:
STA 2000H          ; Almacena el resultado de la decisión en la dirección 2000H
HLT
```

---

### 3.2 Ciclos / Bucles (Estructuras de Repetición)
*   **Abstracción de Alto Nivel:**
    ```python
    for i in range(5, 0, -1):
        # hacer algo
    ```
*   **Enfoque de Bajo Nivel:** Establecemos un registro como contador (ej. 5), realizamos las tareas de cuerpo del bucle, decrementamos el registro con `DCR` y evaluamos si ha llegado a cero usando `JNZ` (Salta si No es Cero) para repetir.

```assembly
; --- BUCLE DE CONTEO REGRESIVO (5 a 1) ---
ORG 0000H
LXI HL, 2000H      ; HL apunta a la dirección de memoria inicial de escritura (2000H)
MVI B, 5           ; Inicializa contador en 5

BUCLE_REP:
    MOV A, B       ; Copia el contador actual al acumulador
    MOV M, A       ; Guarda el número en la celda de memoria apuntada por HL
    INX HL         ; Incrementa HL (apunta a la siguiente posición de memoria)

    DCR B          ; Decrementa el contador: B = B - 1 (Afecta la bandera Z si llega a 0)
    JNZ BUCLE_REP  ; Si el contador B no es cero (Z = 0), repite el ciclo

HLT                ; Al finalizar, la memoria desde 2000H tendrá los valores [05, 04, 03, 02, 01]
```

---

### 3.3 Operadores Lógicos de Bits (NOT, XOR, vaciar registro)
La manipulación de compuertas lógicas es la base de la optimización en ensamblador:

*   **Operador NOT (Bitwise Inversion - `CMA`):** Invierte individualmente cada bit de un número (los 0s se vuelven 1s y viceversa). Esto es el complemento a 1 de un número.
*   **Operador XOR (Exclusive OR - `XRA` / `XRI`):** Compara dos secuencias de bits. Si los bits son diferentes devuelve 1, si son iguales devuelve 0.
    *   **Truco Maestro de Optimización:** En ensamblador, hacer `XRA A` (XOR del acumulador consigo mismo) es la forma más rápida y óptima de **vaciar el acumulador a cero (`A = 0`)** y poner la bandera `Z` en 1 en un solo ciclo de instrucción.

```assembly
; --- DEMOSTRACIÓN DE OPERADORES LÓGICOS ---
ORG 0000H

; 1. Operación NOT
MVI A, 0F0H        ; Carga 11110000B en el acumulador
CMA                ; Invierte todos los bits de A. Ahora A = 00001111B (0FH)
STA 2000H          ; Guarda 0FH en 2000H

; 2. Operación XOR para enmascarar / alternar
MVI A, 0AAH        ; A = 10101010B
XRI 0FFH           ; XOR inmediato con 11111111B. Invierte todos los bits.
                   ; Ahora A = 01010101B (55H)
STA 2001H          ; Guarda 55H en 2001H

; 3. Vaciar el registro (XRA A)
XRA A              ; XOR A con A. Como todos los bits son idénticos, el resultado es 00H.
                   ; Es el equivalente de bajo nivel a "A = 0" de alto rendimiento.
STA 2002H          ; Guarda 00H en 2002H
HLT
```

---

## Capítulo 4: Tercer Grupo - Operando la Pila (Stack) y Funciones

Cuando programas en alto nivel, llamas a funciones de forma anidada y el sistema se encarga de recordar dónde regresar. En esta sección veremos cómo la **Pila (*Stack*)** hace posible esta magia mediante una estructura de memoria **LIFO (Last In, First Out)**.

### 4.1 Operando la Pila (`PUSH` y `POP`)
La pila es una zona especial de la memoria RAM que se gestiona mediante el registro **Stack Pointer (`SP`)**.
*   **`PUSH` (Guardar):** Decrementa `SP` y guarda temporalmente el valor de un par de registros en la pila.
*   **`POP` (Recuperar):** Recupera el último valor guardado en la pila, lo deposita en un par de registros e incrementa `SP`.
*   *Usa el panel de **Stack View** en el simulador para observar cómo suben y bajan los valores físicamente con cada instrucción.*

```assembly
; --- USO BÁSICO DE LA PILA ---
ORG 0000H
LXI SP, FFFFH      ; Inicializa el puntero de pila en la dirección más alta de memoria

MVI B, 12H         ; Carga datos en el par BC
MVI C, 34H
MVI D, 56H         ; Carga datos en el par DE
MVI E, 78H

PUSH BC            ; Guarda el valor de BC (1234H) en la pila. SP decrece en 2.
PUSH DE            ; Guarda el valor de DE (5678H) en la pila. SP decrece en 2.

; Ahora cambiaremos los registros para simular que realizamos otras tareas
MVI B, 00H
MVI C, 00H
MVI D, 00H
MVI E, 00H

POP HL             ; Recupera el último valor de la pila (5678H, que estaba en DE) y lo carga en HL
POP BC             ; Recupera el siguiente valor (1234H, que estaba en BC) y lo deposita en BC

HLT
```

---

### 4.2 Subrutinas y Funciones (`CALL` y `RET`)
*   **Abstracción de Alto Nivel:**
    ```python
    def duplicar(n):
        return n * 2

    x = duplicar(5)
    ```
*   **Enfoque de Bajo Nivel:**
    *   `CALL` escribe en la pila la dirección del Program Counter (`PC`) actual (la dirección de retorno) y salta a la dirección de la subrutina.
    *   La subrutina realiza su trabajo y finaliza con `RET`.
    *   `RET` extrae de la pila la dirección de retorno guardada y salta de vuelta a ella para continuar la ejecución del programa principal.

```assembly
; --- PROGRAMA PRINCIPAL CON LLAMADA A FUNCIÓN ---
ORG 0000H
LXI SP, FFFFH      ; Inicializa la pila

MVI A, 5           ; Pasamos el parámetro de la función cargándolo en A (A = 5)
CALL DUPLICAR      ; Llama a la función "DUPLICAR". Guarda la dirección del "STA" en la pila y salta.

STA 2000H          ; Guarda el resultado final (10 / 0AH) en la celda de memoria 2000H
HLT

; ==================================================
; SUBRUTINA: DUPLICAR
; Duplica el valor del acumulador A (A = A + A)
; ==================================================
DUPLICAR:
    ADD A          ; Suma el acumulador a sí mismo: A = A + A
    RET            ; Extrae la dirección de retorno de la pila y vuelve al programa principal
```

---

## Capítulo 5: Desafío Avanzado - Operaciones de 16 Bits en un CPU de 8 Bits

¿Cómo puede una calculadora o procesador de 8 bits realizar operaciones matemáticas con números mayores a `255`? La respuesta es encadenando operaciones.

Para operar con 16 bits (valores hasta `65535`), dividimos el número en dos bytes: el **Byte Alto (High Byte)** y el **Byte Bajo (Low Byte)**, y los procesamos consecutivamente trasladando el acarreo (*Carry*) del byte bajo al alto.

### 5.1 Suma de 16 Bits usando Acarreo Encadenado
*   **Abstracción:** Sumaremos `1000` (03E8H) y `500` (01F4H) para obtener `1500` (05DCH).
    *   **Número 1:** `03E8H` ➔ Byte Alto: `03H`, Byte Bajo: `E8H`
    *   **Número 2:** `01F4H` ➔ Byte Alto: `01H`, Byte Bajo: `F4H`
*   **Lógica:**
    1. Sumamos los Bytes Bajos (`E8H + F4H = 1DCH`). El resultado del byte bajo es `DCH` y se genera un acarreo (`CY = 1`).
    2. Sumamos los Bytes Altos considerando el acarreo usando **`ADC`** (Suma con Acarreo): `03H + 01H + CY (1) = 05H`.
    3. El resultado final en 16 bits es `05DCH` (1500).

```assembly
; --- SUMA MANUAL DE 16 BITS CON CARREO ENCADENADO ---
ORG 0000H

; Carga el Número 1 (03E8H) en los registros B (alto) y C (bajo)
MVI B, 03H
MVI C, E8H

; Carga el Número 2 (01F4H) en los registros D (alto) y E (bajo)
MVI D, 01H
MVI E, F4H

; 1. Sumar los Bytes Bajos
MOV A, C           ; A = E8H
ADD E              ; A = E8H + F4H. Resultado en A = DCH, Carry CY se activa (CY = 1)
MOV L, A           ; Guarda el Byte Bajo del resultado final en el registro L

; 2. Sumar los Bytes Altos con Acarreo
MOV A, B           ; A = 03H
ADC D              ; A = 03H + 01H + CY (1) = 05H
MOV H, A           ; Guarda el Byte Alto del resultado final en el registro H

; En este punto, la pareja de registros HL contiene el resultado de 16 bits: 05DCH (1500)
SHLD 2000H         ; Almacena el par HL de forma automática en las celdas 2000H (L) y 2001H (H)
HLT
```

---

### 5.2 Suma de 16 Bits utilizando la Instrucción Nativa `DAD`
El procesador Intel 8080 incluye un registro de 16 bits virtualizado uniendo los registros `H` y `L` (`HL`), y provee una instrucción especial llamada **`DAD` (Double Add)** que suma directamente otra pareja de registros de 16 bits al par `HL` en un solo paso.

```assembly
; --- SUMA DE 16 BITS CON LA INSTRUCCIÓN NATIVA DAD ---
ORG 0000H

; Carga el Número 1 (03E8H) directamente en la pareja HL
LXI HL, 03E8H      ; HL = 03E8H (1000)

; Carga el Número 2 (01F4H) directamente en la pareja DE
LXI DE, 01F4H      ; DE = 01F4H (500)

DAD DE             ; HL = HL + DE. Suma automáticamente en 16 bits.
                   ; El par HL ahora contiene 05DCH (1500).

SHLD 2000H         ; Guarda el resultado en las posiciones 2000H y 2001H
HLT
```

---

## Capítulo 6: El Coprocesador de Punto Flotante

Hasta aquí todo lo que calculamos fueron **enteros**. Pero `3.14`, `-0.5` o `1e30` no caben en un registro de 8 bits, y emular sumas y divisiones decimales con instrucciones enteras costaría cientos de instrucciones por operación. La solución histórica fue añadir un segundo chip especializado: el **coprocesador de punto flotante** (en los PC de los años 80, el Intel 8087 acompañaba al 8086). Este simulador integra uno, de forma conceptual, al 8080.

### 6.1 ¿Cómo hablan el CPU y el coprocesador?

En un lenguaje de alto nivel escribirías `area = 3.1416 * r * r` y la máquina virtual se encargaría de todo. En hardware el reparto de tareas es explícito:

1. **Prefijo de escape.** El 8080 no tiene instrucciones flotantes. Se reserva el opcode `EDH` como `ESC`: cuando el CPU lo lee, sabe que la siguiente instrucción no es suya. El ensamblador genera ese prefijo automáticamente para todos los mnemónicos que empiezan por `F`.
2. **El CPU es el intermediario con la memoria.** Lee el opcode del coprocesador y, si hay un operando en memoria, calcula la dirección (2 bytes inmediatos, o el par `HL` cuando escribes `M`) y trae los 4 bytes del dato por el bus.
3. **La FPU trabaja en paralelo.** Cada operación tarda un número de ciclos (suma 4, división 10, raíz 12, seno 20). Mientras tanto activa su línea `BUSY` y el CPU **sigue ejecutando instrucciones enteras**.
4. **Sincronización.** Si el CPU llega a otro `ESC` mientras `BUSY` está activa, se detiene (`WAIT`) hasta que la FPU termine. La instrucción `FWAIT` provoca esa espera a propósito.

Observa el diagrama "Bus CPU ↔ FPU" del panel del coprocesador mientras ejecutas paso a paso: verás viajar la instrucción, los datos y la señal de espera.

### 6.2 Números reales en 32 bits: IEEE 754

Un float ocupa 4 bytes y se descompone en tres campos: **signo** (1 bit), **exponente** (8 bits, con sesgo 127) y **mantisa** (23 bits, con un `1.` implícito). El valor es `(−1)^S × 1.M × 2^(E − 127)`. Por ejemplo `-6.25` = `C0C80000H`: signo 1, exponente 129 (→ 2²), mantisa 1.5625.

La directiva `DF` escribe esos 4 bytes en memoria (en orden little-endian, como las direcciones del 8080). Escribe cualquier número en la casilla "Probar valor" del panel IEEE 754 para ver sus bits.

```assembly
DATOS: DF 3.5, -6.25, 1e30    ; tres floats consecutivos (12 bytes)
ENTERO: DW 1000               ; entero de 16 bits (2 bytes)
RESULT: DS 4                  ; reserva 4 bytes vacíos
```

### 6.3 La pila de registros

La FPU no tiene registros con nombre propio como `A` o `B`, sino una **pila de 8 registros**. `ST(0)` es siempre la cima, `ST(1)` el siguiente, etc. Cargar un valor (`FLD`) lo apila; guardar con `FSTP` lo desapila. Las operaciones sin operando combinan `ST(1)` con `ST(0)`, desapilan ambos y apilan el resultado: exactamente la notación polaca inversa de una calculadora HP.

```assembly
; --- SUMA DE DOS NÚMEROS REALES ---
ORG 0000H
    FLD X        ; ST(0) = 3.5
    FLD Y        ; ST(0) = 2.25, ST(1) = 3.5
    FADD         ; ST(0) = 3.5 + 2.25 = 5.75 (la pila baja a 1 elemento)
    FSTP RES     ; escribe 5.75 en RES (4 bytes) y desapila
    FWAIT        ; espera a que la FPU termine de escribir
    HLT

ORG 2000H
X:   DF 3.5
Y:   DF 2.25
RES: DS 4
```

Ejecuta paso a paso y observa la pila del coprocesador: `TOP` baja de 0 a 7 y 6 con cada `FLD` (la pila crece hacia abajo, como la del CPU) y vuelve a subir con `FADD` y `FSTP`. Usa "Ver float en: 2008" para interpretar los 4 bytes del resultado.

### 6.4 Mezclar enteros y reales

Los registros del CPU siguen siendo enteros. `FILD` convierte un entero de 16 bits (en memoria o en un par `BC`/`DE`/`HL`) a float; `FIST` hace el camino inverso redondeando según el modo de la palabra de control.

```assembly
; --- CELSIUS A FAHRENHEIT: F = C × 1.8 + 32 ---
ORG 0000H
    LXI HL, 37       ; 37 °C como entero
    FILD HL          ; ST(0) = 37.0
    FMUL FACTOR      ; ST(0) = 66.6     (operando directamente desde memoria)
    FADD OFFSET      ; ST(0) = 98.6
    FST FAHR         ; guarda el float (sin desapilar)
    FISTP BC         ; BC = 99 (redondeado) y desapila
    FWAIT
    HLT

ORG 2000H
FACTOR: DF 1.8
OFFSET: DF 32.0
FAHR:   DS 4
```

### 6.5 Recorrer un arreglo de floats

Un float mide 4 bytes, así que el puntero avanza de 4 en 4. `FADD M` suma el float apuntado por `HL`.

```assembly
; --- PROMEDIO DE 4 VALORES ---
ORG 0000H
    LXI HL, DATOS    ; puntero al primer float
    LXI DE, 4        ; tamaño de un float
    MVI C, 4         ; contador
    FLDZ             ; acumulador ST(0) = 0.0
BUCLE:
    FADD M           ; ST(0) += [HL]
    DAD DE           ; HL += 4
    DCR C
    JNZ BUCLE
    FILD CANT        ; apila 4.0
    FDIV             ; ST(0) = suma / 4
    FSTP PROM
    FWAIT
    HLT

ORG 2000H
DATOS: DF 1.5, 2.5, 3.5, 4.5
CANT:  DW 4
PROM:  DS 4
```

### 6.6 Condicionales con números reales

El CPU no puede leer las banderas de la FPU directamente: hay que copiar la palabra de estado al acumulador con `FSTSW`. `C3` (igual) queda en el bit 6 y `C0` (menor) en el bit 0, así que se prueban con `ANI` como cualquier bandera.

```assembly
; --- if (X < Y) A = 1; else if (X == Y) A = 2; else A = 0 ---
ORG 0000H
    FLD Y
    FLD X            ; ST(0) = X, ST(1) = Y
    FCOM             ; compara ST(0) con ST(1)
    FSTSW            ; A = códigos de condición
    ANI 41H          ; conserva C3 (bit 6) y C0 (bit 0)
    CPI 40H
    JZ IGUALES
    ANI 01H
    JNZ MENOR
    MVI A, 0
    JMP FIN
MENOR:   MVI A, 1
         JMP FIN
IGUALES: MVI A, 2
FIN:     STA RESULT
         HLT

ORG 2000H
X:      DF 2.5
Y:      DF 7.0
RESULT: DS 1
```

### 6.7 El riesgo de datos: por qué existe `FWAIT`

Este es el concepto más importante del capítulo. Como la FPU trabaja en paralelo, el CPU puede **leer un resultado antes de que exista**:

```assembly
ORG 0000H
    FLD X
    FLD Y
    FMUL           ; 6 ciclos de latencia
    FSTP RES       ; la FPU escribirá RES cuando termine
    LDA RES        ; ¡Riesgo! RES todavía vale 00 → A = 00
    MOV B, A
    FWAIT          ; ahora sí esperamos a la FPU
    LDA RES        ; A = C3H (byte bajo de 3.14)
    HLT

ORG 2000H
X:   DF 1.0
Y:   DF 3.14
RES: DS 4
```

Ejecútalo y compara `B` (valor viejo) con `A` (valor correcto). Después desactiva la casilla "Simular latencia" y repite: sin latencia ambos coinciden. Es exactamente el problema que resolvían los programadores del 8087 y que hoy resuelven las unidades de control de los procesadores modernos.

### 6.8 Excepciones: cuando la matemática falla

Dividir entre cero, sacar la raíz de un negativo o multiplicar dos números enormes no detiene al programa: la FPU registra una **excepción** en su palabra de estado y entrega un valor por defecto.

| Excepción | Cuándo | Resultado |
|---|---|---|
| `ZE` | `x ÷ 0` con `x ≠ 0` | `±Inf` |
| `IE` | `√(−4)`, `0 ÷ 0`, comparar con `NaN`, pila vacía o llena | `NaN` |
| `OE` | resultado mayor que `3.4 × 10³⁸` | `±Inf` |
| `UE` | resultado demasiado pequeño | `0` o subnormal |
| `PE` | el resultado tuvo que redondearse (`1 ÷ 3`) | valor redondeado |
| `SF` | desbordamiento o subdesbordamiento de la pila | `NaN` |

Carga el ejemplo 7 del menú y observa cómo se encienden los LEDs. `FCLEX` los apaga y `FINIT` reinicia el coprocesador por completo.

### 6.9 Modos de redondeo

`FLDCW n` fija el modo de redondeo de la palabra de control: `0` al más cercano (empates al par), `1` hacia −∞ (piso), `2` hacia +∞ (techo), `3` truncar. Afecta a cada resultado y a las conversiones a entero:

```assembly
    FLD X          ; 2.5
    FLDCW 0
    FIST R0        ; 2  (empate → par)
    FLDCW 2
    FIST R1        ; 3  (techo)
    FLDCW 3
    FISTP R2       ; 2  (truncar)
```

### 6.10 ¿Y si no hubiera coprocesador?

Desmarca "Coprocesador conectado al bus" y ejecuta cualquier ejemplo: el CPU consume los bytes de cada `ESC`, pero nadie los atiende y los resultados quedan en cero. Así se comportaba un PC sin 8087: el software debía detectar la ausencia del chip y recurrir a rutinas de emulación cientos de veces más lentas.

---

¡Felicidades! Has completado el recorrido completo por el funcionamiento interno del microprocesador y de su coprocesador. Ahora tienes la capacidad intelectual y práctica de diseñar programas de gran rendimiento, depurar flujos paso a paso y, lo más importante, comprender exactamente cómo interactúa el software de alto nivel con el hardware subyacente.

**¡Es hora de experimentar en el simulador!**
