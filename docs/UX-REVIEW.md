# Revisión de producto y UX — 2 de octubre de 2026

Se aplica la guía adjunta completa: revisión A–J, nueve apartados de salida,
una pasada adicional de eliminación y trazabilidad de los 24 principios.
El punto de partida es `bdb36e2`: ya tenía bienvenida, plantillas jugables,
Focus, recuperación, guardado portable, propiedades contextuales y exportación.
Esta revisión conserva ese recorrido y corrige la fricción que seguía presente
en los recursos, la colocación de modelos, el teclado y la versión web.

## 1. Lo que el usuario realmente quiere

Crear un juego de PlayStation 2, modificar su escena viendo el resultado,
probarlo y conservarlo para seguir trabajando o llevarlo a la consola.

## 2. Qué estaba mal

La biblioteca obligaba a comprender carpetas antes de ver los recursos: “All
assets” podía parecer vacío si los archivos estaban dentro de subcarpetas. El
árbol, la ruta y la cuadrícula representaban varias veces la misma estructura.
Añadir un modelo creaba un objeto sin archivo; el usuario debía resolver esa
configuración después. Tampoco podía colocar un recurso arrastrándolo a la escena.

La interfaz ofrecía Run como acción principal incluso en la web, donde no había
conexión al reproductor local. El primer clic terminaba en un fallo de servicio
en lugar de una acción disponible. Guardar mediante una descarga comunicaba
“Saved”, aunque el navegador sólo había recibido una solicitud de descarga.

Los menús de opciones podían quedar abiertos al cambiar de tarea. Algunos
controles escondidos detrás de una sección cerrada seguían participando en la
navegación de teclado. Los controles de transformación podían quedar visibles
después de deshacer la creación del objeto seleccionado. En ventanas estrechas,
acciones invisibles consumían espacio y recortaban los nombres de los objetos.

La revisión siguió este orden, antes de ajustar el aspecto:

| Paso | Diagnóstico y decisión |
| --- | --- |
| A. Intención | Trabajar sobre un juego visible y editable, y obtener un resultado que pueda conservarse. |
| B. Camino esencial | Crear → editar la escena → probar localmente o exportar → guardar. |
| C. Fricción | Encontrar un archivo, crear un modelo vacío, asignarlo y colocarlo fragmentaba una sola intención. Se muestra la biblioteca completa y se coloca el modelo en una acción. |
| D. Complejidad expuesta | Carpetas duplicadas, bytes y una conexión local inexistente exigían comprender la implementación. Carpetas y detalles son opcionales; la acción principal corresponde al lugar donde se abrió el editor. |
| E. Decisiones innecesarias | El sistema puede elegir la vista completa, crear el componente correcto, poner el modelo sobre la superficie y seleccionar el resultado. |
| F. Jerarquía | La escena domina; Add object inicia la edición. Run game domina la instalación local; Export game… domina la web y el archivo independiente. |
| G. Eliminación | Se retiran el árbol duplicado, la ruta duplicada, búsquedas en listas pequeñas, accesos repetidos e indicadores de selección inexistente. |
| H. Consolidación | Importar y colocar se resuelve en Add a model. Las carpetas usan un único filtro opcional. Los menús temporales comparten un comportamiento de cierre y foco. |
| I. Revelación progresiva | Browse folders, búsquedas en listas grandes, opciones de escena, detalles de archivos y código aparecen al necesitarlos. |
| J. Experiencia final | Crear una escena jugable, elegir o arrastrar un modelo, editarlo inmediatamente, probar o exportar, y conservar una copia con un estado honesto. |

Se evaluaron los tres niveles del principio 19: **concepto**, dar forma a un
juego; **interacción**, actuar sobre objetos y recursos sin preparar objetos
incompletos; **interfaz**, escena central, biblioteca visible, propiedades de
la selección y una siguiente acción clara.

## 3. Qué debe desaparecer

- El árbol de carpetas y los breadcrumbs que duplicaban la biblioteca.
- La selección de una carpeta como requisito para encontrar recursos.
- El modelo vacío creado por la acción habitual Add model.
- El formulario posterior para asignar un archivo ya conocido.
- El botón Import duplicado en una biblioteca vacía.
- La búsqueda permanente cuando hay pocos objetos o recursos.
- El segundo acceso pequeño a Add object junto a esa búsqueda.
- Scene settings en el inspector vacío, duplicado de Scene options.
- Run settings en la web, donde esa configuración no puede usarse.
- Menús temporales que permanecían abiertos fuera de su tarea.
- Herramientas de transformación cuando la selección ya no existe.
- Espacio permanente para botones de fila que sólo se muestran al interactuar.

Los formatos de pantalla, las opciones de proyecto, las herramientas especializadas
y los parámetros de componentes siguen disponibles por menú o revelación. Sus
capacidades no necesitan ocupar la experiencia habitual.

## 4. Qué decide el sistema automáticamente

- **Inicio:** conserva Third-person game, nombre editable y Focus como recorrido
  inicial. Cambiar el comienzo sigue siendo opcional.
- **Biblioteca:** muestra todos los archivos, incluidos los de subcarpetas; una
  búsqueda encuentra archivos globalmente. Elegir un archivo no cambia
  innecesariamente el filtro de carpetas.
- **Modelo:** crea el objeto y su componente con el archivo elegido, selecciona
  el resultado y abre sus propiedades. Importar y colocar forman un paso de deshacer.
- **Colocación:** arrastrar calcula el punto sobre la superficie visible o el suelo;
  respeta el ajuste de cuadrícula activo y compensa la base conocida del modelo.
- **Contexto de ejecución:** identifica la instalación local y destaca Run allí.
  En la web destaca Export; intentar Run ofrece una salida útil hacia exportar.
- **Selección y foco:** deshacer un objeto retira sus herramientas; Escape vuelve
  al control que abrió el menú. El teclado ignora controles dentro de secciones cerradas.
- **Estado de guardado:** distingue archivo guardado, solicitud de descarga y copia
  de recuperación del navegador.

Las rutas personalizadas del emulador sólo se piden cuando hacen falta en la
instalación local. No se introduce una elección inicial de “modo web/local”.

## 5. Nuevo modelo de interacción

1. **Create project → nombre → Enter.** Aparece un juego editable.
2. **Editar.** Seleccionar y transformar; elegir un modelo en Add object o arrastrarlo
   desde Assets al punto deseado. Si falta el archivo, Import model… lo importa y coloca.
3. **Obtener el resultado.** Run game en la instalación local; Export game… en la web.
4. **Save.** Conservar el proyecto portable y continuar después.

Un modelo OBJ ilegible deja el selector abierto con el error y permite reintentar;
no crea un objeto incompleto. Cancelar el selector no modifica la escena. Una
importación que termina después de cambiar de proyecto o escena no se coloca en
el destino equivocado. El reemplazo de un proyecto conserva la protección existente
Save and continue / Discard changes / Cancel.

## 6. Diseño de pantallas

| Pantalla | Primary | Secondary | Advanced/contextual |
| --- | --- | --- | --- |
| Bienvenida | Create project | Open project… y recientes | Sin preparación técnica obligatoria |
| Crear | Nombre y Create project | Resumen del comienzo elegido, Cancel | Change starting point |
| Editor local | Escena; Run game en cabecera | Add object, Objects/Assets, Properties, Save, Export… | Transformaciones con selección; Scene options; otras herramientas por menú |
| Editor web/independiente | Escena; Export game… en cabecera | Add object, Objects/Assets, Properties, Save | Run en File/F5 con orientación contextual; otras herramientas por menú |
| Assets | Archivos con nombre, miniatura y tipo | Import assets…; acción del archivo seleccionado | Browse folders; búsqueda con más de ocho archivos; File details |
| Add a model | Modelos existentes o Import model… si no hay ninguno | Cancel; importar otro modelo | Búsqueda con más de ocho modelos; error de importación dentro del selector |
| Properties | Nombre y propiedades de la selección | Add component, errores y valores mixed | Object options, Advanced, búsqueda para objetos complejos |
| Run local | Run game; rutas pendientes si hacen falta | Cancel y estado de preparación | Cambiar rutas configuradas |
| Run desde web | Export game… | Close y cómo abrir la instalación local | Sin formulario de configuración que no se pueda aplicar |
| Exportar | Your game is ready y Download game folder, o errores accionables | Nombre y contenido del juego; Share si está disponible | Code and export details y Copy |

La tipografía y el espaciado priorizan nombres legibles. A 760 px, los controles
de transformación ocupan su propia línea y los ejes mantienen sus etiquetas.
Los botones de fila aparecen al pasar el puntero o entrar con teclado. Las pestañas
reducen su espacio interno en paneles estrechos. Los diálogos conservan foco inicial,
Escape y restauración; una importación activa no se duplica ni cierra a mitad de operación.

## 7. Ejemplos de copy

| Intención | Texto implementado |
| --- | --- |
| Empezar | Create project · Project name |
| Cambiar el comienzo | Change starting point |
| Añadir contenido | Add object · Add a model · Import model… |
| Explorar recursos | Assets · Browse folders · All assets |
| Colocar | Drop to place in the scene |
| Escena vacía | Choose Add object to start building. |
| Seleccionar | Select an object in the scene. |
| Probar localmente | Run game · Preparing… · Stop game |
| Probar desde web | Run on your computer · You can keep editing and export your game here. |
| Conservar | Save · Backed up in this browser · Download requested |
| Exportar | Your game is ready · Download game folder |
| Corregir exportación | Fix 1 error to export |

El texto describe acciones y resultados. Las carpetas y los bytes se mantienen
en los detalles, donde ayudan a una decisión concreta.

## 8. Antes → Después

**Encontrar un recurso:** Assets → interpretar árbol → elegir carpeta → encontrar
archivo. **Después:** Assets → archivo; filtrar carpetas es opcional.

**Añadir un modelo:** Add model → objeto sin archivo → buscar propiedad → elegir
archivo → colocar. **Después:** Add a model → elegir archivo → objeto listo;
o arrastrar el recurso directamente a su posición.

**Probar en la web:** Run → fallo de conexión local → averiguar qué hacer.
**Después:** Export game… → Your game is ready → Download game folder.
Run/F5 explica cómo abrir el editor local y permite exportar desde el mismo diálogo.

**Deshacer:** retirar el modelo → herramientas de una selección inexistente.
**Después:** retirar el modelo → escena sin controles de transformación innecesarios.

**Usar teclado:** entrar en un menú → foco en controles invisibles → perder el recorrido.
**Después:** flechas/Home/End recorren acciones visibles → Escape restaura el punto de partida.

## 9. Última pasada de eliminación

Tras implementar la interacción se hizo otra revisión sobre el editor real. Se
retiraron las búsquedas de listas pequeñas, el Add duplicado, el acceso redundante
a Scene settings y el Import duplicado en el estado vacío. También se eliminaron
la influencia de selecciones borradas y el espacio que reservaban botones invisibles;
la revisión a 760 px comprobó que los nombres y las pestañas volvían a ser legibles.

Se conserva lo que sirve a una intención: elegir un archivo existente, importar uno
nuevo, ver el resultado, deshacerlo, guardar, exportar y configurar una prueba local
cuando corresponde. El objetivo es acortar el camino al resultado; no se atribuyen
mediciones de tiempo ni estudios de usuarios a esta revisión.

### Trazabilidad de los 24 principios

| Principio | Aplicación concreta |
| --- | --- |
| 1. Simplicidad | Crear y colocar un modelo en una acción resuelve la complejidad dentro del producto. |
| 2. Jerarquía | La escena domina; Run local o Export web es la acción destacada según disponibilidad. |
| 3. Quitar antes de agregar | Árbol, ruta, búsquedas pequeñas y accesos duplicados se retiran antes del pulido visual. |
| 4. Experiencia ideal | Se parte de “quiero ese modelo allí”; después se conectan importación, selección, posicionamiento e historial. |
| 5. Revelación progresiva | Carpetas, búsqueda, metadatos, configuración local y código aparecen según intención o contexto. |
| 6. Defaults | Juego jugable, Focus, todos los recursos y colocación sobre una superficie reducen decisiones iniciales. |
| 7. Conceptos humanos | Add a model, Drop to place, Run on your computer y Download requested expresan acciones y estados concretos. |
| 8. Naturalidad | Elegir o arrastrar un archivo produce inmediatamente el objeto esperado. |
| 9. Atención | Menos controles permanentes; menús temporales se cierran al continuar otra tarea. |
| 10. Manipulación directa | Arrastrar modelos a la escena, transformarlos y deshacer en un paso. |
| 11. Menos modos | El lugar donde se abre el editor determina la acción; la selección real determina las herramientas. |
| 12. No reparar con documentación | La biblioteca y el selector funcionan sin explicar la estructura de carpetas o componentes. |
| 13. Recorrido completo | Inicio, recursos, edición, prueba/exportación, guardado, recuperación y cancelación se revisan juntos. |
| 14. Detalles | Error y reintento de importación, foco, Escape, flechas, selección después de undo, hover y tamaños estrechos. |
| 15. Tipografía | Nombres y tipos legibles; escala contenida y espaciado; pestañas adaptadas al ancho del panel. |
| 16. Evitar dashboard | La escena sigue siendo el espacio central con dos paneles de apoyo. |
| 17. Visibilidad útil | Las herramientas completas siguen disponibles sin convertir el editor en un catálogo permanente. |
| 18. Cuestionar premisas | No hace falta crear un modelo vacío ni recorrer carpetas antes de añadir un recurso. |
| 19. Producto → interacción → interfaz | Valor del juego, acción sobre el contenido y luego distribución visual; orden explicado en el apartado 2. |
| 20. Opinión | Inicio jugable y vista de todos los recursos; los recorridos especializados requieren un paso voluntario. |
| 21. Calidad emocional | Feedback inmediato, errores recuperables y estado de guardado honesto reducen incertidumbre. |
| 22. A–J | Los diez pasos se registran en orden en el apartado 2. |
| 23. Crítica específica | Los apartados 2–4 detallan qué desaparece, se automatiza, consolida y se vuelve contextual. |
| 24. Salida y eliminación final | Los nueve apartados están presentes; el apartado 9 documenta simplificaciones adicionales realizadas. |

La evidencia y los límites de las comprobaciones están en
[PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md). Las capturas muestran
el editor final, la biblioteca, una ventana estrecha y la exportación.
