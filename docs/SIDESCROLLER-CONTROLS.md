# Side Scroller: movimiento con inercia

El controlador predeterminado combina carrera progresiva, derrapes, rodada, impulso
cargado, salto variable, embestida de hombro y golpe de caída. Es una base inspirada
en Pizza Tower, Sonic clásico y Wario Land, ajustable para el futuro personaje.

## Controles

| Acción | Mando PlayStation | Mando Xbox con el mapeo habitual |
|---|---|---|
| Moverse | Stick izquierdo o cruceta | Stick izquierdo o cruceta |
| Saltar | ✕; mantener para mayor altura | A; mantener para mayor altura |
| Carrera progresiva | Mantener R1 y una dirección | Mantener RB y una dirección |
| Rodar | ↓ mientras avanzás | ↓ mientras avanzás |
| Cargar impulso | ↓ + ✕ estando quieto; mantener ↓ para cargar más | ↓ + A estando quieto |
| Lanzar el impulso | Soltar ↓ | Soltar ↓ |
| Embestida de hombro | □; también en el aire, una vez por salto | X |
| Golpe de caída | Pulsar ↓ en el aire, o ↓ + □ | Pulsar ↓ en el aire, o ↓ + X |
| Salir de la rodada | ↑ o perder velocidad | ↑ o perder velocidad |

La carga también aumenta con pulsaciones adicionales de salto. Saltar desde una
rodada conserva el impulso. Cambiar de dirección frena antes de invertir el avance.
Soltar la carrera reduce la velocidad gradualmente; en el aire conservás el impulso.
El salto acepta una pulsación hasta 0,10 s después de salir de un borde o hasta
0,12 s antes de aterrizar. El golpe de caída tiene una recuperación de 0,10 s.

## Ajustes

`init(ctx)` define `ctx.player.tuning`. Las velocidades predeterminadas son 5 para
moverse normalmente y 9, 12 y 16 para las etapas de carrera. La carga puede impulsar
hasta 17. El salto parte de `ctx.player.jumpSpeed = 6.5` y mantiene la gravedad
de la plantilla en 9,81; soltar el botón recorta el ascenso y la caída recibe
gravedad adicional. La cámara anticipa el avance hasta 2,5 unidades.

## Preparación para el modelo y las animaciones

El controlador publica estos datos en `ctx.player`:

| Campo | Uso |
|---|---|
| `motion` | `idle`, `walk`, `run`, `sprint`, `mach`, `skid`, `crouch`, `roll`, `charge`, `dash`, `jump`, `fall`, `slam` o `land` |
| `speedTier` | 0 quieto, 1 movimiento normal, 2 carrera, 3 carrera rápida, 4 velocidad máxima |
| `vx`, `vy`, `facing`, `grounded` | Velocidad, orientación y apoyo |
| `charge` | Intensidad del impulso cargado |
| `events` | Pulsos de un frame: `jump`, `land`, `dash`, `launch`, `slamLand` |

Todavía usa el modelo provisional, ahora con normales suaves sin agregar triángulos.
El collider es una esfera de radio 0,5 y masa 5, con rotación congelada y profundidad
fija. Genera un contacto con el suelo y atraviesa mejor los bordes de plataformas.
Conserva altura 1; su ancho es 1, frente al 0,6 de la caja anterior. La rodada y el
agachado conservan este collider; la integración del personaje podrá ajustar sus dimensiones y sus
clips. Las embestidas publican estados para integrar después daño y objetos rompibles.
Las pendientes aportan impulso a la rodada cuando la física informa una normal de
apoyo inclinada. Los loops y el movimiento sobre techos requieren otro sistema de
colisión y no forman parte de este controlador.

## Proyecto existente

Los proyectos nuevos incluyen este controlador automáticamente. Los proyectos ya
creados conservan su copia del script: reemplazá el contenido de
`SideScrollerController.js` en el editor por el archivo
[`SideScrollerController.js`](../examples/controllers/SideScrollerController.js),
o copiá ese archivo a la carpeta de scripts de tu proyecto. Después volvé a ejecutar
el juego. La fuente de la plantilla está en `src/templates/sidescroller.js`.
Para recibir también el ahorro físico de la nueva plantilla, cambiar el Rigidbody
del jugador a esfera, radio 0,5 y masa 5, manteniendo Freeze Rotation y eventos de
colisión. El script es compatible con la caja anterior. Ver las
[mediciones y ajustes de las cinco plantillas](TEMPLATE-PERFORMANCE.md).
