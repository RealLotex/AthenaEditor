# Revisión de producto y UX — 2 de octubre de 2026

Esta intervención aplica la guía adjunta completa: revisión A–J en su orden, los nueve
apartados de salida y trazabilidad de sus 24 principios. Parte del editor existente, que
ya incluía bienvenida, recuperación, guardado portable, plantillas, controles avanzados y
exportación de varios niveles. El trabajo de hoy corrige decisiones e interacciones que
seguían haciendo difícil el camino habitual; esas capacidades anteriores no se presentan
como novedades de esta intervención.

## 1. Lo que el usuario realmente quiere

Crear una escena jugable de PlayStation 2, modificarla viendo el resultado, probarla y
conservar un proyecto que pueda seguir editando y llevar a la consola.

## 2. Qué estaba mal

El primer proyecto proponía una escena vacía y una elección de plantilla antes de dar un
resultado útil. La acción de añadir objetos abría comandos de toda la aplicación. Las
acciones de proyecto estaban repartidas entre escena, menús y estado, y se perdían al
trabajar en otras herramientas. Los controles de transformación seguían visibles sin nada
que transformar. WORLD y los colores de todos los componentes competían con el contenido.

Había fricción funcional además de ruido visual: un filtro de propiedades podía continuar
activo al seleccionar un objeto pequeño, aunque desapareciera el campo para limpiarlo.
Los encabezados de selección múltiple parecían plegables pero no se plegaban, había dos
acciones para añadir componentes y se mostraban valores del primer objeto sin indicar
que los demás tenían valores diferentes. Exportar ocultaba el código pero mantenía Copy
en su pie, sin una explicación clara del resultado principal.

La confirmación de reemplazo también hacía cancelar, guardar y repetir la operación.
Ahora ofrece Save and continue dentro de la misma decisión y conserva el diálogo si el
guardado se cancela o falla.

La revisión se realizó primero en el orden A–J exigido por el paso 22:

| Paso | Diagnóstico concreto y decisión |
| --- | --- |
| A. Intención | Trabajar sobre un juego que pueda probarse, sin administrar primero carpetas y opciones del editor. |
| B. Camino esencial | Create project → nombre → escena jugable → editar → Run game → Save o Export. |
| C. Fricción | La elección inicial, el catálogo de comandos al añadir y el filtro invisible obligaban a detenerse. Default jugable, selector contextual y filtro ligado a la selección. |
| D. Complejidad expuesta | WORLD, metadatos de archivos, detalles del emulador, código y formato de pantalla aparecían antes de ser útiles. Se traducen o se revelan a pedido. |
| E. Decisiones innecesarias | No hace falta elegir entre cinco comienzos, escoger carpetas ni preparar un reproductor para empezar. Third-person game es el default; las alternativas siguen disponibles. |
| F. Jerarquía | Create project domina el inicio; la escena domina el editor; Run game es la acción de proyecto destacada y permanece visible durante el trabajo. |
| G. Eliminación | Se retiran acciones duplicadas de barras, badge WORLD, conteos avanzados y párrafos redundantes de ejecución. |
| H. Consolidación | Save, Export y Run viven juntos en la cabecera; Add component queda una vez; el comienzo alternativo y los detalles del archivo usan una sola revelación. |
| I. Revelación progresiva | Transformaciones sólo con selección; Change starting point, Scene options, Advanced, File details y Code and export details cuando se necesitan. |
| J. Experiencia final | Dar nombre, recibir una escena lista para modificar, seleccionar y manipular, ejecutar, guardar y descargar un juego con diagnósticos visibles si está bloqueado. |

La evaluación siguió los tres niveles del paso 19: primero el valor de llegar a una escena
jugable; después el modelo de empezar con algo editable y actuar sobre ello; finalmente
la distribución, los estados, el texto y la tipografía. Una capa visual por sí sola no
habría corregido el inicio vacío ni las propiedades ocultas.

## 3. Qué debe desaparecer

Estas eliminaciones están aplicadas a la experiencia habitual:

- La obligación de elegir una plantilla: se muestra el comienzo elegido y cambiarlo es
  opcional.
- El catálogo de comandos de toda la aplicación al pulsar Add object o añadir un HUD.
- Move, Rotate, Scale, ajuste de referencia y grid snap cuando no hay selección.
- Run y Export duplicados en la barra de escena; Save duplicado en el estado inferior.
- El badge WORLD permanente, el símbolo de marca de la cabecera y el contador de objetos
  cuando no hay selección.
- Los botones de plegar paneles junto a cada pestaña; esa opción sigue en su menú contextual.
- El catálogo completo al abrir Add object: siete objetos habituales primero, More objects
  para el resto y búsqueda que incluye todas las opciones.
- El segundo botón de añadir componentes en selección múltiple y sus controles de
  plegado sin efecto.
- Los metadatos y la vista previa de código que desplazaban la acción útil de un recurso.
- Copy junto a Download game folder cuando el código ni siquiera está abierto.
- Los párrafos que prometían ejecutar con un clic y explicaban la preparación interna de
  la carpeta antes de pedir las rutas realmente necesarias.
- La secuencia cancelar → guardar → volver a abrir al reemplazar trabajo sin guardar.
- La lista de Set start por cada escena, la doble revelación de carpetas y los defaults de
  cámara que no afectaban a la cámara seleccionada.

Se conserva el acceso completo a las herramientas especializadas, los parámetros
avanzados y las distribuciones alternativas. Su presencia permanente no es necesaria
para que el usuario pueda usarlos.

## 4. Qué decide el sistema automáticamente

- **Comienzo útil:** Third-person game y My Game; la plantilla existente incorpora
  personaje, suelo, comportamiento y recursos. Blank scene sigue disponible bajo Change
  starting point.
- **Distribución al crear:** Focus, con escena central, Objects/Assets a la izquierda y
  Properties a la derecha. La creación restablece también las ventanas de paneles.
- **Contexto de añadir:** Add object filtra a objetos; añadir HUD filtra a elementos HUD.
  Se muestran siete objetos habituales y la búsqueda encuentra también los especializados.
  Ctrl+K conserva el catálogo general de comandos.
- **Contexto de edición:** Move es la herramienta inicial; la selección determina cuándo
  aparecen sus controles y el objetivo de Focus selection/Show whole scene.
- **Propiedades encontrables:** cambiar de selección limpia el filtro; un filtro sin
  control visible no se aplica; buscar una propiedad revela sus ajustes avanzados y un
  error abre la sección afectada.
- **Selección múltiple honesta:** las propiedades diferentes se identifican como mixed y
  los componentes compartidos no se ofrecen otra vez al añadir. Cambiar un eje conserva
  los otros ejes de cada objeto, en lugar de copiar los del primero.
- **Continuidad:** se conserva la recuperación automática del trabajo anterior y se
  distingue la copia del navegador del archivo guardado.
- **Escena pertinente:** si hay una cámara, Edit camera lleva a sus propiedades; los
  valores de fallback quedan aparte. El color de fondo queda secundario con un cielo
  activo y Scene exits no aparece hasta que haya otras escenas o salidas que revisar.
- **Configuración de proyecto:** Start scene aparece como una elección sólo si hay varias
  escenas. Las carpetas necesitan una sola revelación; los controles de hardware se abren
  si están personalizados o explican un estado inválido.

El editor ya infería las carpetas estándar, incluía recursos en Save, preparaba Run con
la instalación local y validaba las escenas al exportar. Esas decisiones se conservan.
La instalación del emulador y del reproductor sigue siendo necesaria para Run; si falta,
se muestra la información que el usuario debe aportar en ese momento.

## 5. Nuevo modelo de interacción

1. **Create project.** El nombre recibe foco y selecciona el texto inicial. Enter o Create
   project crea el juego. Change starting point permite optar por otro estilo o una escena
   en blanco; no se piden carpetas ni reproductores.
2. **Modificar la escena.** Seleccionar un objeto en la escena o en Objects; mover, rotar
   o escalarlo allí mismo, o editar sus Properties. Add object abre sólo opciones de
   objetos. Los cambios siguen el historial de deshacer existente.
3. **Run game.** La acción permanece en la cabecera también al editar HUD, scripts o
   terrain. Preparing… y Stop game comunican su estado. Si falta configuración, se piden
   PCSX2 y el console player; el requisito de BIOS/HostFS está junto a esas rutas.
4. **Save.** La misma acción de cabecera conserva un archivo portable. El estado inferior
   informa Backed up in this browser o Saved con el nombre del archivo; no necesita otro
   botón para guardar.
5. **Export… → Download game folder.** El diálogo muestra nombre del juego, escenas,
   recursos y si está listo. Si hay errores, indica cuántos deben corregirse y cada
   diagnóstico lleva al elemento afectado. El código y Copy aparecen al abrir sus detalles.

Las tareas poco frecuentes están en los menús o en Ctrl+K. Reemplazar un proyecto con
cambios ofrece Save and continue, Discard changes y Cancel. Si se cancela o falla el
guardado, se conserva la decisión pendiente; cancelar conserva el trabajo y el historial.

## 6. Diseño de pantallas

| Pantalla | Primary | Secondary | Advanced/contextual |
| --- | --- | --- | --- |
| Bienvenida | Create project | Open project…; recientes cuando existen | Sin configuración inicial |
| Crear | Nombre y Create project | Resumen del comienzo elegido; Cancel | Change starting point con alternativas y Blank scene |
| Edición | La escena; Run game en cabecera | Objects/Assets, Properties, Add object, Save y Export | Transformaciones con selección; Scene options; paneles y distribución |
| Propiedades | Nombre y propiedades del objeto seleccionado | Add component; indicación de errores y valores mixed | Object options, Advanced y búsqueda si el objeto tiene muchas propiedades |
| Recurso | Imagen/nombre y Add to scene, Edit script o Texture tools | Errores del archivo | File details y Preview script |
| Cielo y escena | Resultado visible junto al editor de la escena | Miniaturas, color y nombre de escena | Cámara, física y transiciones según contexto |
| Ejecutar con configuración pendiente | Rutas que faltan y Run game | Cancel; estado de comprobación | Cambiar rutas si ya estaba listo; requisito de BIOS/HostFS junto a ellas |
| Exportar | Estado del juego; Download game folder o errores que lo bloquean | Nombre, escenas/recursos y Share cuando el navegador lo permite | Code and export details, Copy y datos técnicos |

La escala tipográfica se contiene y el espacio organiza el contenido. El acento principal
se reserva para la siguiente acción; las secciones y los menús ceden atención a la escena.
Los controles muestran selección y foco, las entradas tienen nombres accesibles y los
diálogos mantienen Escape, foco inicial y restauración del foco en el recorrido revisado. La creación en curso
impide iniciar otra creación o cerrar un diálogo que aún está sustituyendo el proyecto.

## 7. Ejemplos de copy

| Contexto | Texto implementado |
| --- | --- |
| Inicio | Create a PlayStation 2 game. |
| Crear | Create project · Project name |
| Default | Third-person game |
| Decisión opcional | Change starting point · Blank scene |
| Añadir | Add object · Find an object… |
| Transformar | Move · Rotate · Scale |
| Encuadrar | Focus selection · Show whole scene |
| Escena | Scene options · Edit sky and scene… |
| Propiedades | Select an object in the scene. · Add component |
| Selección múltiple | Changes apply to all selected objects. · mixed |
| Archivo | File details · Preview script |
| Cámara | Edit camera · Fallback camera |
| Escenas | Start scene · Scene exits · Add exit to… |
| Proyecto | Save · Export… · Run game · Stop game |
| Reemplazar trabajo | Save and continue · Discard changes · Cancel |
| Recuperación | Backed up in this browser |
| Preparar Run | Checking PCSX2… · Run game |
| Exportar listo | Your game is ready · Download game folder |
| Exportar bloqueado | Fix 1 error to export · Fix the errors above, then export again. |
| Detalles de exportación | Code and export details · Copy main.js |

Las etiquetas describen intención o resultado. “Componente” se conserva donde corresponde
a la tarea de un editor de juegos; las opciones de añadir incluyen propósitos como
Custom behavior, Light the scene o Collisions and movement.

## 8. Antes → Después

**Antes:** Create project → nombre → interpretar cinco plantillas → aceptar Empty →
encontrar cómo añadir → filtrar comandos de toda la aplicación → construir algo que
probar → localizar Run en la escena.

**Después:** Create project → nombre → Create project → editar una escena jugable →
Run game. Cambiar el comienzo añade un paso sólo si el usuario lo desea.

**Antes:** seleccionar objeto complejo → filtrar → seleccionar objeto sencillo → filtro
desaparece → las propiedades continúan ocultas.

**Después:** seleccionar otro objeto → filtro limpio → propiedades del nuevo objeto.

**Antes:** editar HUD o scripts → buscar dónde volver para Run/Export → volver a la escena
→ ejecutar o exportar; Save también aparecía como acción inferior.

**Después:** editar cualquier herramienta → Save, Export… o Run game en la misma cabecera.

**Antes:** Export → resumen breve y Copy main.js al mismo nivel de trabajo que descargar,
aunque el código estuviera cerrado.

**Después:** Export… → estado y contenido del juego → Download game folder. Para examinar
o copiar código: Code and export details.

## 9. Última pasada de eliminación

Después del rediseño se volvió a preguntar qué podía retirarse sin impedir el resultado.
La segunda pasada movió Copy dentro de sus detalles, eliminó párrafos redundantes de Run,
dejó una sola acción para añadir componentes a varias selecciones y retiró conteos de
Advanced que convertían la revelación en un catálogo. También retiró los botones de plegar
de las pestañas y limitó el primer selector a los siete objetos habituales. Las transformaciones y los badges
de referencia/snap se mantienen sólo donde la selección hace útil su información.

Se conservaron nombre, elección alternativa de comienzo, selección, transformación,
Run, Save, diagnósticos y confirmación de reemplazo. Cada uno corresponde a una intención
real o protege el trabajo; su eliminación dañaría el camino esencial.

La reducción busca acortar el camino al primer resultado útil. No se atribuyen a esta
intervención mediciones de tiempo de usuarios ni nuevas pruebas de hardware. Las pruebas
y comprobaciones efectivamente realizadas se registran por separado en
[PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md).

### Trazabilidad de los 24 principios

| Principio | Aplicación específica |
| --- | --- |
| 1. Simplicidad, no minimalismo | La escena jugable aparece automáticamente; el filtro invisible se corrige, en vez de decorar una lista vacía. |
| 2. Jerarquía | Create project domina el inicio y Run game la cabecera; Download game folder domina Export. |
| 3. Quitar antes de agregar | Se retiran acciones duplicadas, WORLD, conteos avanzados y metadatos permanentes antes de ajustar las superficies. |
| 4. Experiencia ideal primero | Se define nombre → escena útil → editar → probar; las plantillas y paneles existentes sirven a ese recorrido. |
| 5. Revelación progresiva | Change starting point, selección, Scene options, File details y Code and export details limitan lo visible al contexto. |
| 6. Defaults como decisiones | Third-person game, My Game, Move y Focus crean una primera experiencia concreta. |
| 7. Conceptos humanos | Add object, Run game, Saved, Relative to object y File details reemplazan lectura de maquinaria. |
| 8. Interacción natural | Nombre + Enter, selección del objeto y edición inmediata; añadir abre aquello que se quiere añadir. |
| 9. Atención | Las acciones comunes están en una sola cabecera; el estado inferior informa y los indicadores aparecen sólo si importan. |
| 10. Manipulación directa | Gizmos e inputs editan la selección; el cielo se evalúa junto a la escena y los errores revelan su destino. |
| 11. Reducir modos | La selección determina las herramientas; modo activo y referencias no predeterminadas se indican, y Run permanece accesible entre herramientas. |
| 12. No reparar con documentación | El primer resultado surge de crear; el selector contextual y las propiedades encontrables evitan un tour o explicación de arquitectura. |
| 13. Recorrido completo | Se revisan conjuntamente inicio, primer cambio, ejecución, guardado, continuidad y exportación. |
| 14. Detalles perceptibles | Foco inicial, Enter/IME, busy, cancelación, búsqueda, secciones plegables y valores mixed atienden fallos concretos. |
| 15. Tipografía y jerarquía visual | Escala contenida, textos breves, espacios y controles legibles sostienen la escena y la acción principal. |
| 16. Evitar dashboard | Una escena con dos apoyos laterales; no se agregan tarjetas, widgets ni indicadores para representar capacidades. |
| 17. Visibilidad útil | Código, rutas, metadatos, parámetros y herramientas completas se muestran al solicitarlos o necesitar corregirlos. |
| 18. Cuestionar la premisa | Se elimina la elección obligatoria de plantilla y el catálogo general al añadir; se consolida la barra de proyecto. |
| 19. Producto → interacción → interfaz | Resultado jugable, recorrido de edición directa y finalmente distribución/copy; explicado en el apartado 2. |
| 20. Software con opinión | El primer proyecto propone un juego en tercera persona; otros comienzos siguen disponibles con un paso adicional. |
| 21. Calidad emocional | Continuidad del trabajo, resultado inicial útil, feedback breve, estados visibles y recuperación reducen incertidumbre. |
| 22. Revisión A–J | Los diez pasos aparecen en orden en el apartado 2 y desembocan en el recorrido del apartado 5. |
| 23. Crítica concreta | Los apartados 2–4 identifican qué desaparece, se automatiza, se consolida y pasa a ser contextual. |
| 24. Formato y pasada final | Están presentes los nueve apartados requeridos; este apartado documenta otra pasada efectiva de eliminación. |

Las implementaciones principales se encuentran en `src/panels/newproject.jsx`,
`src/panels/menubar.jsx`, `src/panels/scenetools.jsx`, `src/panels/statusbar.jsx`,
`src/panels/inspector.jsx`, `src/panels/inspector-components.jsx`,
`src/panels/inspector-scene.jsx`, `src/panels/export.jsx`, `src/panels/play.jsx`,
`src/ui/modal.jsx`, `src/ui/palette.jsx`, `src/viewport/viewport.jsx`, `src/app.jsx`
y `src/styles.css`.
