# Plantillas: optimizaciones y mediciones — 2026-10-02

Las cinco plantillas se compararon contra `af1d0c088f76c81505328bb69db15a990c346a17`.
Se ejecutaron los juegos generados con el mismo ELF oficial de AthenaEnv y el mismo
PCSX2 2.6.3, usando Vulkan, resolución interna 3x, NTSC 640×448, VSync y CT16S + Z16S.
El ELF tiene SHA-256 `a5c56a648ed4188d6bc9fd4c9090ad61a5f26c08603a30d94652eacf288fff84`;
su [referencia](../reference/AthenaEnvReleaseAndExamples/README.md) identifica la release.

## Resultados

Tiempo medio medido del callback por cuadro: lógica, física y envío de dibujo/HUD.
Cada valor es la mediana de tres ejecuciones de 600 cuadros, después de 120 de calentamiento.
La reducción se calcula sobre los valores sin redondear.

| Plantilla | Antes | Después | Menos tiempo | p95 antes → después |
| --- | ---: | ---: | ---: | ---: |
| Empty | 0,214 ms | 0,181 ms | 15,4% | 0,247 → 0,232 ms |
| First Person | 2,966 ms | 0,730 ms | 75,4% | 3,277 → 1,264 ms |
| Third Person | 0,938 ms | 0,804 ms | 14,4% | 1,217 → 1,044 ms |
| Side Scroller | 2,371 ms | 1,472 ms | 37,9% | 3,791 → 1,832 ms |
| Top Down | 0,944 ms | 0,749 ms | 20,6% | 1,087 → 0,846 ms |

El p95 caracteriza los cuadros más costosos: el 95% de los cuadros tarda como máximo
ese tiempo. Side Scroller reduce este valor un 51,7%.

Todas las ejecuciones mantienen **1.786.880 bytes de VRAM**: 1.720.320 estáticos y
66.560 dinámicos, aproximadamente 1,70 MiB. No se aumentaron los buffers ni se cambió
CT16S + Z16S. El intervalo entre cuadros se mantiene en aproximadamente 16,683 ms,
equivalente a **59,94 FPS con VSync**, antes y después. El ahorro aumenta el presupuesto
disponible para el juego; no implica multiplicar los FPS de estas escenas ya sincronizadas.

## Qué cambió en cada plantilla

- **Empty:** omite la actualización de cámara y tres cambios de estado de profundidad
  por cuadro cuando no hay modelos, sombras, cielo ni scripts. Los proyectos con scripts
  conservan la preparación 3D. El contador FPS conserva el dibujo continuo y actualiza
  su texto cada 15 cuadros; desactivarlo ahora elimina también su fuente y sus llamadas.
- **First Person:** cachea seno/coseno mientras la vista permanece estable, limita los
  extremos del stick y evita raíces cuadradas salvo en diagonales que requieren normalización.
  Las cajas visibles siguen midiendo un metro; sus colliders miden 0,98 m por lado,
  con un margen de 1 cm por cara que evita contactos estáticos entre cajas y suelo.
  La fase de física baja de **2,518 a 0,289 ms**. La lógica aislada sube de 0,245 a
  0,257 ms al incorporar validación del apoyo y tolerancias de salto; el resultado total
  sigue reduciéndose un 75,4%.
- **Third Person:** cachea la trigonometría de la cámara y la orientación deseada,
  reutiliza un objeto de rotación y deja de escribir matrices cuando el giro se estabiliza.
  Respeta cambios en los ángulos y distancia editables. El giro cruza ±π por el recorrido
  más corto, también con los números float32 particulares del ELF.
- **Side Scroller:** conserva carrera progresiva, derrapes, rodada, carga, salto variable,
  embestida y golpe de caída. Reutiliza la rotación, actualiza orientación sólo al cambiar
  de lado y evita escribir la cámara cuando su posición y distancia no cambian. El jugador
  usa una **esfera de radio 0,5 y masa 5**, con un contacto contra el suelo en vez de las
  cuatro esquinas de la caja anterior. Mantiene altura 1, rotación congelada y profundidad
  fija; su ancho de colisión pasa de 0,6 a 1 y las transiciones por bordes son más suaves.
- **Top Down:** conserva gravedad y colisiones físicas, pero omite eventos que el controlador
  no consume. Cachea la dirección deseada y evita matrices repetidas. Corrige el movimiento
  invertido: arriba en stick/cruceta ahora avanza hacia arriba en pantalla, sobre −Z.

First Person y Third Person incorporan 0,10 s de tolerancia después de un borde y
0,12 s de anticipación antes de aterrizar. Rechazan el techo como apoyo y una segunda
pulsación durante el ascenso. Sus pruebas en Athena verifican ambos saltos tolerantes,
los límites de cámara, velocidad diagonal y el giro por ±π.

El suelo de las cuatro plantillas jugables activa clipping preciso para sus triángulos grandes.
El personaje provisional conserva **50 triángulos**, con normales suaves en los laterales
y tapas con bordes duros; Gouraud produce un cuerpo más suave sin agregar geometría.

## Contactos y diagnósticos compartidos

La release devuelve IDs nativos en los callbacks ODE. La recuperación de identidad
mediante `geomCollide` ahora se activa sólo después de un paso que informó contactos.
Con varios pares, esferas envolventes conservadoras descartan pares lejanos; cada centro
se lee una vez por consulta desde el geom vivo, incluso si un script movió un objeto estático.
Meshes y rayos de extensión desconocida conservan su consulta. Con un solo par, no se
agregan lecturas de centros. El solver y su broad phase siguen ejecutándose una sola vez.

| Consultas de recuperación durante 600 cuadros | Antes | Después |
| --- | ---: | ---: |
| First Person | 3.000 | 166 |
| Third Person | 600 | 328 |
| Side Scroller | 2.400 | 940 |
| Top Down | 600 | 0 |

FPS y estadísticas de depuración refrescan su texto cada 15 cuadros, aproximadamente
cuatro veces por segundo. Se dibujan cada cuadro, sin parpadeo; las métricas dejan de
consultarse y formatearse en cada pasada. El contador usa una ventana de 60 cuadros.

## Método, reproducción y límites

`Timer.getTime` mide microsegundos del reloj EE emulado, no el tiempo de CPU del host.
Se mide desde después de `pad.update` y la inyección del mando hasta el final del callback,
incluyendo la instrumentación fija de Timer y arrays. Se excluyen lectura del mando,
reinicio de posición, limpieza/presentación, espera VSync y finalización del trabajo del GS/GPU.
La suma de fases difiere ligeramente del total por la instrumentación entre marcas.
Los tiempos repetidos coinciden porque el reloj emulado es determinista.

El mismo ciclo de 300 cuadros contiene 60 en reposo, 90 hacia la derecha, 60 en diagonal,
60 de cámara y 30 en reposo; Cross se pulsa en 90 y 180. La posición del cuerpo se reinicia
al comenzar cada ciclo, fuera del intervalo medido. No se eliminen las nuevas tolerancias
de salto ni las diferencias de collider al interpretar la comparación: son los juegos
completos antes/después, no una prueba aislada de una sola función.

Los [datos de las 30 ejecuciones](verification/template-performance.json) incluyen UUID
individual, modos, fases, percentiles, VRAM y hashes de los programas optimizados.
Los valores `Screen.getFPS` de arranque usan ventanas distintas y se excluyen del informe;
el intervalo de Timer verifica la frecuencia efectiva. Estos resultados corresponden a
estas escenas en PCSX2; no certifican FPS en una PS2 real ni en escenas más grandes.

Con PCSX2 y HostFS configurados, ejecutar secuencialmente:

```sh
deno task benchmark-templates stage baseline af1d0c088f76c81505328bb69db15a990c346a17
deno task benchmark-templates stage optimized
deno task benchmark-templates run baseline 3
deno task benchmark-templates run optimized 3
deno task report-template-benchmark
deno run -A tools/verify-templates.js
deno run -A tools/verify-controller-quality.js
deno run -A tools/verify-momentum.js
deno task check
```

Los probes usan HostFS y detienen exclusivamente los procesos que crean. Los fixtures
de calidad pasan para los tres controladores correspondientes; la secuencia de inercia
pasa sus 1.030 cuadros. El build y **549 pruebas automatizadas** pasan.

## Aplicación a proyectos existentes

Los proyectos nuevos reciben todos los cambios. El generador aplica las optimizaciones
compartidas cuando se vuelve a exportar o ejecutar un proyecto existente. Sus scripts,
colliders y assets conservan las copias del usuario; reemplazarlos es una decisión del autor.
Hay copias exactas de los cuatro [controladores](../examples/controllers/) listas para importar.
`deno task controllers` las actualiza desde las fuentes embebidas y una prueba verifica
que no diverjan. Para reproducir todo el ahorro de First Person y Side Scroller en un
proyecto anterior, aplicar también los ajustes de collider descritos arriba. La desactivación
de eventos en Top Down corresponde al script predeterminado: conservarlos si otro script
los necesita.
