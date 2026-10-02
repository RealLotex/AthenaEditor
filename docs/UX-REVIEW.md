# Revisión de producto y UX — 1 de octubre de 2026

Esta revisión sigue los 24 pasos de la guía adjunta. El resultado está implementado en
el editor. La interfaz mantiene el inglés existente y la ayuda conserva sus traducciones.

## 1. Lo que el usuario realmente quiere

Crear una escena jugable de PlayStation 2, probarla y llevarse un proyecto que pueda abrir,
seguir editando y ejecutar.

## 2. Qué estaba mal

El producto empezaba mostrando su organización interna antes de conocer la intención del
usuario. HUD, código, configuración y bibliotecas competían por espacio. Se confundía
recuperación automática con guardado a un archivo. La exportación parecía exitosa aunque
faltaran archivos o escenas. El cielo combinaba controles con lenguaje publicitario y su
panel sustituía la escena que el usuario quería observar.

La revisión A–J se realizó en el orden pedido:

| Paso | Hallazgo y decisión |
| --- | --- |
| A. Intención | Componer y probar un juego, no administrar un entorno. |
| B. Camino esencial | Crear → editar la escena → Run → Save/Export. |
| C. Fricción | Pestañas iniciales excesivas; guardar/exportar exigía entender qué archivos existían. Inicio explícito y guardado portable. |
| D. Complejidad expuesta | Estados de vínculo, build, filtros y solver visibles sin necesidad. Fuera del estado habitual o dentro de Advanced. |
| E. Decisiones innecesarias | La plantilla incluye archivos y carpetas estándar; no se elige destino antes de crear. El launcher busca el reproductor y el emulador. |
| F. Jerarquía | Create domina el inicio; la escena domina la edición; Run es la acción principal de su barra. |
| G. Eliminación | Eslogan del cielo, descripción emocional duplicada, catálogo de componentes del estado y advertencia duplicada de New. |
| H. Consolidación | Objects/Assets comparten espacio; Save incluye recursos; toda sustitución de proyecto usa la misma protección de cambios. |
| I. Revelación progresiva | Código de exportación, opciones de objeto, solver, filtrado y parámetros de cuerpos se abren a pedido. |
| J. Experiencia completa | Crear, manipular una escena, probar, guardar un archivo portable y exportar todos los niveles con comprobaciones previas. |

## 3. Qué debe desaparecer

- Todas las capacidades visibles desde el primer uso.
- El eslogan «UN MUNDO, OTRO CIELO.» y el texto de ambientación redundante.
- Elegir carpetas o el reproductor como requisito para crear una escena.
- Contadores técnicos permanentes que no indican una acción necesaria.
- Explicaciones extensas bajo cada propiedad ordinaria.
- Una exportación aparentemente exitosa con scripts vacíos o dependencias ausentes.
- La segunda advertencia de cambios sin guardar dentro de New: queda la protección común
  en el momento de reemplazar el proyecto.

La primera pantalla no muestra menús de edición, paneles vacíos ni opciones avanzadas.

## 4. Qué decide el sistema automáticamente

- Un proyecto nuevo empieza en Focus: escena central, objetos/recursos a la izquierda,
  propiedades a la derecha.
- Las plantillas aportan los archivos necesarios. Empty permite empezar sin gameplay.
- Las carpetas de exportación usan valores estándar; personalizarlas es secundario.
- Save incorpora los recursos disponibles. Las copias de archivos importados permiten abrir
  sin carpeta; al refrescar la carpeta, sus archivos actuales prevalecen.
- Export arranca en la escena inicial y genera nombres distintos para niveles homónimos.
  Run arranca en la escena abierta para iterar rápidamente.
- El cambio de escena se encola para el siguiente frame.
- Todas las escenas se comprueban. Destinos inválidos, archivos faltantes, nombres ambiguos
  o glTF externo requieren corrección antes de descargar/escribir el juego.
- Los panoramas válidos se adaptan a 512 × 256.
- Los ajustes de escena aparecen junto al viewport, sin reemplazarlo.
- Las preferencias existentes se respetan. Restablecer vuelve a Focus.

## 5. Nuevo modelo de interacción

1. **Create project**: nombre y plantilla; Enter crea. **Open project…** es la alternativa.
2. Seleccionar el objeto en la escena o en Objects. Moverlo con el gizmo o editar Properties.
   El resultado se ve inmediatamente y cada gesto se puede deshacer.
3. **Run** prueba la escena abierta. La preparación es automática cuando hay una instalación
   local; la configuración aparece únicamente si falta algo.
4. **Save changes…** escribe un proyecto portable. **Browser backup** informa recuperación
   sin insinuar que ya existe un archivo guardado.
5. **Export** muestra escenas y archivos incluidos. Los errores llevan a la escena/objeto
   afectado. Si pasa, **Download game folder** entrega los archivos del juego.

Las tareas especializadas se abren desde Tools/View o Ctrl+K. Sustituir un proyecto con
cambios requiere una decisión explícita; Cancel conserva el proyecto y su historial.

## 6. Diseño de pantallas

| Pantalla | Primary | Secondary | Advanced/contextual |
| --- | --- | --- | --- |
| Inicio | Create project | Open project; recientes si existen | Ninguno |
| Crear | Nombre y Create project | Plantilla, Cancel | Sin carpetas ni reproductores |
| Editar | Escena central y Run | Objects/Assets, Properties, transformación, Save | View options, opciones de objeto, componentes avanzados, otros paneles |
| Cielo | Escena visible y miniaturas a su derecha | Import panorama, rotación, brillo | Defaults de cámara, Physics y Transitions cerrados |
| Exportar | Download game folder o errores que impiden continuar | Resumen del contenido | Code and export details, Copy, memoria |
| Herramientas | El objeto de trabajo: HUD, UV, terrain o script | Controles de esa tarea | Parámetros específicos y configuración del editor |

Move/Rotate/Scale tienen selección visible y accesible. Las propiedades tienen nombres
accesibles, incluidos los ejes. Los encabezados plegables son botones de teclado. Los diálogos
atrapan el foco, Escape cierra y restauran el foco al salir. Se respeta movimiento reducido.
Exportar deshabilitado muestra la razón y la acción de recuperación.

## 7. Ejemplos de copy

| Lugar | Texto implementado |
| --- | --- |
| Inicio | Create a PlayStation 2 game. |
| Acción principal | Create project |
| Propiedades vacías | Select an object to edit it. |
| Fondos | Sky · Import panorama… · Background color |
| Imagen inválida | Choose a 360° panorama with a 2:1 ratio, such as 2048 × 1024. |
| Archivo faltante | “filename” is missing. Import the file before exporting. |
| Guardado | Save changes… · Saved to file · Browser backup |
| Exportación bloqueada | Fix the errors above, then export again. |
| Resultado | Download game folder |

Clear, Cloudy, Sunset y Night describen el resultado visual. No prometen una experiencia
emocional ni explican cómo está implementado el cielo.

## 8. Antes → Después

**Antes:** abrir → interpretar paneles → decidir carpeta/configuración → crear → importar
recursos faltantes → editar → distinguir qué se guardó → copiar código y reconstruir el juego.

**Después:** Create project → nombre/plantilla → editar y Run → Save → Download game folder.

**Antes:** cielo → eslogan/descripción → cambiar de pantalla → elegir → volver para comprobar.

**Después:** Sky → elegir una miniatura junto a la escena → observar el resultado.

**Antes:** exportar la escena activa → niveles enlazados sin programa → juego incompleto.

**Después:** exportar desde el inicio → todos los niveles y dependencias → errores previos a
escribir o descargar.

## 9. Última pasada de eliminación

Se retiró la advertencia duplicada de New, la descripción bajo el cielo, el texto largo de
escena inicial y la configuración técnica cotidiana. Physics queda cerrado hasta necesitarlo.
El código no ocupa Export hasta abrir sus detalles. Las estadísticas técnicas no ocupan el
estado inferior.

Se mantuvieron nombre, plantilla, selección, transformación, Run, Save y errores: quitarlos
perjudicaría la tarea. La confirmación de reemplazo protege trabajo real. El nombre del
emulador y los límites de textura aparecen donde cambian lo que el usuario puede hacer.

## Trazabilidad de los 24 pasos

| Paso | Aplicación comprobable |
| --- | --- |
| 1. Simplicidad | Camino habitual sin carpetas; recursos incluidos por Save y plantillas. |
| 2. Jerarquía | Create principal al inicio y Run destacado durante edición. |
| 3. Quitar antes de agregar | Paneles especializados fuera del inicio; retiro de slogans/badges. |
| 4. Experiencia ideal primero | Crear/editar/probar/guardar definido antes de ajustar paneles y generador. |
| 5. Revelación progresiva | Advanced, opciones de objeto y Code and export details cerrados. |
| 6. Defaults | Focus, plantillas autosuficientes, carpetas y descubrimiento local del emulador. |
| 7. Conceptos humanos | Objects, Properties, Sky, Save changes y Browser backup. |
| 8. Interacción natural | Nombre + Enter; selección y transformación; clic en problema revela destino. |
| 9. Atención | Escena dominante, estado reducido y explicación breve de errores. |
| 10. Manipulación directa | Gizmos, propiedades inmediatas, cielo junto al viewport; undo por gesto. |
| 11. Modos | Transformación activa visible; selector de escena sólo cuando hay varias. |
| 12. Documentación | Crear/probar/exportar sin leer una explicación de arquitectura. |
| 13. Recorrido completo | Inicio, edición, ejecución, guardado, recuperación y exportación revisados juntos. |
| 14. Detalles | Accesibilidad, teclado, Escape/foco, busy/disabled, cancelación y tamaños. |
| 15. Tipografía | Encabezados en sentence case, escala contenida, contraste y separación por espacio. |
| 16. Evitar dashboard | Workspace de escena y dos soportes laterales, sin widgets/estadísticas/CTA adicionales. |
| 17. Visibilidad útil | HUD/UV/scripts/solver aparecen por tarea. |
| 18. Cuestionar premisa | Sin destino al crear ni reconstrucción manual copiando archivos. |
| 19. Producto/interacción/interfaz | Fiabilidad de datos, luego recorrido, luego tamaños/estados/copy. |
| 20. Opinión | Se prioriza iterar una escena jugable; otras distribuciones son secundarias. |
| 21. Calidad emocional | Inicio tranquilo, escena despejada, feedback breve y recuperación. |
| 22. Revisión A–J | Tabla en sección 2; recorrido final en sección 5. |
| 23. Crítica concreta | Eliminación, automatización, consolidación y controles contextuales explícitos. |
| 24. Formato y pasada final | Nueve secciones solicitadas y segunda simplificación implementada. |

Las capturas y pruebas están en [PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md).
