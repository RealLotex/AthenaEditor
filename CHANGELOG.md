# Changelog — septiembre y octubre de 2026

Estado al 12 de octubre. Este registro describe lo implementado; las propuestas del roadmap quedan fuera.

El historial no contiene commits fechados en septiembre. Ese trabajo está documentado en [la verificación de septiembre](docs/VERIFICATION.md) y se consolidó en el commit `6a0b59e`, del 1 de octubre. Las fechas siguientes distinguen ese registro del trabajo de octubre.

## Septiembre

- **Sombras y transforms coherentes.** Preview y exportación comparten matrices de mundo y el orden de transformaciones del motor. Se eliminaron las compensaciones antiguas de ángulo, zoom y UV. Los gizmos rotan alrededor de los ejes mostrados y los helpers dejan de aplicar dos veces la transformación del padre.
- **Jerarquías y selección.** Los padres ocultos impiden seleccionar sus hijos. Se pueden seleccionar objetos vacíos; duplicar, pegar e instanciar prefabs conserva la ubicación, genera nombres propios y repara referencias internas.
- **Undo, guardado y escenas.** Un arrastre genera un paso de undo. Renombrar casters y luces actualiza sus sombras; eliminar escenas repara la escena inicial y las transiciones. Guardar una captura anterior del proyecto no marca como guardadas las ediciones posteriores.
- **Materiales, HUD y diagnóstico.** El visor respeta el culling y el toggle de texturas. La exportación del HUD usa el directorio de fuentes configurado y el rango de opacidad de PS2. Las sombras por raycast sin collider muestran un error antes de generar código inválido.

La revisión de ese período registró **344 pruebas aprobadas** y ejecución de los cuatro controladores en PCSX2.

## Octubre

### Flujo de trabajo y ejecución — 1 y 2 de octubre

- Editor centrado en crear un juego: plantillas jugables, objetos comunes visibles, importación y colocación directa de modelos, herramientas contextuales y un layout compacto.
- Guardado portable, Save As, carpetas vinculadas y protección de cambios al reemplazar proyectos. Exportación ZIP de todas las escenas, scripts y assets, con una escena inicial explícita.
- Launcher local, instalación como app y ejecución en PCSX2. Correcciones de CT16S, portapapeles del HUD, profundidad de skybox y restauración de Gouraud después de las sombras.
- Menor costo de CPU de las cinco plantillas: reducciones medidas de **14,4% a 75,4%** en PCSX2, según la plantilla. [Mediciones y alcance](docs/TEMPLATE-PERFORMANCE.md).

### Eventos, cinemáticas y organización — 8 y 9 de octubre

- **Eventos de colisión y overlap al entrar y salir**, con generación opcional y presets visibles: Play Cinematic, Play Sound Oneshot, Change Scene, Destroy Object y Play Animation.
- **Eventos generales y cadenas de acciones:** inicio de escena, timer, salida de escena y eventos personalizados; condiciones por objeto/variables, esperas y acciones como mover una puerta o activar comportamientos.
- **Timeline / Cinemáticas:** canales y clips para diálogos, ventanas, retratos, voces/SFX, cámaras, transforms, animaciones, visibilidad y partículas. Arrastre y duración de clips, escritura de diálogo dentro del clip, keyframes, curvas, fades, transiciones de cámara, mezcla de animaciones compatibles y biblioteca de secuencias.
- **Game independiente**, con preview, pausa, reinicio y scrubbing. La reproducción de cinemáticas en el juego pausa los sistemas de gameplay y física.
- Cabecera con proyecto y escena; selector para cambiar o crear escenas y botón **+** junto a Scene/Game. Paneles separados de World, Lighting, Events, Terrain, Assets, Prefabs y UV.
- Thumbnails, búsqueda y filtros de assets, carpetas, reimportación y referencias de uso. Variantes de prefab con overrides.
- Sombras que siguen plataformas y receptores elevados. Drape activado por defecto y exclusión del caster y los triggers como receptores.
- Terreno redondeado y pintura con mezcla horneada; agua animada, caustics, partículas con pools fijos, flipbooks, niebla, reflejos simulados y colores de vértice.
- Controles de skybox para bits, tamaño, hemisferio y filtrado. **Problems** calcula presión de VRAM y distingue streaming de una textura que no cabe junto a las superficies bloqueadas.

### Calidad, optimización y estabilidad — 10 de octubre

- **Agua configurable:** seis controles independientes de tamaño, transparencia, patrón, panning, olas y caustics; Linear/Nearest y estimaciones de costo, geometría, VRAM y caché. Ultra low usa una textura estática de 32², agua opaca y un plano de dos triángulos, sin los efectos recortados.
- Tres optimizaciones siguen funcionando con todo al máximo:

  | Optimización | Ahorro medido por frame |
  | --- | ---: |
  | Copias cacheadas de posiciones | 4,331 ms |
  | Copias cacheadas de UV | 12,197 ms |
  | Caustics horneados en receptores estáticos | 3,681 ms |

  Las tres juntas ahorraron **20,209 ms** en el experimento. Son tiempos de CPU del callback en PCSX2 con la escena de prueba, no una promesa para cualquier juego ni una medición de PS2 física. [Experimento reproducible](docs/PRODUCTION-VERIFICATION.md).

- Recuperados los **diez panoramas estilizados originales de single_image, de 1774 × 887**. Se pospuso la reconstrucción de mayor resolución. La conversión usa el original y avisa cuando ampliar no agrega detalle; elimina sólo tiles generados sin referencias.
- **Controles del editor:** hotkeys y gestos de cámara configurables, presets, sensibilidad, suavizado y umbral de arrastre. Arrastrar deja de cambiar la selección; los bindings repetidos se rechazan.
- **Selectores de color más fluidos:** previews agrupados cada 50 ms, valor final garantizado y un paso de undo. Preparar una edición en el proyecto probado bajó de 29,77 a 5,22 ms de mediana; esa cifra no incluye el render del navegador.
- Menor trabajo de los visores inactivos, buffers de render limitados y recuperación de contexto gráfico. Carousel de paneles y cambio de idioma ES/EN/PT en vivo.
- Quince mejoras adicionales de autoría: navegación del árbol, selección consistente, herramientas de reset, encuadre, teclado y snapping del Timeline, búsqueda en Problems y renombrado seguro de variables. [Detalle](docs/EDITOR-AUDIT.md).
- Corregido el crash al iniciar el proyecto suministrado: el runtime alteraba un array literal largo de colores horneados. La exportación ahora lo carga con JSON; el proyecto alcanzó el frame 1200 en PCSX2.
- Corregido **GameViewport leyendo `requestId` de un request nulo** al no haber una secuencia pendiente.
- **Fondos al quitar el hemisferio inferior:** color sólido, gradiente, gradiente con niebla de altura ajustable sobre el horizonte y espejo. Los primeros usan colores de vértice; espejo reutiliza los tiles. Ninguno agrega VRAM de texturas. La niebla queda seleccionada por defecto.
- Cinco videos individuales del editor: [cinemáticas, eventos, agua, terreno y controles/entornos](docs/media/README.md).

## Verificación y límites actuales

La build final pasa **695 pruebas, sin fallos**. Los cuatro fondos de cielo completaron 60 frames cada uno en PCSX2, verificando geometría, colores, formatos y filtrado. Las demos muestran el navegador; Game no ejecuta los scripts de gameplay ni ODE. Las pruebas nativas se realizan por separado.

Sigue pendiente el problema de recarga de la escena costera en el runtime incluido. Tampoco se verificó hardware PS2 físico ni equivalencia exacta de píxeles entre navegador y consola. Ver [alcance completo](docs/PRODUCTION-VERIFICATION.md).

### Ajuste previo a publicar — 11 de octubre

El fondo con niebla desactiva PABE durante su dibujo para que la opacidad parcial se mezcle correctamente en PS2; después restaura la configuración del proyecto. Los cuatro probes nativos volvieron a completar 60 frames cada uno y se agregó una regresión para proteger la mezcla y la restauración de estado.

La build que se publica pasa **696 pruebas, sin fallos**.

### Fluidez del editor, partículas y tours — 12 de octubre

- Terreno: preparación de geometría/OBJ en un worker y agrupación de muestras de pincel. El trabajo deja de bloquear el hilo de interacción durante la primera escultura.
- Caustics del editor: receptores estáticos cacheados con BVH, invalidación al editar y proyección distribuida entre frames. En tres pruebas, el costo CPU estable bajó de 19,85–21,48 ms a 0,0137–0,0176 ms por actualización; no incluye GPU/presentación.
- Agua: frecuencia visible de 5 a 60 Hz, límites independientes por calidad y nuevas ondas suaves. Se conserva la velocidad del loop al recortar cuadros y se respetan texturas editadas.
- Skybox: resolución del panorama, tamaño de tiles nativos y resolución original diferenciados. Lighting tiene un acceso directo al Sun de la escena.
- Timeline: todos los parámetros del clip visibles en Properties. Los diálogos mantienen un borrador local, confirman una sola edición y muestran varias líneas con altura, scroll y contador.
- Partículas: las 20 familias solicitadas, siete formas de emisión, Local/World, valores iniciales aleatorios, bursts, curvas, rotación, colisiones, subemisores, flipbook, Billboard/Mesh, material y orden de transparencia.
- HUD: animación de posición/tamaño y vínculos con variables de gameplay para texto, vida y visibilidad.
- Ocho tours guiados con **191 pasos** y plantillas .atheditor portables. Inicio automático la primera vez, biblioteca en Ayuda, controles resaltados y avance al completar acciones. **Anterior** reemplaza Saltar; Siguiente prepara las acciones necesarias. Al terminar, cerrar la guía permite seguir editando la práctica.
- Verificación: **707 pruebas aprobadas** y probes en PCSX2 para el juego de Eventos, los 11 canales de cinemáticas, HUD y partículas. [Resultados y límites](docs/PRODUCTION-VERIFICATION.md).
