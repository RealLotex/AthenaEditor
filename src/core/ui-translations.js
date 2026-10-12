// Editor-only phrases: never applied to project names, files, scripts or dialogue.
const EDITOR_TRANSLATIONS={
  "Dialogue text": ["Texto de diálogo", "Texto do diálogo"],
  "Guided tours…": ["Tours guiados…", "Visitas guiadas…"],
  "Panorama resolution": ["Resolución del panorama", "Resolução do panorama"],
  "Update frequency": ["Frecuencia de actualización", "Frequência de atualização"],
  "Gameplay binding": ["Vínculo con gameplay", "Vínculo com gameplay"],
  "Scene variable": ["Variable de escena", "Variável da cena"],
  "HUD animation": ["Animación de HUD", "Animação do HUD"],
  "lines": ["líneas", "linhas"],
  "1 line": ["1 línea", "1 linha"],
  "Editing": ["Editando", "Editando"],
  "Lower backdrop": ["Fondo inferior", "Fundo inferior"],
  "Lower sky backdrop": ["Fondo del hemisferio inferior", "Fundo do hemisfério inferior"],
  "Solid color": ["Color sólido", "Cor sólida"],
  "Gradient": ["Gradiente", "Gradiente"],
  "Foggy gradient": ["Gradiente con niebla", "Gradiente com neblina"],
  "Mirror": ["Espejo", "Espelho"],
  "Horizon color": ["Color del horizonte", "Cor do horizonte"],
  "Backdrop color": ["Color del fondo inferior", "Cor do fundo inferior"],
  "Fog height above horizon": ["Altura de niebla sobre el horizonte", "Altura da neblina sobre o horizonte"],
  "Backdrops use vertex colors; Mirror reuses the sky. No extra texture VRAM.": ["Los fondos usan colores de vértice; Espejo reutiliza el cielo. Sin VRAM extra de texturas.", "Os fundos usam cores de vértice; Espelho reutiliza o céu. Sem VRAM extra de texturas."],
  "File": [
    "Archivo",
    "Arquivo"
  ],
  "Edit": [
    "Editar",
    "Editar"
  ],
  "View": [
    "Vista",
    "Visualização"
  ],
  "Help": [
    "Ayuda",
    "Ajuda"
  ],
  "Tools": [
    "Herramientas",
    "Ferramentas"
  ],
  "Show": [
    "Mostrar",
    "Mostrar"
  ],
  "Close": [
    "Cerrar",
    "Fechar"
  ],
  "Play": [
    "Ejecutar",
    "Executar"
  ],
  "Pause": [
    "Pausar",
    "Pausar"
  ],
  "Preview": [
    "Vista previa",
    "Prévia"
  ],
  "High": [
    "Alta",
    "Alta"
  ],
  "Low": [
    "Baja",
    "Baixa"
  ],
  "Medium": [
    "Media",
    "Média"
  ],
  "Ultra": [
    "Ultra",
    "Ultra"
  ],
  "Brightness": [
    "Brillo",
    "Brilho"
  ],
  "Perspective": [
    "Perspectiva",
    "Perspectiva"
  ],
  "Orthographic": [
    "Ortográfica",
    "Ortográfica"
  ],
  "Wireframe": [
    "Alambre",
    "Aramado"
  ],
  "Lit": [
    "Iluminado",
    "Iluminado"
  ],
  "Unlit": [
    "Sin iluminación",
    "Sem iluminação"
  ],
  "Fit sequence": [
    "Encuadrar secuencia",
    "Enquadrar sequência"
  ],
  "Clear search": [
    "Limpiar búsqueda",
    "Limpar busca"
  ],
  "Search problems": [
    "Buscar problemas",
    "Buscar problemas"
  ],
  "Referenced in scene": [
    "Usados en esta escena",
    "Usados nesta cena"
  ],
  "Choose color": [
    "Elegir color",
    "Escolher cor"
  ],
  "Variable name": [
    "Nombre de variable",
    "Nome da variável"
  ],
  "Remove references first": [
    "Eliminá primero las referencias",
    "Remova primeiro as referências"
  ],
  "Reset component": [
    "Restablecer componente",
    "Restaurar componente"
  ],
  "Previous panels": [
    "Paneles anteriores",
    "Painéis anteriores"
  ],
  "Next panels": [
    "Paneles siguientes",
    "Próximos painéis"
  ],
  "+ Action": [
    "+ Acción",
    "+ Ação"
  ],
  "+ Channel": [
    "+ Canal",
    "+ Canal"
  ],
  "+ Condition": [
    "+ Condición",
    "+ Condição"
  ],
  "+ Event": [
    "+ Evento",
    "+ Evento"
  ],
  "+ Folder": [
    "+ Carpeta",
    "+ Pasta"
  ],
  "+ Keyframe": [
    "+ Fotograma clave",
    "+ Quadro-chave"
  ],
  "+ Sequence": [
    "+ Secuencia",
    "+ Sequência"
  ],
  "+ Variable": [
    "+ Variable",
    "+ Variável"
  ],
  "100° · Panoramic": [
    "100° · Panorámico",
    "100° · Panorâmico"
  ],
  "120° · Ultra wide": [
    "120° · Ultra amplio",
    "120° · Ultra amplo"
  ],
  "16-bit (half the VRAM)": [
    "16 bits (la mitad de VRAM)",
    "16 bits (metade da VRAM)"
  ],
  "16-bit colour and depth. The fastest option and the usual choice.": [
    "Color y profundidad de 16 bits. La opción habitual y más rápida.",
    "Cor e profundidade de 16 bits. A opção habitual e mais rápida."
  ],
  "256 (recommended)": [
    "256 (recomendado)",
    "256 (recomendado)"
  ],
  "32-bit colour. More bandwidth, less banding.": [
    "Color de 32 bits. Más ancho de banda, menos bandas de color.",
    "Cor de 32 bits. Mais largura de banda, menos faixas de cor."
  ],
  "4 bits": [
    "4 bits",
    "4 bits"
  ],
  "8 bits": [
    "8 bits",
    "8 bits"
  ],
  "60° · Standard": [
    "60° · Estándar",
    "60° · Padrão"
  ],
  "90° · Wide": [
    "90° · Amplio",
    "90° · Amplo"
  ],
  "A GLTF/GLB holding the animation set.": [
    "Un GLTF/GLB con el conjunto de animaciones.",
    "Um GLTF/GLB com o conjunto de animações."
  ],
  "A fixed pool: more particles cost more drawing time.": [
    "Un conjunto fijo: más partículas requieren más tiempo de dibujo.",
    "Um conjunto fixo: mais partículas exigem mais tempo de desenho."
  ],
  "A small shared image supplies the reflected sky. Environment can generate presets.": [
    "Una imagen pequeña compartida aporta el cielo reflejado. Entorno permite generar presets.",
    "Uma imagem pequena compartilhada fornece o céu refletido. Ambiente permite gerar predefinições."
  ],
  "A static image. Nearly free.": [
    "Una imagen estática. Costo casi nulo.",
    "Uma imagem estática. Custo quase nulo."
  ],
  "Accurate Clip": [
    "Recorte preciso",
    "Recorte preciso"
  ],
  "Action to add": [
    "Acción a agregar",
    "Ação a adicionar"
  ],
  "Active camera": [
    "Cámara activa",
    "Câmera ativa"
  ],
  "Add": [
    "Agregar",
    "Adicionar"
  ],
  "Add HUD element": [
    "Agregar elemento de HUD",
    "Adicionar elemento de HUD"
  ],
  "Add Object": [
    "Agregar objeto",
    "Adicionar objeto"
  ],
  "Add a model": [
    "Agregar un modelo",
    "Adicionar um modelo"
  ],
  "Add clip": [
    "Agregar clip",
    "Adicionar clipe"
  ],
  "Add component": [
    "Agregar componente",
    "Adicionar componente"
  ],
  "Add component to all": [
    "Agregar componente a todos",
    "Adicionar componente a todos"
  ],
  "Add exit to…": [
    "Agregar salida hacia…",
    "Adicionar saída para…"
  ],
  "Add models, images or scripts to your game.": [
    "Agregá modelos, imágenes o scripts al juego.",
    "Adicione modelos, imagens ou scripts ao jogo."
  ],
  "Add object": [
    "Agregar objeto",
    "Adicionar objeto"
  ],
  "Add one from the toolbar above.": [
    "Agregá uno desde la barra de herramientas.",
    "Adicione um pela barra de ferramentas."
  ],
  "Add to scene": [
    "Agregar a la escena",
    "Adicionar à cena"
  ],
  "Adds specular term": [
    "Agrega reflejo especular",
    "Adiciona reflexo especular"
  ],
  "Advanced": [
    "Avanzado",
    "Avançado"
  ],
  "Advanced options": [
    "Opciones avanzadas",
    "Opções avançadas"
  ],
  "All assets": [
    "Todos los recursos",
    "Todos os recursos"
  ],
  "All types": [
    "Todos los tipos",
    "Todos os tipos"
  ],
  "Alpha": [
    "Alfa",
    "Alfa"
  ],
  "Alpha 0..1": [
    "Alfa 0..1",
    "Alfa 0..1"
  ],
  "Alpha 0..255 (128 = opaque on PS2)": [
    "Alfa 0..255 (128 = opaco en PS2)",
    "Alfa 0..255 (128 = opaco no PS2)"
  ],
  "Also adds": [
    "También agrega",
    "Também adiciona"
  ],
  "Always": [
    "Siempre",
    "Sempre"
  ],
  "Ambient": [
    "Ambiente",
    "Ambiente"
  ],
  "Animate sprite sheet": [
    "Animar hoja de sprites",
    "Animar folha de sprites"
  ],
  "Animation": [
    "Animación",
    "Animação"
  ],
  "Animation File": [
    "Archivo de animación",
    "Arquivo de animação"
  ],
  "Animator": [
    "Animador",
    "Animador"
  ],
  "Any cinematic": [
    "Cualquier cinemática",
    "Qualquer cinemática"
  ],
  "Any collider": [
    "Cualquier collider",
    "Qualquer colisor"
  ],
  "Apply UVs": [
    "Aplicar UVs",
    "Aplicar UVs"
  ],
  "Apply to selected surfaces": [
    "Aplicar a superficies seleccionadas",
    "Aplicar às superfícies selecionadas"
  ],
  "Asset": [
    "Recurso",
    "Recurso"
  ],
  "Asset folders": [
    "Carpetas de recursos",
    "Pastas de recursos"
  ],
  "Asset library folder": [
    "Carpeta de biblioteca de recursos",
    "Pasta da biblioteca de recursos"
  ],
  "Assets": [
    "Recursos",
    "Recursos"
  ],
  "At scene start": [
    "Al iniciar la escena",
    "Ao iniciar a cena"
  ],
  "AthEditor will appear in your apps. Your projects and layout stay in the same browser profile.": [
    "AthEditor aparecerá entre tus aplicaciones. Los proyectos y el diseño quedan en el mismo perfil del navegador.",
    "AthEditor aparecerá nos seus aplicativos. Projetos e layout ficam no mesmo perfil do navegador."
  ],
  "Attach to": [
    "Adjuntar a",
    "Anexar a"
  ],
  "Audio": [
    "Audio",
    "Áudio"
  ],
  "Available to scripts": [
    "Disponible para scripts",
    "Disponível para scripts"
  ],
  "Back": [
    "Volver",
    "Voltar"
  ],
  "Backdrop": [
    "Fondo",
    "Fundo"
  ],
  "Background": [
    "Fondo",
    "Fundo"
  ],
  "Background color": [
    "Color de fondo",
    "Cor de fundo"
  ],
  "Bake Lighting…": [
    "Hornear iluminación…",
    "Pré-calcular iluminação…"
  ],
  "Bake Sun lighting into colors": [
    "Hornear iluminación del sol en colores",
    "Pré-calcular iluminação solar nas cores"
  ],
  "Bake scene lighting and shadows": [
    "Hornear iluminación y sombras",
    "Pré-calcular iluminação e sombras"
  ],
  "Baked lighting · restore from Tools": [
    "Iluminación horneada · restaurar desde Herramientas",
    "Iluminação pré-calculada · restaurar em Ferramentas"
  ],
  "Baking quality": [
    "Calidad del horneado",
    "Qualidade do pré-cálculo"
  ],
  "Balanced": [
    "Equilibrado",
    "Equilibrado"
  ],
  "Bar": [
    "Barra",
    "Barra"
  ],
  "Before scene ends": [
    "Antes de finalizar la escena",
    "Antes de finalizar a cena"
  ],
  "Behaviours enabled": [
    "Comportamientos activos",
    "Comportamentos ativos"
  ],
  "Behaviours enabled at start": [
    "Comportamientos activos al iniciar",
    "Comportamentos ativos ao iniciar"
  ],
  "Bias": [
    "Desplazamiento",
    "Deslocamento"
  ],
  "Blank scene": [
    "Escena vacía",
    "Cena vazia"
  ],
  "Blank uses the built-in font.": [
    "Vacío usa la fuente incorporada.",
    "Vazio usa a fonte incorporada."
  ],
  "Blend": [
    "Mezcla",
    "Mistura"
  ],
  "Blend terrain textures": [
    "Mezclar texturas del terreno",
    "Misturar texturas do terreno"
  ],
  "Blended terrain bit depth": [
    "Bits de textura mezclada del terreno",
    "Bits da textura misturada do terreno"
  ],
  "Blended terrain resolution": [
    "Resolución de textura mezclada del terreno",
    "Resolução da textura misturada do terreno"
  ],
  "Blob": [
    "Mancha",
    "Mancha"
  ],
  "Blob texture": [
    "Textura de mancha",
    "Textura da mancha"
  ],
  "Box": [
    "Caja",
    "Caixa"
  ],
  "Brightens — for light pools, not shadows": [
    "Aclara — para zonas de luz",
    "Clareia — para áreas de luz"
  ],
  "Brush": [
    "Pincel",
    "Pincel"
  ],
  "Brush strength": [
    "Fuerza del pincel",
    "Força do pincel"
  ],
  "Bubbles": [
    "Burbujas",
    "Bolhas"
  ],
  "Built-in": [
    "Incorporado",
    "Incorporado"
  ],
  "Camera": [
    "Cámara",
    "Câmera"
  ],
  "Camera navigation": [
    "Navegación de cámara",
    "Navegação da câmera"
  ],
  "Camera settings": [
    "Ajustes de cámara",
    "Configurações da câmera"
  ],
  "Camera shot": [
    "Plano de cámara",
    "Plano de câmera"
  ],
  "Cancel": [
    "Cancelar",
    "Cancelar"
  ],
  "Caster": [
    "Objeto que proyecta",
    "Objeto que projeta"
  ],
  "Caustic pattern": [
    "Patrón de cáusticas",
    "Padrão de cáusticas"
  ],
  "Caustic strength": [
    "Intensidad de cáusticas",
    "Intensidade das cáusticas"
  ],
  "Caustics follow static terrain and platforms. This depth sets their flat fallback.": [
    "Las cáusticas siguen terrenos y plataformas estáticos. Esta profundidad se usa si no hay superficie.",
    "As cáusticas seguem terrenos e plataformas estáticos. Esta profundidade é usada quando não há superfície."
  ],
  "Change Scene": [
    "Cambiar escena",
    "Mudar cena"
  ],
  "Change scene": [
    "Cambiar escena",
    "Mudar cena"
  ],
  "Change starting point": [
    "Cambiar punto de inicio",
    "Mudar ponto inicial"
  ],
  "Changes apply to all selected objects.": [
    "Los cambios se aplican a todos los objetos seleccionados.",
    "As alterações são aplicadas a todos os objetos selecionados."
  ],
  "Channel name": [
    "Nombre del canal",
    "Nome do canal"
  ],
  "Character animation": [
    "Animación de personaje",
    "Animação de personagem"
  ],
  "Checking PCSX2…": [
    "Comprobando PCSX2…",
    "Verificando PCSX2…"
  ],
  "Choose Add object to start building.": [
    "Elegí Agregar objeto para empezar.",
    "Escolha Adicionar objeto para começar."
  ],
  "Choose a model to place in your scene.": [
    "Elegí un modelo para colocar en la escena.",
    "Escolha um modelo para colocar na cena."
  ],
  "Choose a scene…": [
    "Elegir escena…",
    "Escolher cena…"
  ],
  "Choose a sequence…": [
    "Elegir secuencia…",
    "Escolher sequência…"
  ],
  "Choose animation…": [
    "Elegir animación…",
    "Escolher animação…"
  ],
  "Choose collider…": [
    "Elegir collider…",
    "Escolher colisor…"
  ],
  "Choose installed font…": [
    "Elegir fuente instalada…",
    "Escolher fonte instalada…"
  ],
  "Choose object…": [
    "Elegir objeto…",
    "Escolher objeto…"
  ],
  "Choose projection…": [
    "Elegir proyección…",
    "Escolher projeção…"
  ],
  "Choose script…": [
    "Elegir script…",
    "Escolher script…"
  ],
  "Choose terrain": [
    "Elegir terreno",
    "Escolher terreno"
  ],
  "Choose the console player file (athena.elf) once. It will be remembered for your next game.": [
    "Elegí una vez el ejecutable de consola (athena.elf). Se recordará para el próximo juego.",
    "Escolha uma vez o executável de console (athena.elf). Ele será lembrado para o próximo jogo."
  ],
  "Choose the objects this sequence will control in the current scene.": [
    "Elegí los objetos que controlará esta secuencia en la escena.",
    "Escolha os objetos que esta sequência controlará na cena."
  ],
  "Choose variable…": [
    "Elegir variable…",
    "Escolher variável…"
  ],
  "Cinematic finishes": [
    "Termina una cinemática",
    "Uma cinemática termina"
  ],
  "Click a shortcut, then press its keys. Esc cancels recording. Text editing keeps its own shortcuts.": [
    "Hacé clic en un atajo y presioná sus teclas. Esc cancela. Los campos de texto conservan sus propios atajos.",
    "Clique em um atalho e pressione suas teclas. Esc cancela. Os campos de texto mantêm seus próprios atalhos."
  ],
  "Click a triangle to select it. Shift-click adds to the selection. Transforms affect all UVs when nothing is selected.": [
    "Hacé clic en un triángulo para seleccionarlo. Shift-clic suma a la selección. Sin selección, las transformaciones afectan todos los UVs.",
    "Clique em um triângulo para selecioná-lo. Shift-clique amplia a seleção. Sem seleção, as transformações afetam todos os UVs."
  ],
  "Cliff level": [
    "Nivel del acantilado",
    "Nível do penhasco"
  ],
  "Cliff softness": [
    "Suavidad del acantilado",
    "Suavidade do penhasco"
  ],
  "Clips": [
    "Clips",
    "Clipes"
  ],
  "Close (Esc)": [
    "Cerrar (Esc)",
    "Fechar (Esc)"
  ],
  "Close dialog": [
    "Cerrar diálogo",
    "Fechar diálogo"
  ],
  "Close panel": [
    "Cerrar panel",
    "Fechar painel"
  ],
  "Coastal blue": [
    "Azul costero",
    "Azul costeiro"
  ],
  "Code and export details": [
    "Detalles de código y exportación",
    "Detalhes de código e exportação"
  ],
  "Collision — enter": [
    "Colisión — entrada",
    "Colisão — entrada"
  ],
  "Collision — exit": [
    "Colisión — salida",
    "Colisão — saída"
  ],
  "Color": [
    "Color",
    "Cor"
  ],
  "Color depth": [
    "Profundidad de color",
    "Profundidade de cor"
  ],
  "Color recesses, midtones and exposed surfaces across static objects. Contact shading is calculated when you apply it.": [
    "Coloreá cavidades, tonos medios y superficies expuestas de objetos estáticos. El sombreado de contacto se calcula al aplicarlo.",
    "Colore cavidades, tons médios e superfícies expostas de objetos estáticos. O sombreamento de contato é calculado ao aplicar."
  ],
  "Colors": [
    "Colores",
    "Cores"
  ],
  "Colour": [
    "Color",
    "Cor"
  ],
  "Colour PSM": [
    "Formato de color",
    "Formato de cor"
  ],
  "Colour and depth pixel formats. Set once per program.": [
    "Formatos de píxel para color y profundidad. Se fijan una vez por programa.",
    "Formatos de pixel para cor e profundidade. São definidos uma vez por programa."
  ],
  "Colour depth of the offscreen buffer. A shadow rarely needs 32.": [
    "Profundidad de color del búfer auxiliar. Una sombra rara vez necesita 32 bits.",
    "Profundidade de cor do buffer auxiliar. Uma sombra raramente precisa de 32 bits."
  ],
  "Colours": [
    "Colores",
    "Cores"
  ],
  "Columns": [
    "Columnas",
    "Colunas"
  ],
  "Combine textures into an atlas": [
    "Combinar texturas en un atlas",
    "Combinar texturas em um atlas"
  ],
  "Comparison": [
    "Comparación",
    "Comparação"
  ],
  "Component guides": [
    "Guías de componentes",
    "Guias de componentes"
  ],
  "Condition to add": [
    "Condición a agregar",
    "Condição a adicionar"
  ],
  "Conditions and actions": [
    "Condiciones y acciones",
    "Condições e ações"
  ],
  "Conditions are checked when the event arrives. A running chain ignores repeated triggers. Enable / disable behaviours controls scripts and dynamic body simulation; visibility has its own action.": [
    "Las condiciones se comprueban al recibir el evento. Una cadena en curso ignora disparos repetidos. Activar comportamientos controla scripts y cuerpos dinámicos; la visibilidad tiene su propia acción.",
    "As condições são verificadas ao receber o evento. Uma cadeia em andamento ignora disparos repetidos. Ativar comportamentos controla scripts e corpos dinâmicos; a visibilidade tem sua própria ação."
  ],
  "Console default": [
    "Predeterminado de consola",
    "Padrão do console"
  ],
  "Console player": [
    "Ejecutable de consola",
    "Executável de console"
  ],
  "Constraint force mixing — larger values make contacts softer.": [
    "Mezcla de fuerza de restricciones: valores altos suavizan los contactos.",
    "Mistura de força de restrições: valores altos suavizam os contatos."
  ],
  "Contact radius": [
    "Radio de contacto",
    "Raio de contato"
  ],
  "Content": [
    "Contenido",
    "Conteúdo"
  ],
  "Controls": [
    "Controles",
    "Controles"
  ],
  "Copy": [
    "Copiar",
    "Copiar"
  ],
  "Copy scene capture": [
    "Copiar captura de escena",
    "Copiar captura da cena"
  ],
  "Create a PlayStation 2 game.": [
    "Creá un juego de PlayStation 2.",
    "Crie um jogo de PlayStation 2."
  ],
  "Create a project": [
    "Crear un proyecto",
    "Criar um projeto"
  ],
  "Create a script to start writing game behaviour.": [
    "Creá un script para programar comportamientos del juego.",
    "Crie um script para programar comportamentos do jogo."
  ],
  "Create a sequence in the Timeline panel to preview it here.": [
    "Creá una secuencia en Timeline para verla acá.",
    "Crie uma sequência em Timeline para vê-la aqui."
  ],
  "Create a sequence, choose its start event, then add channels and clips.": [
    "Creá una secuencia, elegí su evento de inicio y agregá canales y clips.",
    "Crie uma sequência, escolha seu evento inicial e adicione canais e clipes."
  ],
  "Create folder": [
    "Crear carpeta",
    "Criar pasta"
  ],
  "Create project": [
    "Crear proyecto",
    "Criar projeto"
  ],
  "Create script": [
    "Crear script",
    "Criar script"
  ],
  "Create terrain": [
    "Crear terreno",
    "Criar terreno"
  ],
  "Crisp pixels — good for pixel-art textures": [
    "Píxeles nítidos — ideal para pixel art",
    "Pixels nítidos — ideal para pixel art"
  ],
  "Crossing ripples deform the pattern. Wave speed also controls the 3D pattern evolution.": [
    "Las ondas cruzadas deforman el patrón. La velocidad de olas también controla su evolución en 3D.",
    "As ondas cruzadas deformam o padrão. A velocidade das ondas também controla sua evolução em 3D."
  ],
  "Culling": [
    "Descarte de caras",
    "Descarte de faces"
  ],
  "Current scene": [
    "Escena actual",
    "Cena atual"
  ],
  "Custom": [
    "Personalizado",
    "Personalizado"
  ],
  "Custom Script / No Preset": [
    "Script propio / Sin preset",
    "Script próprio / Sem predefinição"
  ],
  "Custom event": [
    "Evento personalizado",
    "Evento personalizado"
  ],
  "Custom transparency settings.": [
    "Ajustes personalizados de transparencia.",
    "Configurações personalizadas de transparência."
  ],
  "Cutoff": [
    "Umbral",
    "Limiar"
  ],
  "Darken": [
    "Oscurecer",
    "Escurecer"
  ],
  "Default": [
    "Predeterminado",
    "Padrão"
  ],
  "Delete": [
    "Eliminar",
    "Excluir"
  ],
  "Delete Scene": [
    "Eliminar escena",
    "Excluir cena"
  ],
  "Delete channel": [
    "Eliminar canal",
    "Excluir canal"
  ],
  "Delete clip": [
    "Eliminar clip",
    "Excluir clipe"
  ],
  "Delete event": [
    "Eliminar evento",
    "Excluir evento"
  ],
  "Delete keyframe": [
    "Eliminar fotograma clave",
    "Excluir quadro-chave"
  ],
  "Delete scene": [
    "Eliminar escena",
    "Excluir cena"
  ],
  "Delete sequence": [
    "Eliminar secuencia",
    "Excluir sequência"
  ],
  "Depth": [
    "Profundidad",
    "Profundidade"
  ],
  "Depth PSM": [
    "Formato de profundidad",
    "Formato de profundidade"
  ],
  "Deselect All": [
    "Deseleccionar todo",
    "Desmarcar tudo"
  ],
  "Destination": [
    "Destino",
    "Destino"
  ],
  "Destroy": [
    "Destruir",
    "Destruir"
  ],
  "Destroy Object": [
    "Destruir objeto",
    "Destruir objeto"
  ],
  "Destroy object": [
    "Destruir objeto",
    "Destruir objeto"
  ],
  "Detach Prefab Instance": [
    "Desvincular instancia de prefab",
    "Desvincular instância de prefab"
  ],
  "Dialogue": [
    "Diálogo",
    "Diálogo"
  ],
  "Dialogue clip text": [
    "Texto del clip de diálogo",
    "Texto do clipe de diálogo"
  ],
  "Diffuse": [
    "Difusa",
    "Difusa"
  ],
  "Dimensions": [
    "Dimensiones",
    "Dimensões"
  ],
  "Direction": [
    "Dirección",
    "Direção"
  ],
  "Dirt": [
    "Tierra",
    "Terra"
  ],
  "Disabled": [
    "Desactivado",
    "Desativado"
  ],
  "Dismiss": [
    "Descartar",
    "Dispensar"
  ],
  "Display": [
    "Pantalla",
    "Tela"
  ],
  "Dock": [
    "Acoplar",
    "Acoplar"
  ],
  "Docked panels": [
    "Paneles acoplados",
    "Painéis acoplados"
  ],
  "Does not equal": [
    "No es igual a",
    "Não é igual a"
  ],
  "Done": [
    "Listo",
    "Pronto"
  ],
  "Download": [
    "Descargar",
    "Baixar"
  ],
  "Download game folder": [
    "Descargar carpeta del juego",
    "Baixar pasta do jogo"
  ],
  "Download it": [
    "Descargar",
    "Baixar"
  ],
  "Draft · fastest": [
    "Borrador · más rápido",
    "Rascunho · mais rápido"
  ],
  "Drag clips to move · Drag edges to resize · Seconds": [
    "Arrastrá clips para moverlos · Bordes para cambiar duración · Segundos",
    "Arraste clipes para movê-los · Bordas para mudar duração · Segundos"
  ],
  "Drag threshold": [
    "Umbral de arrastre",
    "Limiar de arrasto"
  ],
  "Drape On Geometry": [
    "Proyectar sobre geometría",
    "Projetar sobre geometria"
  ],
  "Draws both sides — 2x fill cost": [
    "Dibuja ambas caras — doble costo de relleno",
    "Desenha ambas as faces — dobro do custo de preenchimento"
  ],
  "Drop to import into": [
    "Soltá para importar en",
    "Solte para importar em"
  ],
  "Drop to place in the scene": [
    "Soltá para colocar en la escena",
    "Solte para colocar na cena"
  ],
  "Duplicate": [
    "Duplicar",
    "Duplicar"
  ],
  "Duplicate clip": [
    "Duplicar clip",
    "Duplicar clipe"
  ],
  "Duplicate event": [
    "Duplicar evento",
    "Duplicar evento"
  ],
  "Dynamic": [
    "Dinámico",
    "Dinâmico"
  ],
  "Edit Script": [
    "Editar script",
    "Editar script"
  ],
  "Edit Scripts": [
    "Editar scripts",
    "Editar scripts"
  ],
  "Edit UVs": [
    "Editar UVs",
    "Editar UVs"
  ],
  "Edit an existing terrain…": [
    "Editar un terreno existente…",
    "Editar um terreno existente…"
  ],
  "Edit terrain": [
    "Editar terreno",
    "Editar terreno"
  ],
  "Edit world…": [
    "Editar mundo…",
    "Editar mundo…"
  ],
  "Editor controls…": [
    "Controles del editor…",
    "Controles do editor…"
  ],
  "Edits are stored in this project automatically. Save the project to keep a copy on disk. Scripts run in the exported game.": [
    "Las ediciones se almacenan en el proyecto. Guardalo para conservar una copia en disco. Los scripts se ejecutan en el juego exportado.",
    "As edições são armazenadas no projeto. Salve para manter uma cópia no disco. Os scripts executam no jogo exportado."
  ],
  "Emit custom event": [
    "Emitir evento personalizado",
    "Emitir evento personalizado"
  ],
  "Empty": [
    "Vacío",
    "Vazio"
  ],
  "Empty Object": [
    "Objeto vacío",
    "Objeto vazio"
  ],
  "Enable / disable behaviours": [
    "Activar / desactivar comportamientos",
    "Ativar / desativar comportamentos"
  ],
  "Enable Generate Collision / Overlap Events on": [
    "Activá Generar eventos de colisión / overlap en",
    "Ative Gerar eventos de colisão / sobreposição em"
  ],
  "Enable behaviours": [
    "Activar comportamientos",
    "Ativar comportamentos"
  ],
  "Enable collision / overlap events": [
    "Activar eventos de colisión / overlap",
    "Ativar eventos de colisão / sobreposição"
  ],
  "Enable distance fog": [
    "Activar niebla por distancia",
    "Ativar neblina por distância"
  ],
  "Enable keyframes": [
    "Activar fotogramas clave",
    "Ativar quadros-chave"
  ],
  "Enable physics": [
    "Activar física",
    "Ativar física"
  ],
  "Enabled": [
    "Activado",
    "Ativado"
  ],
  "End distance": [
    "Distancia final",
    "Distância final"
  ],
  "Enough for a silhouette; the decal is a mask, not a picture.": [
    "Suficiente para una silueta: la proyección usa una máscara.",
    "Suficiente para uma silhueta: a projeção usa uma máscara."
  ],
  "Environment": [
    "Entorno",
    "Ambiente"
  ],
  "Environment map": [
    "Mapa de entorno",
    "Mapa de ambiente"
  ],
  "Equals": [
    "Igual a",
    "Igual a"
  ],
  "Error reduction — how much penetration is corrected each step.": [
    "Reducción de error: penetración corregida en cada paso.",
    "Redução de erro: penetração corrigida em cada passo."
  ],
  "Estimate for one visible surface at 640 × 448. Screen coverage, receivers and other objects change the cost. Motion sliders cap quality; the parameters below set the effect.": [
    "Estimación para una superficie visible a 640 × 448. La cobertura, los receptores y otros objetos cambian el costo. Los sliders de movimiento limitan calidad; los parámetros inferiores definen el efecto.",
    "Estimativa para uma superfície visível a 640 × 448. Cobertura, receptores e outros objetos mudam o custo. Os controles de movimento limitam qualidade; os parâmetros inferiores definem o efeito."
  ],
  "Estimated water cost:": [
    "Costo estimado del agua:",
    "Custo estimado da água:"
  ],
  "Euler angles. The engine applies Z, then Y, then X.": [
    "Ángulos de Euler. El motor aplica Z, luego Y y después X.",
    "Ângulos de Euler. O motor aplica Z, depois Y e depois X."
  ],
  "Event Script": [
    "Script de evento",
    "Script de evento"
  ],
  "Events": [
    "Eventos",
    "Eventos"
  ],
  "Excluded from export": [
    "Excluido de exportación",
    "Excluído da exportação"
  ],
  "Exit name": [
    "Nombre de salida",
    "Nome da saída"
  ],
  "Export": [
    "Exportar",
    "Exportar"
  ],
  "Export Game…": [
    "Exportar juego…",
    "Exportar jogo…"
  ],
  "Export game": [
    "Exportar juego",
    "Exportar jogo"
  ],
  "Export game…": [
    "Exportar juego…",
    "Exportar jogo…"
  ],
  "Export — Preview Code…": [
    "Exportar — Ver código…",
    "Exportar — Ver código…"
  ],
  "Exporting replaces them. Files that already match are left alone.": [
    "La exportación los reemplaza. Los archivos idénticos se conservan.",
    "A exportação os substitui. Os arquivos idênticos são mantidos."
  ],
  "Exports init(ctx) and update(ctx, pad).": [
    "Exporta init(ctx) y update(ctx, pad).",
    "Exporta init(ctx) e update(ctx, pad)."
  ],
  "Extent": [
    "Extensión",
    "Extensão"
  ],
  "Fake reflections": [
    "Reflejos simulados",
    "Reflexos simulados"
  ],
  "Falls, tumbles and is pushed by contacts. Its transform is driven by physics each frame.": [
    "Cae, gira y recibe empujes por contacto. La física controla su transformación en cada frame.",
    "Cai, gira e recebe empurrões por contato. A física controla sua transformação em cada quadro."
  ],
  "Far": [
    "Lejos",
    "Distante"
  ],
  "Field of view": [
    "Campo de visión",
    "Campo de visão"
  ],
  "File details": [
    "Detalles del archivo",
    "Detalhes do arquivo"
  ],
  "Fill": [
    "Relleno",
    "Preenchimento"
  ],
  "Filter": [
    "Filtro",
    "Filtro"
  ],
  "Filter assets by folder": [
    "Filtrar recursos por carpeta",
    "Filtrar recursos por pasta"
  ],
  "Filter assets by type": [
    "Filtrar recursos por tipo",
    "Filtrar recursos por tipo"
  ],
  "Filter properties…": [
    "Filtrar propiedades…",
    "Filtrar propriedades…"
  ],
  "Filtering": [
    "Filtrado",
    "Filtragem"
  ],
  "Find a model": [
    "Buscar modelo",
    "Buscar modelo"
  ],
  "Find a model…": [
    "Buscar modelo…",
    "Buscar modelo…"
  ],
  "Find a property": [
    "Buscar propiedad",
    "Buscar propriedade"
  ],
  "Find an action…": [
    "Buscar acción…",
    "Buscar ação…"
  ],
  "Find commands…": [
    "Buscar comandos…",
    "Buscar comandos…"
  ],
  "Find shortcut": [
    "Buscar atajo",
    "Buscar atalho"
  ],
  "First-person game": [
    "Juego en primera persona",
    "Jogo em primeira pessoa"
  ],
  "Fit To Caster": [
    "Ajustar al objeto que proyecta",
    "Ajustar ao objeto que projeta"
  ],
  "Fit To Mesh": [
    "Ajustar a la malla",
    "Ajustar à malha"
  ],
  "Fix the errors above, then export again.": [
    "Corregí los errores y volvé a exportar.",
    "Corrija os erros e exporte novamente."
  ],
  "Flat": [
    "Plano",
    "Plano"
  ],
  "Flat — cheapest": [
    "Plano — menor costo",
    "Plano — menor custo"
  ],
  "Flatten hills": [
    "Aplanar colinas",
    "Aplanar colinas"
  ],
  "Flow": [
    "Flujo",
    "Fluxo"
  ],
  "Fog": [
    "Niebla",
    "Neblina"
  ],
  "Fog color": [
    "Color de niebla",
    "Cor da neblina"
  ],
  "Fog follows the game camera. Static OBJ surfaces use one extra draw, with no extra texture VRAM.": [
    "La niebla sigue la cámara del juego. Las superficies OBJ estáticas requieren un dibujo extra, sin VRAM adicional para texturas.",
    "A neblina segue a câmera do jogo. Superfícies OBJ estáticas exigem um desenho extra, sem VRAM adicional para texturas."
  ],
  "Folder": [
    "Carpeta",
    "Pasta"
  ],
  "Folder name": [
    "Nombre de carpeta",
    "Nome da pasta"
  ],
  "Follow Caster": [
    "Seguir al objeto que proyecta",
    "Seguir o objeto que projeta"
  ],
  "Follow floors and platforms using their solid colliders. Excludes the caster's own colliders and triggers. Uses Ground Y when no receivers are available.": [
    "Sigue pisos y plataformas usando colliders sólidos. Excluye los del propio objeto y los triggers. Usa Altura del piso si no hay receptores.",
    "Segue pisos e plataformas usando colisores sólidos. Exclui os do próprio objeto e os triggers. Usa Altura do piso se não houver receptores."
  ],
  "Font": [
    "Fuente",
    "Fonte"
  ],
  "Font Size": [
    "Tamaño de fuente",
    "Tamanho da fonte"
  ],
  "Fonts": [
    "Fuentes",
    "Fontes"
  ],
  "Footprint on the ground, in world units.": [
    "Área sobre el piso, en unidades del mundo.",
    "Área sobre o piso, em unidades do mundo."
  ],
  "Fountain": [
    "Fuente de agua",
    "Fonte de água"
  ],
  "Frame All": [
    "Encuadrar todo",
    "Enquadrar tudo"
  ],
  "Frame Selection": [
    "Encuadrar selección",
    "Enquadrar seleção"
  ],
  "Frame counter": [
    "Contador de frames",
    "Contador de quadros"
  ],
  "Framebuffer": [
    "Framebuffer",
    "Framebuffer"
  ],
  "Frames / second": [
    "Frames / segundo",
    "Quadros / segundo"
  ],
  "Front": [
    "Frente",
    "Frente"
  ],
  "Game": [
    "Juego",
    "Jogo"
  ],
  "Game camera": [
    "Cámara del juego",
    "Câmera do jogo"
  ],
  "Game camera settings": [
    "Ajustes de cámara del juego",
    "Configurações da câmera do jogo"
  ],
  "Game view": [
    "Vista del juego",
    "Vista do jogo"
  ],
  "Gameplay and physics pause during playback. Clips restore controlled properties when they end. UI coordinates: 640 × 448. Mesh clips control visibility of the selected model.": [
    "El gameplay y la física se pausan durante la reproducción. Al terminar, los clips restauran las propiedades que controlaban. UI: 640 × 448. Los clips de malla controlan su visibilidad.",
    "Gameplay e física pausam durante a reprodução. Ao terminar, os clipes restauram as propriedades que controlavam. UI: 640 × 448. Os clipes de malha controlam sua visibilidade."
  ],
  "Gameplay paused": [
    "Gameplay pausado",
    "Gameplay pausado"
  ],
  "Generate Collision / Overlap Events": [
    "Generar eventos de colisión / overlap",
    "Gerar eventos de colisão / sobreposição"
  ],
  "Generated files": [
    "Archivos generados",
    "Arquivos gerados"
  ],
  "GeomBox — fastest, works for most props": [
    "GeomBox — rápido, sirve para la mayoría de objetos",
    "GeomBox — rápido, serve para a maioria dos objetos"
  ],
  "GeomPlane — static ground. Never moves.": [
    "GeomPlane — piso estático. No se mueve.",
    "GeomPlane — piso estático. Não se move."
  ],
  "GeomRay — a probe you cast from a script": [
    "GeomRay — un rayo lanzado desde un script",
    "GeomRay — um raio lançado por um script"
  ],
  "GeomRenderObject — trimesh from the model. Expensive; static geometry only.": [
    "GeomRenderObject — malla del modelo. Costoso; solo geometría estática.",
    "GeomRenderObject — malha do modelo. Custoso; apenas geometria estática."
  ],
  "GeomSphere — cheapest of all": [
    "GeomSphere — el más económico",
    "GeomSphere — o mais econômico"
  ],
  "Global": [
    "Global",
    "Global"
  ],
  "Gouraud": [
    "Gouraud",
    "Gouraud"
  ],
  "Grass": [
    "Pasto",
    "Grama"
  ],
  "Gravity": [
    "Gravedad",
    "Gravidade"
  ],
  "Greater than": [
    "Mayor que",
    "Maior que"
  ],
  "Grid snap": [
    "Ajuste a cuadrícula",
    "Ajuste à grade"
  ],
  "Ground Y": [
    "Altura del piso",
    "Altura do piso"
  ],
  "HUD Editor": [
    "Editor de HUD",
    "Editor de HUD"
  ],
  "Hardware controls": [
    "Controles de hardware",
    "Controles de hardware"
  ],
  "Has errors": [
    "Tiene errores",
    "Tem erros"
  ],
  "Has warnings": [
    "Tiene advertencias",
    "Tem avisos"
  ],
  "Height": [
    "Altura",
    "Altura"
  ],
  "Height the decal sits at. A little above the floor, or it z-fights with it.": [
    "Altura de la proyección. Ubicala algo sobre el piso para evitar parpadeo.",
    "Altura da projeção. Posicione um pouco acima do piso para evitar cintilação."
  ],
  "Help & Shortcuts": [
    "Ayuda y atajos",
    "Ajuda e atalhos"
  ],
  "Hide / Show Selection": [
    "Ocultar / mostrar selección",
    "Ocultar / mostrar seleção"
  ],
  "High · finer contact shading": [
    "Alta · sombreado de contacto más preciso",
    "Alta · sombreamento de contato mais preciso"
  ],
  "Higher draws on top.": [
    "Los valores altos se dibujan encima.",
    "Valores altos são desenhados por cima."
  ],
  "Highest precision, highest cost.": [
    "Máxima precisión, máximo costo.",
    "Máxima precisão, máximo custo."
  ],
  "Hill strength": [
    "Fuerza de colinas",
    "Força das colinas"
  ],
  "Hill tool": [
    "Herramienta de colinas",
    "Ferramenta de colinas"
  ],
  "How a pixel's opacity is compared against the cutoff below.": [
    "Cómo se compara la opacidad de cada píxel con el umbral.",
    "Como a opacidade de cada pixel é comparada com o limiar."
  ],
  "How heavily it rests on things. Keep it small: 1–10 for a character.": [
    "Peso sobre otros objetos. Usá valores bajos: 1–10 para un personaje.",
    "Peso sobre outros objetos. Use valores baixos: 1–10 para um personagem."
  ],
  "How much ground the shadow covers across the light. Its length along the light is derived from the light's angle.": [
    "Ancho de la sombra sobre el piso. Su longitud se calcula con el ángulo de la luz.",
    "Largura da sombra sobre o piso. Seu comprimento é calculado pelo ângulo da luz."
  ],
  "If all conditions match": [
    "Si se cumplen todas las condiciones",
    "Se todas as condições forem atendidas"
  ],
  "Image": [
    "Imagen",
    "Imagem"
  ],
  "Import Assets…": [
    "Importar recursos…",
    "Importar recursos…"
  ],
  "Import a texture or add a primitive to use these tools.": [
    "Importá una textura o agregá una primitiva para usar estas herramientas.",
    "Importe uma textura ou adicione uma primitiva para usar estas ferramentas."
  ],
  "Import assets…": [
    "Importar recursos…",
    "Importar recursos…"
  ],
  "Import font file…": [
    "Importar archivo de fuente…",
    "Importar arquivo de fonte…"
  ],
  "Import font…": [
    "Importar fuente…",
    "Importar fonte…"
  ],
  "Import sky panorama": [
    "Importar panorama del cielo",
    "Importar panorama do céu"
  ],
  "Imported skies": [
    "Cielos importados",
    "Céus importados"
  ],
  "Include static shadows": [
    "Incluir sombras estáticas",
    "Incluir sombras estáticas"
  ],
  "Infinite horizontal plane at this height, normal +Y.": [
    "Plano horizontal infinito a esta altura, normal +Y.",
    "Plano horizontal infinito nesta altura, normal +Y."
  ],
  "Install AthEditor": [
    "Instalar AthEditor",
    "Instalar AthEditor"
  ],
  "Install AthEditor…": [
    "Instalar AthEditor…",
    "Instalar AthEditor…"
  ],
  "Installed font": [
    "Fuente instalada",
    "Fonte instalada"
  ],
  "Interpolation": [
    "Interpolación",
    "Interpolação"
  ],
  "Invert wheel": [
    "Invertir rueda",
    "Inverter roda"
  ],
  "Iterations": [
    "Iteraciones",
    "Iterações"
  ],
  "Keep upright": [
    "Mantener vertical",
    "Manter vertical"
  ],
  "Keeps the body upright and lets a script own the visual rotation.": [
    "Mantiene el cuerpo vertical y permite que un script controle la rotación visual.",
    "Mantém o corpo vertical e permite que um script controle a rotação visual."
  ],
  "Keyboard shortcuts": [
    "Atajos de teclado",
    "Atalhos de teclado"
  ],
  "Keyframes": [
    "Fotogramas clave",
    "Quadros-chave"
  ],
  "Layout": [
    "Diseño de paneles",
    "Layout de painéis"
  ],
  "Leave the video mode alone. Safest, and what most homebrew does.": [
    "Conserva el modo de video. Es la opción más segura y habitual en homebrew.",
    "Mantém o modo de vídeo. É a opção mais segura e habitual em homebrew."
  ],
  "Leave this off. Despite the name it does not enable blending — it restricts blending to pixels that are already fully opaque, which makes every see-through surface in the game solid.": [
    "Dejalo desactivado. Restringe la mezcla a píxeles ya opacos y vuelve sólidas las superficies transparentes.",
    "Mantenha desativado. Restringe a mistura a pixels já opacos e torna sólidas as superfícies transparentes."
  ],
  "Left mouse": [
    "Botón izquierdo",
    "Botão esquerdo"
  ],
  "Less than": [
    "Menor que",
    "Menor que"
  ],
  "Level height": [
    "Altura del nivel",
    "Altura do nível"
  ],
  "Library folder": [
    "Carpeta de biblioteca",
    "Pasta da biblioteca"
  ],
  "Lifetime": [
    "Tiempo de vida",
    "Tempo de vida"
  ],
  "Lifts a draped node off the surface it hit. Negative lifts it toward the light.": [
    "Separa la proyección de la superficie. Un valor negativo la acerca a la luz.",
    "Separa a projeção da superfície. Um valor negativo a aproxima da luz."
  ],
  "Light": [
    "Luz",
    "Luz"
  ],
  "Light Cam FOV": [
    "FOV de cámara de luz",
    "FOV da câmera da luz"
  ],
  "Light Dir": [
    "Dirección de luz",
    "Direção da luz"
  ],
  "Light Offset": [
    "Desplazamiento de luz",
    "Deslocamento da luz"
  ],
  "Lighting": [
    "Iluminación",
    "Iluminação"
  ],
  "Lightmap textures": [
    "Texturas de iluminación",
    "Texturas de iluminação"
  ],
  "Linear": [
    "Lineal",
    "Linear"
  ],
  "Linear filtering": [
    "Filtrado lineal",
    "Filtragem linear"
  ],
  "Live silhouette": [
    "Silueta en vivo",
    "Silhueta ao vivo"
  ],
  "Load project assets…": [
    "Cargar recursos del proyecto…",
    "Carregar recursos do projeto…"
  ],
  "Loaded from the scene's models directory.": [
    "Se carga desde la carpeta de modelos de la escena.",
    "Carregado pela pasta de modelos da cena."
  ],
  "Loading font…": [
    "Cargando fuente…",
    "Carregando fonte…"
  ],
  "Local": [
    "Local",
    "Local"
  ],
  "Look At": [
    "Mirar hacia",
    "Olhar para"
  ],
  "Loop": [
    "Repetir",
    "Repetir"
  ],
  "Loop Animation": [
    "Repetir animación",
    "Repetir animação"
  ],
  "Make it static": [
    "Hacer estático",
    "Tornar estático"
  ],
  "Manual / script": [
    "Manual / script",
    "Manual / script"
  ],
  "Mass": [
    "Masa",
    "Massa"
  ],
  "Mass Vertex Coloring": [
    "Colorear vértices en lote",
    "Colorir vértices em lote"
  ],
  "Max Stretch": [
    "Estiramiento máximo",
    "Alongamento máximo"
  ],
  "Maximum": [
    "Máximo",
    "Máximo"
  ],
  "Mesh": [
    "Malla",
    "Malha"
  ],
  "Mesh (exact)": [
    "Malla (exacta)",
    "Malha (exata)"
  ],
  "Mesh visibility": [
    "Visibilidad de malla",
    "Visibilidade da malha"
  ],
  "Middle mouse": [
    "Botón central",
    "Botão central"
  ],
  "Mode": [
    "Modo",
    "Modo"
  ],
  "Model": [
    "Modelo",
    "Modelo"
  ],
  "Models": [
    "Modelos",
    "Modelos"
  ],
  "Models in this scene will use the new textures. Original assets are kept.": [
    "Los modelos de esta escena usarán las nuevas texturas. Se conservan los originales.",
    "Os modelos desta cena usarão as novas texturas. Os originais são mantidos."
  ],
  "Module": [
    "Módulo",
    "Módulo"
  ],
  "Moonlit blue": [
    "Azul lunar",
    "Azul lunar"
  ],
  "More objects…": [
    "Más objetos…",
    "Mais objetos…"
  ],
  "Motion": [
    "Movimiento",
    "Movimento"
  ],
  "Move Tool": [
    "Mover",
    "Mover"
  ],
  "Move action earlier": [
    "Adelantar acción",
    "Antecipar ação"
  ],
  "Move action later": [
    "Retrasar acción",
    "Adiar ação"
  ],
  "Move object / open door": [
    "Mover objeto / abrir puerta",
    "Mover objeto / abrir porta"
  ],
  "Multiplies the surface — the usual choice": [
    "Multiplica la superficie — opción habitual",
    "Multiplica a superfície — opção habitual"
  ],
  "Name": [
    "Nombre",
    "Nome"
  ],
  "Name this object gets on ctx. Defaults to the object name.": [
    "Nombre del objeto en ctx. Por defecto usa su nombre actual.",
    "Nome do objeto em ctx. Por padrão usa seu nome atual."
  ],
  "Narrower is more orthographic, and pushes the silhouette camera further from the caster.": [
    "Un campo estrecho parece ortográfico y aleja la cámara de silueta del objeto.",
    "Um campo estreito parece ortográfico e afasta a câmera de silhueta do objeto."
  ],
  "Near": [
    "Cerca",
    "Perto"
  ],
  "Nearest": [
    "Vecino más cercano",
    "Vizinho mais próximo"
  ],
  "Neutral ambient color": [
    "Color ambiental neutro",
    "Cor ambiente neutra"
  ],
  "Never moves. Other bodies collide with it. No ODE.Body is created.": [
    "No se mueve. Otros cuerpos colisionan con él. No crea ODE.Body.",
    "Não se move. Outros corpos colidem com ele. Não cria ODE.Body."
  ],
  "New Project…": [
    "Nuevo proyecto…",
    "Novo projeto…"
  ],
  "New Scene": [
    "Nueva escena",
    "Nova cena"
  ],
  "New folder name": [
    "Nombre de carpeta nueva",
    "Nome da nova pasta"
  ],
  "New folder type": [
    "Tipo de carpeta nueva",
    "Tipo da nova pasta"
  ],
  "New key time": [
    "Tiempo de nuevo fotograma clave",
    "Tempo do novo quadro-chave"
  ],
  "New scene…": [
    "Nueva escena…",
    "Nova cena…"
  ],
  "New script": [
    "Nuevo script",
    "Novo script"
  ],
  "New script name": [
    "Nombre de script nuevo",
    "Nome do novo script"
  ],
  "No": [
    "Sin",
    "Sem"
  ],
  "No HUD elements.": [
    "No hay elementos de HUD.",
    "Não há elementos de HUD."
  ],
  "No Lights": [
    "Sin luces",
    "Sem luzes"
  ],
  "No model matches “": [
    "Ningún modelo coincide con “",
    "Nenhum modelo corresponde a “"
  ],
  "No modifier": [
    "Sin modificador",
    "Sem modificador"
  ],
  "No object matches “": [
    "Ningún objeto coincide con “",
    "Nenhum objeto corresponde a “"
  ],
  "No object named \"": [
    "No existe un objeto llamado \"",
    "Não existe um objeto chamado \""
  ],
  "No problems found.": [
    "No se encontraron problemas.",
    "Nenhum problema encontrado."
  ],
  "No property matches “": [
    "Ninguna propiedad coincide con “",
    "Nenhuma propriedade corresponde a “"
  ],
  "No references in this project.": [
    "Sin referencias en este proyecto.",
    "Sem referências neste projeto."
  ],
  "None": [
    "Ninguno",
    "Nenhum"
  ],
  "Not in the loaded project folder.": [
    "No está en la carpeta del proyecto.",
    "Não está na pasta do projeto."
  ],
  "Nothing at this level.": [
    "Sin problemas de este nivel.",
    "Sem problemas deste nível."
  ],
  "Object options": [
    "Opciones de objeto",
    "Opções do objeto"
  ],
  "Off tears but can raise throughput.": [
    "Desactivado puede producir tearing, pero mejora el rendimiento.",
    "Desativado pode produzir tearing, mas melhora o desempenho."
  ],
  "On Enter": [
    "Al entrar",
    "Ao entrar"
  ],
  "On Exit": [
    "Al salir",
    "Ao sair"
  ],
  "Once": [
    "Una vez",
    "Uma vez"
  ],
  "Only With": [
    "Solo con",
    "Somente com"
  ],
  "Opacity": [
    "Opacidad",
    "Opacidade"
  ],
  "Open": [
    "Abrir",
    "Abrir"
  ],
  "Open Project File…": [
    "Abrir archivo de proyecto…",
    "Abrir arquivo de projeto…"
  ],
  "Open a panel from View → Panels, or choose a layout preset.": [
    "Abrí un panel desde Vista o elegí un diseño de paneles.",
    "Abra um painel em Visualização ou escolha um layout de painéis."
  ],
  "Open editor panel": [
    "Abrir panel del editor",
    "Abrir painel do editor"
  ],
  "Open in window": [
    "Abrir en ventana",
    "Abrir em janela"
  ],
  "Open or save a project to see it here.": [
    "Abrí o guardá un proyecto para verlo acá.",
    "Abra ou salve um projeto para vê-lo aqui."
  ],
  "Open project…": [
    "Abrir proyecto…",
    "Abrir projeto…"
  ],
  "Open this address in Chrome or Edge, then choose": [
    "Abrí esta dirección en Chrome o Edge y elegí",
    "Abra este endereço no Chrome ou Edge e escolha"
  ],
  "Optional init(ctx) and update(ctx, pad) functions run in the game.": [
    "Las funciones opcionales init(ctx) y update(ctx, pad) se ejecutan en el juego.",
    "As funções opcionais init(ctx) e update(ctx, pad) executam no jogo."
  ],
  "Orbit with gamepad": [
    "Orbitar con gamepad",
    "Orbitar com gamepad"
  ],
  "Original:": [
    "Original:",
    "Original:"
  ],
  "Other object": [
    "Otro objeto",
    "Outro objeto"
  ],
  "Outliner": [
    "Objetos",
    "Objetos"
  ],
  "Overlap — enter": [
    "Overlap — entrada",
    "Sobreposição — entrada"
  ],
  "Overlap — exit": [
    "Overlap — salida",
    "Sobreposição — saída"
  ],
  "Overwrite changed files?": [
    "¿Reemplazar archivos modificados?",
    "Substituir arquivos modificados?"
  ],
  "PCSX2 executable": [
    "Ejecutable de PCSX2",
    "Executável do PCSX2"
  ],
  "PCSX2 needs a configured BIOS and HostFS enabled. These paths are remembered on this computer.": [
    "PCSX2 necesita BIOS configurada y HostFS activo. Las rutas se guardan en esta computadora.",
    "PCSX2 precisa de BIOS configurada e HostFS ativo. Os caminhos são salvos neste computador."
  ],
  "Pack triangle islands": [
    "Empaquetar islas de triángulos",
    "Empacotar ilhas de triângulos"
  ],
  "Paint cliffs. Sculpt hills. Make it yours.": [
    "Pintá acantilados y esculpí colinas a tu gusto.",
    "Pinte penhascos e esculpa colinas como quiser."
  ],
  "Panel options": [
    "Opciones de panel",
    "Opções do painel"
  ],
  "Particles": [
    "Partículas",
    "Partículas"
  ],
  "Particles / second": [
    "Partículas / segundo",
    "Partículas / segundo"
  ],
  "Paste": [
    "Pegar",
    "Colar"
  ],
  "Pattern size": [
    "Tamaño del patrón",
    "Tamanho do padrão"
  ],
  "Per-pixel blend (PABE)": [
    "Mezcla por píxel (PABE)",
    "Mistura por pixel (PABE)"
  ],
  "Per-triangle clipping. Fixes geometry popping at screen edges; costs VU time.": [
    "Recorte por triángulo. Corrige saltos de geometría en bordes de pantalla; consume tiempo de VU.",
    "Recorte por triângulo. Corrige saltos de geometria nas bordas da tela; consome tempo de VU."
  ],
  "Performance overlay": [
    "Indicador de rendimiento",
    "Indicador de desempenho"
  ],
  "Physics": [
    "Física",
    "Física"
  ],
  "Pick color from screen": [
    "Tomar color de pantalla",
    "Capturar cor da tela"
  ],
  "Pipeline": [
    "Pipeline",
    "Pipeline"
  ],
  "Place": [
    "Colocar",
    "Colocar"
  ],
  "Plane (infinite)": [
    "Plano (infinito)",
    "Plano (infinito)"
  ],
  "Platform game": [
    "Juego de plataformas",
    "Jogo de plataformas"
  ],
  "Play Animation": [
    "Reproducir animación",
    "Reproduzir animação"
  ],
  "Play Cinematic": [
    "Reproducir cinemática",
    "Reproduzir cinemática"
  ],
  "Play On Start": [
    "Reproducir al iniciar",
    "Reproduzir ao iniciar"
  ],
  "Play Sound Oneshot": [
    "Reproducir sonido una vez",
    "Reproduzir som uma vez"
  ],
  "Play animation": [
    "Reproducir animación",
    "Reproduzir animação"
  ],
  "Play cinematic": [
    "Reproducir cinemática",
    "Reproduzir cinemática"
  ],
  "Play on start": [
    "Reproducir al iniciar",
    "Reproduzir ao iniciar"
  ],
  "Play particles": [
    "Reproducir partículas",
    "Reproduzir partículas"
  ],
  "Play sound oneshot": [
    "Reproducir sonido una vez",
    "Reproduzir som uma vez"
  ],
  "Plays this emitter during the clip. Adjust its effect in Properties.": [
    "Reproduce este emisor durante el clip. Ajustá su efecto en Propiedades.",
    "Reproduz este emissor durante o clipe. Ajuste seu efeito em Propriedades."
  ],
  "Points toward the light, like a vector to the sun.": [
    "Apunta hacia la luz, como un vector hacia el sol.",
    "Aponta para a luz, como um vetor para o sol."
  ],
  "Points toward the light. Aims the silhouette camera and sets how far the shadow is cast and stretched.": [
    "Apunta hacia la luz. Orienta la cámara de silueta y define la distancia y longitud de la sombra.",
    "Aponta para a luz. Orienta a câmera de silhueta e define a distância e o comprimento da sombra."
  ],
  "Pool size": [
    "Cantidad máxima",
    "Quantidade máxima"
  ],
  "Portrait": [
    "Retrato",
    "Retrato"
  ],
  "Position": [
    "Posición",
    "Posição"
  ],
  "Prefabs": [
    "Prefabs",
    "Prefabs"
  ],
  "Prepare Console Folder…": [
    "Preparar carpeta de consola…",
    "Preparar pasta do console…"
  ],
  "Prepare for PlayStation 2": [
    "Preparar para PlayStation 2",
    "Preparar para PlayStation 2"
  ],
  "Preparing texture quality…": [
    "Preparando calidad de textura…",
    "Preparando qualidade da textura…"
  ],
  "Preset": [
    "Preset",
    "Predefinição"
  ],
  "Preview lighting": [
    "Vista previa de iluminación",
    "Prévia de iluminação"
  ],
  "Preview script": [
    "Vista previa de script",
    "Prévia de script"
  ],
  "Preview sequence": [
    "Vista previa de secuencia",
    "Prévia da sequência"
  ],
  "Problems": [
    "Problemas",
    "Problemas"
  ],
  "Progress": [
    "Progreso",
    "Progresso"
  ],
  "Project": [
    "Proyecto",
    "Projeto"
  ],
  "Project name": [
    "Nombre del proyecto",
    "Nome do projeto"
  ],
  "Project settings": [
    "Ajustes del proyecto",
    "Configurações do projeto"
  ],
  "Project status": [
    "Estado del proyecto",
    "Estado do projeto"
  ],
  "Projection": [
    "Proyección",
    "Projeção"
  ],
  "Properties": [
    "Propiedades",
    "Propriedades"
  ],
  "Put your game in a folder you can copy to your console.": [
    "Prepará una carpeta del juego para copiarla a la consola.",
    "Prepare uma pasta do jogo para copiar ao console."
  ],
  "Radius": [
    "Radio",
    "Raio"
  ],
  "Raise / lower": [
    "Subir / bajar",
    "Elevar / baixar"
  ],
  "Ray": [
    "Rayo",
    "Raio"
  ],
  "Ray Length": [
    "Longitud del rayo",
    "Comprimento do raio"
  ],
  "Recent Projects…": [
    "Proyectos recientes…",
    "Projetos recentes…"
  ],
  "Recent projects": [
    "Proyectos recientes",
    "Projetos recentes"
  ],
  "Redo": [
    "Rehacer",
    "Refazer"
  ],
  "Reduce texture size and colours": [
    "Reducir tamaño y colores de textura",
    "Reduzir tamanho e cores da textura"
  ],
  "Refresh from original": [
    "Actualizar desde original",
    "Atualizar pelo original"
  ],
  "Relative to object": [
    "Relativo al objeto",
    "Relativo ao objeto"
  ],
  "Remove": [
    "Quitar",
    "Remover"
  ],
  "Remove action": [
    "Quitar acción",
    "Remover ação"
  ],
  "Remove asset": [
    "Quitar recurso",
    "Remover recurso"
  ],
  "Remove asset…": [
    "Quitar recurso…",
    "Remover recurso…"
  ],
  "Remove condition": [
    "Quitar condición",
    "Remover condição"
  ],
  "Remove from library": [
    "Quitar de biblioteca",
    "Remover da biblioteca"
  ],
  "Remove lower hemisphere": [
    "Quitar hemisferio inferior",
    "Remover hemisfério inferior"
  ],
  "Remove lower sky hemisphere": [
    "Quitar hemisferio inferior del cielo",
    "Remover hemisfério inferior do céu"
  ],
  "Remove sky": [
    "Quitar cielo",
    "Remover céu"
  ],
  "Remove variable": [
    "Quitar variable",
    "Remover variável"
  ],
  "Rename": [
    "Renombrar",
    "Renomear"
  ],
  "Renders the caster from the light each frame, projected onto the ground. Costs one offscreen pass + VRAM.": [
    "Dibuja el objeto desde la luz en cada frame y lo proyecta sobre el piso. Requiere una pasada auxiliar y VRAM.",
    "Desenha o objeto pela luz em cada quadro e projeta sobre o piso. Exige uma passagem auxiliar e VRAM."
  ],
  "Repeat frames": [
    "Repetir frames",
    "Repetir quadros"
  ],
  "Replace console player…": [
    "Reemplazar ejecutable de consola…",
    "Substituir executável de console…"
  ],
  "Replace the project you are working on?": [
    "¿Reemplazar el proyecto actual?",
    "Substituir o projeto atual?"
  ],
  "Replaces the file contents and keeps all assignments.": [
    "Reemplaza el contenido conservando sus asignaciones.",
    "Substitui o conteúdo mantendo suas atribuições."
  ],
  "Report each pair entering or leaving contact / overlap. Triggers do not block movement.": [
    "Informa cuando cada par entra o sale de contacto / overlap. Los triggers no bloquean movimiento.",
    "Informa quando cada par entra ou sai de contato / sobreposição. Triggers não bloqueiam movimento."
  ],
  "Reports overlaps to your script but never blocks anything.": [
    "Informa overlaps al script sin bloquear movimiento.",
    "Informa sobreposições ao script sem bloquear movimento."
  ],
  "Reset Layout": [
    "Restablecer diseño",
    "Restaurar layout"
  ],
  "Reset layout": [
    "Restablecer diseño",
    "Restaurar layout"
  ],
  "Resize docked panels": [
    "Cambiar tamaño de paneles acoplados",
    "Redimensionar painéis acoplados"
  ],
  "Restart": [
    "Reiniciar",
    "Reiniciar"
  ],
  "Restore Original Lighting": [
    "Restaurar iluminación original",
    "Restaurar iluminação original"
  ],
  "Restore default controls": [
    "Restablecer controles",
    "Restaurar controles"
  ],
  "Restore original colors": [
    "Restaurar colores originales",
    "Restaurar cores originais"
  ],
  "Restore the original from the Tools menu.": [
    "Restaurá el original desde Herramientas.",
    "Restaure o original em Ferramentas."
  ],
  "Restore view": [
    "Restaurar vista",
    "Restaurar vista"
  ],
  "Return to editor": [
    "Volver al editor",
    "Voltar ao editor"
  ],
  "Reusable sequences": [
    "Secuencias reutilizables",
    "Sequências reutilizáveis"
  ],
  "Revert Prefab Instance": [
    "Restaurar instancia de prefab",
    "Restaurar instância de prefab"
  ],
  "Right mouse": [
    "Botón derecho",
    "Botão direito"
  ],
  "Rigidbody": [
    "Cuerpo físico",
    "Corpo físico"
  ],
  "Ripple distortion": [
    "Distorsión de ondas",
    "Distorção das ondas"
  ],
  "Rotate Tool": [
    "Rotar",
    "Girar"
  ],
  "Rotation": [
    "Rotación",
    "Rotação"
  ],
  "Rows": [
    "Filas",
    "Linhas"
  ],
  "Rule name": [
    "Nombre de regla",
    "Nome da regra"
  ],
  "Run settings": [
    "Ajustes de ejecución",
    "Configurações de execução"
  ],
  "Run settings…": [
    "Ajustes de ejecución…",
    "Configurações de execução…"
  ],
  "Save": [
    "Guardar",
    "Salvar"
  ],
  "Save Project": [
    "Guardar proyecto",
    "Salvar projeto"
  ],
  "Save Project As…": [
    "Guardar proyecto como…",
    "Salvar projeto como…"
  ],
  "Save Selection as Prefab": [
    "Guardar selección como prefab",
    "Salvar seleção como prefab"
  ],
  "Save Selection as Prefab Variant": [
    "Guardar selección como variante de prefab",
    "Salvar seleção como variante de prefab"
  ],
  "Save a sequence from the timeline to reuse it.": [
    "Guardá una secuencia de Timeline para reutilizarla.",
    "Salve uma sequência de Timeline para reutilizá-la."
  ],
  "Save reusable sequence": [
    "Guardar secuencia reutilizable",
    "Salvar sequência reutilizável"
  ],
  "Save selection as prefab": [
    "Guardar selección como prefab",
    "Salvar seleção como prefab"
  ],
  "Save your changes before opening": [
    "Guardá los cambios antes de abrir",
    "Salve as alterações antes de abrir"
  ],
  "Scale": [
    "Escala",
    "Escala"
  ],
  "Scale Tool": [
    "Escalar",
    "Escalar"
  ],
  "Scene": [
    "Escena",
    "Cena"
  ],
  "Scene camera": [
    "Cámara de escena",
    "Câmera da cena"
  ],
  "Scene defaults": [
    "Valores de escena",
    "Valores da cena"
  ],
  "Scene estimate:": [
    "Estimación de escena:",
    "Estimativa da cena:"
  ],
  "Scene exits": [
    "Salidas de escena",
    "Saídas da cena"
  ],
  "Scene objects": [
    "Objetos de escena",
    "Objetos da cena"
  ],
  "Scene options": [
    "Opciones de escena",
    "Opções da cena"
  ],
  "Scene starts": [
    "Inicia la escena",
    "A cena inicia"
  ],
  "Scene tools": [
    "Herramientas de escena",
    "Ferramentas da cena"
  ],
  "Scene variables": [
    "Variables de escena",
    "Variáveis da cena"
  ],
  "Scene view angle": [
    "Ángulo de vista de escena",
    "Ângulo da vista da cena"
  ],
  "Scenes": [
    "Escenas",
    "Cenas"
  ],
  "Screen fade": [
    "Fundido de pantalla",
    "Transição da tela"
  ],
  "Script Preset": [
    "Preset de script",
    "Predefinição de script"
  ],
  "Script call": [
    "Llamada desde script",
    "Chamada de script"
  ],
  "Script code": [
    "Código del script",
    "Código do script"
  ],
  "Seafloor depth": [
    "Profundidad del fondo marino",
    "Profundidade do fundo marinho"
  ],
  "Search assets": [
    "Buscar recursos",
    "Buscar recursos"
  ],
  "Search assets…": [
    "Buscar recursos…",
    "Buscar recursos…"
  ],
  "Search components": [
    "Buscar componentes",
    "Buscar componentes"
  ],
  "Search components…": [
    "Buscar componentes…",
    "Buscar componentes…"
  ],
  "Search objects": [
    "Buscar objetos",
    "Buscar objetos"
  ],
  "Search objects…": [
    "Buscar objetos…",
    "Buscar objetos…"
  ],
  "Searched when a texture is not beside its mesh.": [
    "Se busca acá si la textura no está junto a la malla.",
    "Busca aqui se a textura não estiver junto à malha."
  ],
  "Seconds per simulation step. 0.016 matches 60 Hz; large values go unstable.": [
    "Segundos por paso de simulación. 0.016 equivale a 60 Hz; valores altos causan inestabilidad.",
    "Segundos por passo de simulação. 0.016 equivale a 60 Hz; valores altos causam instabilidade."
  ],
  "Select All": [
    "Seleccionar todo",
    "Selecionar tudo"
  ],
  "Select Tool": [
    "Seleccionar",
    "Selecionar"
  ],
  "Select a clip in Timeline.": [
    "Seleccioná un clip en Timeline.",
    "Selecione um clipe em Timeline."
  ],
  "Select a model in the scene to edit its UVs.": [
    "Seleccioná un modelo de la escena para editar sus UVs.",
    "Selecione um modelo da cena para editar seus UVs."
  ],
  "Select an object and choose Save Selection to reuse it.": [
    "Seleccioná un objeto y elegí Guardar selección para reutilizarlo.",
    "Selecione um objeto e escolha Salvar seleção para reutilizá-lo."
  ],
  "Select an object in the scene.": [
    "Seleccioná un objeto en la escena.",
    "Selecione um objeto na cena."
  ],
  "Select surfaces in Objects. A shared 128 px, 4-bit map costs about 8 KB. Uses the camera direction; suitable for water and glossy buildings.": [
    "Seleccioná superficies en Objetos. Un mapa compartido de 128 px y 4 bits ocupa unos 8 KB. Usa la dirección de cámara; sirve para agua y edificios brillantes.",
    "Selecione superfícies em Objetos. Um mapa compartilhado de 128 px e 4 bits ocupa cerca de 8 KB. Usa a direção da câmera; serve para água e edifícios brilhantes."
  ],
  "Selected objects have mixed water quality.": [
    "Los objetos seleccionados tienen distinta calidad de agua.",
    "Os objetos selecionados têm qualidades de água diferentes."
  ],
  "Selection": [
    "Selección",
    "Seleção"
  ],
  "Selection changes on release only when the pointer stays within this many screen pixels. A drag keeps the current selection.": [
    "La selección cambia al soltar si el puntero no supera esta distancia en píxeles. Un arrastre conserva la selección.",
    "A seleção muda ao soltar se o ponteiro não superar esta distância em pixels. Um arrasto mantém a seleção."
  ],
  "Sequence": [
    "Secuencia",
    "Sequência"
  ],
  "Sequence library…": [
    "Biblioteca de secuencias…",
    "Biblioteca de sequências…"
  ],
  "Set mass to 5": [
    "Establecer masa en 5",
    "Definir massa como 5"
  ],
  "Set the Screen.* constants yourself.": [
    "Configurá las constantes Screen.* manualmente.",
    "Configure as constantes Screen.* manualmente."
  ],
  "Set variable": [
    "Asignar variable",
    "Definir variável"
  ],
  "Settings": [
    "Ajustes",
    "Configurações"
  ],
  "Shading": [
    "Sombreado",
    "Sombreamento"
  ],
  "Shadow": [
    "Sombra",
    "Sombra"
  ],
  "Shape": [
    "Forma",
    "Forma"
  ],
  "Share scene capture…": [
    "Compartir captura de escena…",
    "Compartilhar captura da cena…"
  ],
  "Shared shadow blobs": [
    "Manchas de sombra compartidas",
    "Manchas de sombra compartilhadas"
  ],
  "Share…": [
    "Compartir…",
    "Compartilhar…"
  ],
  "Sharing files is unavailable in this browser. Download the file to use it in another app.": [
    "Este navegador no permite compartir archivos. Descargalo para usarlo en otra aplicación.",
    "Este navegador não permite compartilhar arquivos. Baixe para usar em outro aplicativo."
  ],
  "Show / hide model": [
    "Mostrar / ocultar modelo",
    "Mostrar / ocultar modelo"
  ],
  "Show Problems": [
    "Mostrar problemas",
    "Mostrar problemas"
  ],
  "Show all assets": [
    "Mostrar todos los recursos",
    "Mostrar todos os recursos"
  ],
  "Show model": [
    "Mostrar modelo",
    "Mostrar modelo"
  ],
  "Simulation details": [
    "Detalles de simulación",
    "Detalhes da simulação"
  ],
  "Size": [
    "Tamaño",
    "Tamanho"
  ],
  "Size the collider from the model's bounding box.": [
    "Ajusta el collider a los límites del modelo.",
    "Ajusta o colisor aos limites do modelo."
  ],
  "Size the decal from the caster's bounding sphere and place the silhouette camera to match. Usually all you want.": [
    "Ajusta la proyección y la cámara de silueta a los límites del objeto. Suele ser suficiente.",
    "Ajusta a projeção e a câmera de silhueta aos limites do objeto. Geralmente é suficiente."
  ],
  "Skip see-through pixels": [
    "Descartar píxeles transparentes",
    "Descartar pixels transparentes"
  ],
  "Skips pixels that are too faint to be worth drawing. Saves time on hardware.": [
    "Descarta píxeles casi invisibles para ahorrar tiempo de dibujo.",
    "Descarta pixels quase invisíveis para economizar tempo de desenho."
  ],
  "Sky": [
    "Cielo",
    "Céu"
  ],
  "Sky color depth": [
    "Bits de color del cielo",
    "Bits de cor do céu"
  ],
  "Sky image": [
    "Imagen del cielo",
    "Imagem do céu"
  ],
  "Sky linear filtering": [
    "Filtrado lineal del cielo",
    "Filtragem linear do céu"
  ],
  "Sky preset": [
    "Preset de cielo",
    "Predefinição de céu"
  ],
  "Sky presets": [
    "Presets de cielo",
    "Predefinições de céu"
  ],
  "Sky texture size": [
    "Tamaño de textura del cielo",
    "Tamanho da textura do céu"
  ],
  "Slides the decal away from the light on X/Z — a cheap way to fake a slanted sun. 0 keeps it under the caster.": [
    "Desplaza la proyección en X/Z para simular un sol inclinado. 0 la mantiene debajo del objeto.",
    "Desloca a projeção em X/Z para simular um sol inclinado. 0 a mantém abaixo do objeto."
  ],
  "Slope Limit": [
    "Límite de pendiente",
    "Limite de inclinação"
  ],
  "Smooth": [
    "Suavizar",
    "Suavizar"
  ],
  "Smooth downscaling": [
    "Reducción suave",
    "Redução suave"
  ],
  "Smooth navigation": [
    "Navegación suave",
    "Navegação suave"
  ],
  "Smooth texture transitions": [
    "Transiciones suaves de textura",
    "Transições suaves de textura"
  ],
  "Snap step": [
    "Paso de ajuste",
    "Passo de ajuste"
  ],
  "Solver passes. Higher is more rigid and slower.": [
    "Pasadas del solver. Más pasadas aumentan rigidez y costo.",
    "Passagens do solver. Mais passagens aumentam rigidez e custo."
  ],
  "Sound": [
    "Sonido",
    "Som"
  ],
  "Sounds": [
    "Sonidos",
    "Sons"
  ],
  "Source": [
    "Origen",
    "Origem"
  ],
  "Specular": [
    "Especular",
    "Especular"
  ],
  "Speed": [
    "Velocidad",
    "Velocidade"
  ],
  "Sphere": [
    "Esfera",
    "Esfera"
  ],
  "Splash": [
    "Salpicadura",
    "Respingo"
  ],
  "Spread": [
    "Dispersión",
    "Dispersão"
  ],
  "Square offscreen buffer, permanently locked in the PS2's 4 MB of VRAM.": [
    "Búfer auxiliar cuadrado que reserva parte de los 4 MB de VRAM de PS2.",
    "Buffer auxiliar quadrado que reserva parte dos 4 MB de VRAM do PS2."
  ],
  "Start AthEditor": [
    "Iniciar AthEditor",
    "Iniciar AthEditor"
  ],
  "Start distance": [
    "Distancia inicial",
    "Distância inicial"
  ],
  "Start scene": [
    "Escena inicial",
    "Cena inicial"
  ],
  "Start with a playable scene, shape it and try your game.": [
    "Empezá con una escena jugable, editala y probá tu juego.",
    "Comece com uma cena jogável, edite e teste seu jogo."
  ],
  "Starting point": [
    "Punto de inicio",
    "Ponto inicial"
  ],
  "Static": [
    "Estático",
    "Estático"
  ],
  "Step": [
    "Paso",
    "Passo"
  ],
  "Stone": [
    "Piedra",
    "Pedra"
  ],
  "Stop": [
    "Detener",
    "Parar"
  ],
  "Strength": [
    "Intensidad",
    "Intensidade"
  ],
  "Style": [
    "Estilo",
    "Estilo"
  ],
  "Subdivision of the decal. Higher follows uneven ground better. Minimum 2.": [
    "Subdivisión de la proyección. Valores altos siguen mejor el terreno irregular. Mínimo 2.",
    "Subdivisão da projeção. Valores altos seguem melhor o terreno irregular. Mínimo 2."
  ],
  "Sun direction": [
    "Dirección del sol",
    "Direção do sol"
  ],
  "Sun color": [
    "Color del sol",
    "Cor do sol"
  ],
  "Ambient color": [
    "Color ambiental",
    "Cor ambiente"
  ],
  "Target": [
    "Destino",
    "Destino"
  ],
  "Target Depth": [
    "Profundidad del búfer",
    "Profundidade do buffer"
  ],
  "Target Size": [
    "Tamaño del búfer",
    "Tamanho do buffer"
  ],
  "Task": [
    "Tarea",
    "Tarefa"
  ],
  "Terrain": [
    "Terreno",
    "Terreno"
  ],
  "Terrain Editor": [
    "Editor de terreno",
    "Editor de terreno"
  ],
  "Terrain brush size": [
    "Tamaño del pincel de terreno",
    "Tamanho do pincel do terreno"
  ],
  "Terrain depth": [
    "Profundidad del terreno",
    "Profundidade do terreno"
  ],
  "Terrain size": [
    "Tamaño del terreno",
    "Tamanho do terreno"
  ],
  "Terrain surface": [
    "Superficie de terreno",
    "Superfície do terreno"
  ],
  "Terrain texture memory": [
    "Memoria de textura de terreno",
    "Memória da textura do terreno"
  ],
  "Terrain tools": [
    "Herramientas de terreno",
    "Ferramentas de terreno"
  ],
  "Terrain width": [
    "Ancho del terreno",
    "Largura do terreno"
  ],
  "Tesselation": [
    "Teselación",
    "Tesselação"
  ],
  "Text": [
    "Texto",
    "Texto"
  ],
  "Text window": [
    "Ventana de texto",
    "Janela de texto"
  ],
  "Texture": [
    "Textura",
    "Textura"
  ],
  "Texture Map": [
    "Mapa de textura",
    "Mapa de textura"
  ],
  "Texture Tools…": [
    "Herramientas de textura…",
    "Ferramentas de textura…"
  ],
  "Texture animation": [
    "Animación de textura",
    "Animação de textura"
  ],
  "Texture repeats across the surface. More repeats make smaller ripples.": [
    "La textura se repite en la superficie. Más repeticiones producen ondas pequeñas.",
    "A textura se repete na superfície. Mais repetições produzem ondas pequenas."
  ],
  "Texture size": [
    "Tamaño de textura",
    "Tamanho da textura"
  ],
  "Texture tools": [
    "Herramientas de textura",
    "Ferramentas de textura"
  ],
  "Textured, lit": [
    "Con textura e iluminación",
    "Com textura e iluminação"
  ],
  "Textures": [
    "Texturas",
    "Texturas"
  ],
  "The wheel zooms. Mouse bindings also apply in Terrain; Alt keeps a navigation gesture separate from painting.": [
    "La rueda controla el zoom. Los controles también se aplican en Terreno; Alt permite navegar sin pintar.",
    "A roda controla o zoom. Os controles também se aplicam em Terreno; Alt permite navegar sem pintar."
  ],
  "Then, in this order": [
    "Luego, en este orden",
    "Depois, nesta ordem"
  ],
  "These files in": [
    "Estos archivos de",
    "Estes arquivos em"
  ],
  "These objects share no components.": [
    "Estos objetos no comparten componentes.",
    "Estes objetos não compartilham componentes."
  ],
  "Third-person game": [
    "Juego en tercera persona",
    "Jogo em terceira pessoa"
  ],
  "This asset has no references in the project.": [
    "Este recurso no tiene referencias en el proyecto.",
    "Este recurso não tem referências no projeto."
  ],
  "This asset is used in": [
    "Este recurso se usa en",
    "Este recurso é usado em"
  ],
  "This object": [
    "Este objeto",
    "Este objeto"
  ],
  "This scene is empty.": [
    "Esta escena está vacía.",
    "Esta cena está vazia."
  ],
  "This scene is ready to export.": [
    "Esta escena está lista para exportar.",
    "Esta cena está pronta para exportar."
  ],
  "This scene no longer exists. Remove this exit.": [
    "Esta escena ya no existe. Eliminá esta salida.",
    "Esta cena não existe mais. Remova esta saída."
  ],
  "Tile size": [
    "Tamaño de baldosa",
    "Tamanho do bloco"
  ],
  "Time": [
    "Tiempo",
    "Tempo"
  ],
  "Timeline": [
    "Timeline",
    "Timeline"
  ],
  "Timeline / Cinematics": [
    "Timeline / Cinemáticas",
    "Timeline / Cinemáticas"
  ],
  "Timeline preview position": [
    "Posición de vista previa de Timeline",
    "Posição da prévia de Timeline"
  ],
  "Timer finishes": [
    "Termina un timer",
    "Um temporizador termina"
  ],
  "Tint": [
    "Tinte",
    "Tonalidade"
  ],
  "Toggle Bottom Panel": [
    "Alternar panel inferior",
    "Alternar painel inferior"
  ],
  "Toggle Inspector": [
    "Alternar inspector",
    "Alternar inspetor"
  ],
  "Toggle Outliner": [
    "Alternar objetos",
    "Alternar objetos"
  ],
  "Top-down game": [
    "Juego con vista superior",
    "Jogo com vista superior"
  ],
  "Track": [
    "Canal",
    "Canal"
  ],
  "Track a Light object's direction. Blank uses the vector below.": [
    "Sigue la dirección de un objeto Luz. Vacío usa el vector inferior.",
    "Segue a direção de um objeto Luz. Vazio usa o vetor abaixo."
  ],
  "Transform": [
    "Transformación",
    "Transformação"
  ],
  "Transform UVs": [
    "Transformar UVs",
    "Transformar UVs"
  ],
  "Transform space": [
    "Espacio de transformación",
    "Espaço de transformação"
  ],
  "Transparency": [
    "Transparencia",
    "Transparência"
  ],
  "Trigger": [
    "Trigger",
    "Trigger"
  ],
  "Try the open scene in PCSX2 (F5)": [
    "Probar escena abierta en PCSX2 (F5)",
    "Testar cena aberta no PCSX2 (F5)"
  ],
  "Type": [
    "Tipo",
    "Tipo"
  ],
  "UV map": [
    "Mapa UV",
    "Mapa UV"
  ],
  "Ultra low": [
    "Ultra baja",
    "Ultra baixa"
  ],
  "Undo": [
    "Deshacer",
    "Desfazer"
  ],
  "Undock": [
    "Desacoplar",
    "Desacoplar"
  ],
  "Unlink Folder": [
    "Desvincular carpeta",
    "Desvincular pasta"
  ],
  "Unsaved changes": [
    "Cambios sin guardar",
    "Alterações não salvas"
  ],
  "Unzip the folder and add your console player (athena.elf).": [
    "Descomprimí la carpeta y agregá el ejecutable de consola (athena.elf).",
    "Descompacte a pasta e adicione o executável de console (athena.elf)."
  ],
  "Use": [
    "Usar",
    "Usar"
  ],
  "Use a box collider": [
    "Usar collider de caja",
    "Usar colisor de caixa"
  ],
  "Use a project image": [
    "Usar imagen del proyecto",
    "Usar imagem do projeto"
  ],
  "Use font": [
    "Usar fuente",
    "Usar fonte"
  ],
  "Use textures": [
    "Usar texturas",
    "Usar texturas"
  ],
  "Use the Model texture as an atlas. Each particle starts on frame one.": [
    "Usa la textura del modelo como atlas. Cada partícula empieza en el primer frame.",
    "Usa a textura do modelo como atlas. Cada partícula começa no primeiro quadro."
  ],
  "Use wide Game camera · 100°": [
    "Usar cámara amplia del juego · 100°",
    "Usar câmera ampla do jogo · 100°"
  ],
  "Used by (": [
    "Usado por (",
    "Usado por ("
  ],
  "Uses the selected Model as a pooled particle mesh.": [
    "Usa el modelo seleccionado como malla de un conjunto de partículas.",
    "Usa o modelo selecionado como malha de um conjunto de partículas."
  ],
  "VRAM locked": [
    "VRAM reservada",
    "VRAM reservada"
  ],
  "Value": [
    "Valor",
    "Valor"
  ],
  "Variable comparison": [
    "Comparación de variable",
    "Comparação de variável"
  ],
  "Variant": [
    "Variante",
    "Variante"
  ],
  "Variant of": [
    "Variante de",
    "Variante de"
  ],
  "Video mode": [
    "Modo de video",
    "Modo de vídeo"
  ],
  "Viewport": [
    "Vista de escena",
    "Vista da cena"
  ],
  "Visible": [
    "Visible",
    "Visível"
  ],
  "Voice": [
    "Voz",
    "Voz"
  ],
  "Volume": [
    "Volumen",
    "Volume"
  ],
  "Wait": [
    "Esperar",
    "Esperar"
  ],
  "Wait until cinematic finishes": [
    "Esperar hasta terminar cinemática",
    "Esperar até terminar a cinemática"
  ],
  "Waits for the move to finish. The final position is kept.": [
    "Espera hasta terminar el movimiento. Conserva la posición final.",
    "Espera até terminar o movimento. Mantém a posição final."
  ],
  "Warm sunset": [
    "Atardecer cálido",
    "Pôr do sol quente"
  ],
  "Water": [
    "Agua",
    "Água"
  ],
  "Water quality": [
    "Calidad del agua",
    "Qualidade da água"
  ],
  "Wave height": [
    "Altura de olas",
    "Altura das ondas"
  ],
  "Wave speed": [
    "Velocidad de olas",
    "Velocidade das ondas"
  ],
  "What happens to a pixel that fails the comparison.": [
    "Qué ocurre con un píxel que no pasa la comparación.",
    "O que acontece com um pixel que não passa na comparação."
  ],
  "When": [
    "Cuándo",
    "Quando"
  ],
  "When skipped": [
    "Al omitir",
    "Ao pular"
  ],
  "Which model to render into the target. Blank uses this object's own model.": [
    "Modelo a dibujar en el búfer. Vacío usa el modelo del propio objeto.",
    "Modelo a desenhar no buffer. Vazio usa o modelo do próprio objeto."
  ],
  "Width": [
    "Ancho",
    "Largura"
  ],
  "World": [
    "Mundo",
    "Mundo"
  ],
  "You can keep editing and export your game here.": [
    "Podés seguir editando y exportar el juego acá.",
    "Você pode continuar editando e exportar o jogo aqui."
  ],
  "You can undo removal. Files on disk are kept.": [
    "Podés deshacer la eliminación. Se conservan los archivos en disco.",
    "Você pode desfazer a remoção. Os arquivos no disco são mantidos."
  ],
  "Your editor, in its own window.": [
    "Tu editor en su propia ventana.",
    "Seu editor na própria janela."
  ],
  "Your scene is empty.": [
    "Tu escena está vacía.",
    "Sua cena está vazia."
  ],
  "Z Order": [
    "Orden Z",
    "Ordem Z"
  ],
  "Zoom": [
    "Zoom",
    "Zoom"
  ],
  "animation RAM.": [
    "RAM de animación.",
    "RAM de animação."
  ],
  "assets included": [
    "recursos incluidos",
    "recursos incluídos"
  ],
  "colors": [
    "colores",
    "cores"
  ],
  "cos of the steepest surface that accepts shadow. -1 disables the filter.": [
    "Coseno de la pendiente máxima que recibe sombra. -1 desactiva el filtro.",
    "Cosseno da inclinação máxima que recebe sombra. -1 desativa o filtro."
  ],
  "ctx Key": [
    "Clave de ctx",
    "Chave de ctx"
  ],
  "default": [
    "predeterminado",
    "padrão"
  ],
  "differ from what the editor is about to write:": [
    "difieren de lo que escribirá el editor:",
    "diferem do que o editor escreverá:"
  ],
  "error": [
    "error",
    "erro"
  ],
  "from the browser's address bar or app menu.": [
    "desde la barra de direcciones o menú del navegador.",
    "pela barra de endereços ou menu do navegador."
  ],
  "in Properties": [
    "en Propiedades",
    "em Propriedades"
  ],
  "in your editor folder to try your game in PCSX2.": [
    "en la carpeta del editor para probar el juego en PCSX2.",
    "na pasta do editor para testar o jogo no PCSX2."
  ],
  "is open in another window.": [
    "está abierto en otra ventana.",
    "está aberto em outra janela."
  ],
  "loaded — use File ▸ Import Assets From Folder.": [
    "cargados — usá Archivo ▸ Importar recursos desde carpeta.",
    "carregados — use Arquivo ▸ Importar recursos da pasta."
  ],
  "matches “": [
    "coincide con “",
    "corresponde a “"
  ],
  "more in the Problems panel.": [
    "más en el panel Problemas.",
    "mais no painel Problemas."
  ],
  "per texture ·": [
    "por textura ·",
    "por textura ·"
  ],
  "places. Removing it leaves these references missing:": [
    "lugares. Quitarlo deja estas referencias sin recurso:",
    "lugares. Removê-lo deixa estas referências sem recurso:"
  ],
  "scene": [
    "escena",
    "cena"
  ],
  "static OBJ models. Uses vertex colors and keeps existing textures; no extra texture VRAM.": [
    "modelos OBJ estáticos. Usa colores de vértice y conserva las texturas, sin VRAM adicional.",
    "modelos OBJ estáticos. Usa cores de vértice e mantém as texturas, sem VRAM adicional."
  ],
  "tiles · Changes are saved with your project.": [
    "baldosas · Los cambios se guardan con el proyecto.",
    "blocos · As alterações são salvas com o projeto."
  ],
  "to start the local service after restarting your computer. It also enables Run in PCSX2.": [
    "para iniciar el servicio local tras reiniciar la computadora. También permite ejecutar en PCSX2.",
    "para iniciar o serviço local após reiniciar o computador. Também permite executar no PCSX2."
  ],
  "triangles ·": [
    "triángulos ·",
    "triângulos ·"
  ],
  "warning": [
    "advertencia",
    "aviso"
  ],
  "· update or revert from Edit → Prefabs": [
    "· actualizar o restaurar desde Editar → Prefabs",
    "· atualizar ou restaurar em Editar → Prefabs"
  ],
  "▶ Preview in Game": [
    "▶ Vista previa en Juego",
    "▶ Prévia em Jogo"
  ],
  "\" in this scene.": [
    "\" en esta escena.",
    "\" nesta cena."
  ],
  "% of a 60 FPS frame.": [
    "% de un frame a 60 FPS.",
    "% de um quadro a 60 FPS."
  ],
  "0..1 floats. Alpha is the shadow's strength.": [
    "Valores 0..1. Alfa controla la intensidad de la sombra.",
    "Valores 0..1. Alfa controla a intensidade da sombra."
  ],
  "A directional shadow lengthens as 1/sin(elevation), which runs away near sunset.": [
    "La longitud direccional crece como 1/sin(elevación), disparándose cerca del atardecer.",
    "O comprimento direcional cresce como 1/sin(elevação), disparando perto do pôr do sol."
  ],
  "Assign onCollisionEnter, onCollisionExit, onTriggerEnter or onTriggerExit callbacks in ctx.<key>. Existing lastHit and entered/exited fields remain available.": [
    "Asigná callbacks onCollisionEnter, onCollisionExit, onTriggerEnter u onTriggerExit en ctx.<key>. lastHit y entered/exited siguen disponibles.",
    "Atribua callbacks onCollisionEnter, onCollisionExit, onTriggerEnter ou onTriggerExit em ctx.<key>. lastHit e entered/exited continuam disponíveis."
  ],
  "Atlas remapping supports OBJ models with UVs inside the texture square. Tiled UVs need to be adjusted first.": [
    "El atlas admite modelos OBJ con UVs dentro del cuadrado de textura. Ajustá primero los UVs repetidos.",
    "O atlas aceita modelos OBJ com UVs dentro do quadrado da textura. Ajuste primeiro os UVs repetidos."
  ],
  "Clear object search": [
    "Limpiar búsqueda de objetos",
    "Limpar busca de objetos"
  ],
  "Clear problem search": [
    "Limpiar búsqueda de problemas",
    "Limpar busca de problemas"
  ],
  "Free": [
    "Libre",
    "Livre"
  ],
  "No autosave could be read, so download may produce nothing. If you have a project folder linked, the last export and save are still on disk.": [
    "No se pudo leer el guardado automático. Si hay una carpeta vinculada, la última exportación y guardado siguen en disco.",
    "Não foi possível ler o salvamento automático. Se houver uma pasta vinculada, a última exportação e salvamento continuam no disco."
  ],
  "Referenced in this scene": [
    "Usados en esta escena",
    "Usados nesta cena"
  ],
  "Reload the editor": [
    "Recargar editor",
    "Recarregar editor"
  ],
  "The editor stopped": [
    "El editor se detuvo",
    "O editor parou"
  ],
  "The rest of the editor still works, and your project is untouched. Undo the last change (Ctrl+Z) and it should come back.": [
    "El resto del editor sigue funcionando y tu proyecto está intacto. Deshacé el último cambio (Ctrl+Z) para intentar recuperarlo.",
    "O restante do editor continua funcionando e seu projeto está intacto. Desfaça a última alteração (Ctrl+Z) para tentar recuperá-lo."
  ],
  "Timeline snapping": [
    "Ajuste de Timeline",
    "Ajuste de Timeline"
  ],
  "Timeline zoom": [
    "Zoom de Timeline",
    "Zoom de Timeline"
  ],
  "Try again": [
    "Reintentar",
    "Tentar novamente"
  ],
  "Your work was autosaved": [
    "Tu trabajo se guardó automáticamente",
    "Seu trabalho foi salvo automaticamente"
  ],
  "could not be drawn": [
    "no se pudo mostrar",
    "não pôde ser exibido"
  ],
  "Create": [
    "Crear",
    "Criar"
  ],
  "Editor tabs": [
    "Paneles del editor",
    "Painéis do editor"
  ],
  "Layout presets": [
    "Diseños de paneles",
    "Layouts de painéis"
  ],
  "More options": [
    "Más opciones",
    "Mais opções"
  ],
  "Particle effects": [
    "Efectos de partículas",
    "Efeitos de partículas"
  ],
  "HUD elements": [
    "Elementos de HUD",
    "Elementos de HUD"
  ],
  "More objects": [
    "Más objetos",
    "Mais objetos"
  ],
  "Project folder": [
    "Carpeta del proyecto",
    "Pasta do projeto"
  ],
  "Selected object": [
    "Objeto seleccionado",
    "Objeto selecionado"
  ],
  "View settings": [
    "Ajustes de vista",
    "Configurações de vista"
  ],
  "Language": [
    "Idioma",
    "Idioma"
  ],
  "Mixed": [
    "Mixto",
    "Misto"
  ],
  "mixed": [
    "mixto",
    "misto"
  ],
  "No problems match the search.": [
    "Ningún problema coincide con la búsqueda.",
    "Nenhum problema corresponde à busca."
  ],
  "No sequence": [
    "Sin secuencia",
    "Sem sequência"
  ],
  "Linear interpolation": [
    "Interpolación lineal",
    "Interpolação linear"
  ],
  "· Converted directly from original": [
    "· Convertido desde el original",
    "· Convertido pelo original"
  ],
  "· Enlarged; no additional detail. Import a larger original.": [
    "· Ampliado sin detalle adicional. Importá un original más grande.",
    "· Ampliado sem detalhes adicionais. Importe um original maior."
  ],
  "· Gameplay suspended": [
    "· Gameplay suspendido",
    "· Gameplay suspenso"
  ],
  "· See Problems": [
    "· Ver Problemas",
    "· Ver Problemas"
  ],
  ". Download it before reloading — the copy in the browser survives a reload, but a file cannot be lost.": [
    ". Descargalo antes de recargar para conservar una copia como archivo.",
    ". Baixe antes de recarregar para manter uma cópia como arquivo."
  ],
  "128 px shadows use about 8 KB per unique silhouette. Position and uniform scale reuse the image; different rotations and proportions need a variant. Drape follows solid colliders.": [
    "Las sombras de 128 px usan unos 8 KB por silueta. Posición y escala uniforme reutilizan la imagen; otras rotaciones o proporciones requieren variantes. La proyección sigue colliders sólidos.",
    "Sombras de 128 px usam cerca de 8 KB por silhueta. Posição e escala uniforme reutilizam a imagem; outras rotações ou proporções exigem variantes. A projeção segue colisores sólidos."
  ],
  "360° × 180° panorama · PNG, JPG or WebP": [
    "Panorama de 360° × 180° · PNG, JPG o WebP",
    "Panorama de 360° × 180° · PNG, JPG ou WebP"
  ],
  "Active scene camera": [
    "Cámara activa de escena",
    "Câmera ativa da cena"
  ],
  "Adding…": [
    "Agregando…",
    "Adicionando…"
  ],
  "Alt + drag to orbit · Scroll to zoom · Arrow keys + Enter to paint precisely": [
    "Alt + arrastre para orbitar · Rueda para zoom · Flechas + Enter para pintar con precisión",
    "Alt + arrasto para orbitar · Roda para zoom · Setas + Enter para pintar com precisão"
  ],
  "Apply to static objects": [
    "Aplicar a objetos estáticos",
    "Aplicar a objetos estáticos"
  ],
  "Atlas size": [
    "Tamaño del atlas",
    "Tamanho do atlas"
  ],
  "Backed up in this browser": [
    "Respaldo en este navegador",
    "Backup neste navegador"
  ],
  "Bake lighting": [
    "Hornear iluminación",
    "Pré-calcular iluminação"
  ],
  "Baking…": [
    "Horneando…",
    "Pré-calculando…"
  ],
  "Blend curve": [
    "Curva de mezcla",
    "Curva de mistura"
  ],
  "Blend in": [
    "Entrada de mezcla",
    "Entrada da mistura"
  ],
  "Blend out": [
    "Salida de mezcla",
    "Saída da mistura"
  ],
  "Browse folders": [
    "Explorar carpetas",
    "Explorar pastas"
  ],
  "Cancel bake": [
    "Cancelar horneado",
    "Cancelar pré-cálculo"
  ],
  "Choose PCSX2 and the console player to run your game.": [
    "Elegí PCSX2 y el ejecutable de consola para probar el juego.",
    "Escolha PCSX2 e o executável de console para testar o jogo."
  ],
  "Choose console player…": [
    "Elegir ejecutable de consola…",
    "Escolher executável de console…"
  ],
  "Choose folder…": [
    "Elegir carpeta…",
    "Escolher pasta…"
  ],
  "Cinematic": [
    "Cinemática",
    "Cinemática"
  ],
  "Cinematic preview": [
    "Vista previa de cinemática",
    "Prévia de cinemática"
  ],
  "Clip": [
    "Clip",
    "Clipe"
  ],
  "Collapse": [
    "Contraer",
    "Recolher"
  ],
  "Collider": [
    "Collider",
    "Colisor"
  ],
  "Component property": [
    "Propiedad del componente",
    "Propriedade do componente"
  ],
  "Continue": [
    "Continuar",
    "Continuar"
  ],
  "Copied": [
    "Copiado",
    "Copiado"
  ],
  "Copy details": [
    "Copiar detalles",
    "Copiar detalhes"
  ],
  "Creating…": [
    "Creando…",
    "Criando…"
  ],
  "Curve": [
    "Curva",
    "Curva"
  ],
  "Download project JSON": [
    "Descargar proyecto JSON",
    "Baixar projeto JSON"
  ],
  "Downloaded": [
    "Descargado",
    "Baixado"
  ],
  "Drag to paint the ground. Shift restores grass.": [
    "Arrastrá para pintar el piso. Shift restaura el pasto.",
    "Arraste para pintar o piso. Shift restaura a grama."
  ],
  "Drag to paint this height. Shift erases.": [
    "Arrastrá para pintar esta altura. Shift borra.",
    "Arraste para pintar esta altura. Shift apaga."
  ],
  "Drag to sculpt. Shift lowers.": [
    "Arrastrá para esculpir. Shift baja el terreno.",
    "Arraste para esculpir. Shift baixa o terreno."
  ],
  "Drop your panorama here.": [
    "Soltá tu panorama acá.",
    "Solte seu panorama aqui."
  ],
  "Duration": [
    "Duración",
    "Duração"
  ],
  "Emitter": [
    "Emisor",
    "Emissor"
  ],
  "Event": [
    "Evento",
    "Evento"
  ],
  "Event name": [
    "Nombre del evento",
    "Nome do evento"
  ],
  "Every component is already on this object.": [
    "El objeto ya tiene todos los componentes.",
    "O objeto já tem todos os componentes."
  ],
  "Expand": [
    "Expandir",
    "Expandir"
  ],
  "Expected": [
    "Valor esperado",
    "Valor esperado"
  ],
  "Fade in": [
    "Fundido de entrada",
    "Transição de entrada"
  ],
  "Fade out": [
    "Fundido de salida",
    "Transição de saída"
  ],
  "Fallback camera": [
    "Cámara alternativa",
    "Câmera alternativa"
  ],
  "Find a command": [
    "Buscar comando",
    "Buscar comando"
  ],
  "Find an object to add": [
    "Buscar objeto para agregar",
    "Buscar objeto para adicionar"
  ],
  "Find an object…": [
    "Buscar objeto…",
    "Buscar objeto…"
  ],
  "Focus selection": [
    "Encuadrar selección",
    "Enquadrar seleção"
  ],
  "From": [
    "Desde",
    "De"
  ],
  "From opacity": [
    "Opacidad inicial",
    "Opacidade inicial"
  ],
  "From position": [
    "Posición inicial",
    "Posição inicial"
  ],
  "From target": [
    "Objetivo inicial",
    "Alvo inicial"
  ],
  "Generate shadows": [
    "Generar sombras",
    "Gerar sombras"
  ],
  "Generate soft directional silhouettes and share each image between matching instances. Receivers keep their textures.": [
    "Genera siluetas direccionales suaves y comparte cada imagen entre instancias equivalentes. Los receptores conservan sus texturas.",
    "Gera silhuetas direcionais suaves e compartilha cada imagem entre instâncias equivalentes. Receptores mantêm suas texturas."
  ],
  "Grid snap ·": [
    "Ajuste a cuadrícula ·",
    "Ajuste à grade ·"
  ],
  "Group as tabs": [
    "Agrupar en pestañas",
    "Agrupar em abas"
  ],
  "Hide": [
    "Ocultar",
    "Ocultar"
  ],
  "Hide (H)": [
    "Ocultar (H)",
    "Ocultar (H)"
  ],
  "Import model…": [
    "Importar modelo…",
    "Importar modelo…"
  ],
  "Import panorama…": [
    "Importar panorama…",
    "Importar panorama…"
  ],
  "Instances (1–64)": [
    "Instancias (1–64)",
    "Instâncias (1–64)"
  ],
  "Layout and appearance": [
    "Diseño y apariencia",
    "Layout e aparência"
  ],
  "Linked prefab": [
    "Prefab vinculado",
    "Prefab vinculado"
  ],
  "Maximum size": [
    "Tamaño máximo",
    "Tamanho máximo"
  ],
  "Needs attention": [
    "Requiere atención",
    "Precisa de atenção"
  ],
  "Object": [
    "Objeto",
    "Objeto"
  ],
  "Playback": [
    "Reproducción",
    "Reprodução"
  ],
  "Prefab variant": [
    "Variante de prefab",
    "Variante de prefab"
  ],
  "Preparing sky textures…": [
    "Preparando texturas del cielo…",
    "Preparando texturas do céu…"
  ],
  "Preparing…": [
    "Preparando…",
    "Preparando…"
  ],
  "Preview result": [
    "Ver resultado",
    "Ver resultado"
  ],
  "Processing…": [
    "Procesando…",
    "Processando…"
  ],
  "Redo (Ctrl+Shift+Z)": [
    "Rehacer (Ctrl+Shift+Z)",
    "Refazer (Ctrl+Shift+Z)"
  ],
  "Reimporting…": [
    "Reimportando…",
    "Reimportando…"
  ],
  "Reimport…": [
    "Reimportar…",
    "Reimportar…"
  ],
  "Remove references in event rules first.": [
    "Eliminá primero las referencias en reglas de eventos.",
    "Remova primeiro as referências em regras de eventos."
  ],
  "Run game": [
    "Ejecutar juego",
    "Executar jogo"
  ],
  "Run in PCSX2": [
    "Ejecutar en PCSX2",
    "Executar no PCSX2"
  ],
  "Run on your computer": [
    "Ejecutar en tu computadora",
    "Executar no computador"
  ],
  "Save Selection": [
    "Guardar selección",
    "Salvar seleção"
  ],
  "Save a project file (Ctrl+S)": [
    "Guardar archivo de proyecto (Ctrl+S)",
    "Salvar arquivo de projeto (Ctrl+S)"
  ],
  "Save static lighting and shadows into your models’ textures.": [
    "Guardar iluminación y sombras estáticas en las texturas de los modelos.",
    "Salvar iluminação e sombras estáticas nas texturas dos modelos."
  ],
  "Saving…": [
    "Guardando…",
    "Salvando…"
  ],
  "Scene background": [
    "Fondo de escena",
    "Fundo da cena"
  ],
  "Scene capture": [
    "Captura de escena",
    "Captura da cena"
  ],
  "Scene viewport": [
    "Vista de escena",
    "Vista da cena"
  ],
  "Seconds": [
    "Segundos",
    "Segundos"
  ],
  "Select this object": [
    "Seleccionar objeto",
    "Selecionar objeto"
  ],
  "Share export": [
    "Compartir exportación",
    "Compartilhar exportação"
  ],
  "Show (H)": [
    "Mostrar (H)",
    "Mostrar (H)"
  ],
  "Show everything": [
    "Mostrar todo",
    "Mostrar tudo"
  ],
  "Show whole scene": [
    "Encuadrar escena completa",
    "Enquadrar cena completa"
  ],
  "Speaker": [
    "Personaje que habla",
    "Personagem que fala"
  ],
  "Start": [
    "Inicio",
    "Início"
  ],
  "Start event": [
    "Evento de inicio",
    "Evento inicial"
  ],
  "Stop game": [
    "Detener juego",
    "Parar jogo"
  ],
  "Sun lighting is captured when you apply. Reapply after changing the Sun.": [
    "La iluminación solar se captura al aplicar. Volvé a aplicar después de cambiar el sol.",
    "A iluminação solar é capturada ao aplicar. Aplique novamente depois de mudar o sol."
  ],
  "Terrain viewport": [
    "Vista de terreno",
    "Vista do terreno"
  ],
  "The Sun stays live. Only contact shading and these tints are baked.": [
    "El sol sigue activo. Solo se hornean el sombreado de contacto y estos tintes.",
    "O sol continua ativo. Apenas sombreamento de contato e estas tonalidades são pré-calculados."
  ],
  "The current scene is ready to play.": [
    "La escena actual está lista para ejecutar.",
    "A cena atual está pronta para executar."
  ],
  "This folder is empty.": [
    "Esta carpeta está vacía.",
    "Esta pasta está vazia."
  ],
  "Timing": [
    "Tiempos",
    "Tempos"
  ],
  "To": [
    "Hasta",
    "Até"
  ],
  "To opacity": [
    "Opacidad final",
    "Opacidade final"
  ],
  "To position": [
    "Posición final",
    "Posição final"
  ],
  "To target": [
    "Objetivo final",
    "Alvo final"
  ],
  "Transition in": [
    "Transición de entrada",
    "Transição de entrada"
  ],
  "Type a command…": [
    "Escribir comando…",
    "Digite um comando…"
  ],
  "Undo (Ctrl+Z)": [
    "Deshacer (Ctrl+Z)",
    "Desfazer (Ctrl+Z)"
  ],
  "Uniform scale off": [
    "Escala uniforme desactivada",
    "Escala uniforme desativada"
  ],
  "Uniform scale on": [
    "Escala uniforme activada",
    "Escala uniforme ativada"
  ],
  "Used by": [
    "Usado por",
    "Usado por"
  ],
  "Uses ambient and directional lights. Moving objects and indirect light are not baked.": [
    "Usa luces ambientales y direccionales. No hornea objetos móviles ni luz indirecta.",
    "Usa luzes ambientes e direcionais. Não pré-calcula objetos móveis nem luz indireta."
  ],
  "Variable": [
    "Variable",
    "Variável"
  ],
  "Weight": [
    "Peso",
    "Peso"
  ],
  "World position": [
    "Posición en el mundo",
    "Posição no mundo"
  ],
  "Your game is ready": [
    "Tu juego está listo",
    "Seu jogo está pronto"
  ],
  "one texture": [
    "una textura",
    "uma textura"
  ],
  "Command palette": [
    "Paleta de comandos",
    "Paleta de comandos"
  ],
  "Orbit": [
    "Orbitar",
    "Orbitar"
  ],
  "Pan": [
    "Desplazar",
    "Deslocar"
  ],
  "Dolly": [
    "Acercar / alejar",
    "Aproximar / afastar"
  ],
  "Orbit speed": [
    "Velocidad de órbita",
    "Velocidade de órbita"
  ],
  "Pan speed": [
    "Velocidad de desplazamiento",
    "Velocidade de deslocamento"
  ],
  "Zoom speed": [
    "Velocidad de zoom",
    "Velocidade de zoom"
  ],
  "Objects": [
    "Objetos",
    "Objetos"
  ],
  "Off": [
    "Desactivado",
    "Desativado"
  ],
  "Transparent": [
    "Transparente",
    "Transparente"
  ],
  "Opaque": [
    "Opaco",
    "Opaco"
  ],
  "Pattern animation": [
    "Animación del patrón",
    "Animação do padrão"
  ],
  "Texture movement": [
    "Movimiento de textura",
    "Movimento da textura"
  ],
  "Mesh waves": [
    "Olas en malla",
    "Ondas na malha"
  ],
  "Caustics": [
    "Cáusticas",
    "Cáusticas"
  ],
  "Cliffs": [
    "Acantilados",
    "Penhascos"
  ],
  "Rotation (radians)": [
    "Rotación (radianes)",
    "Rotação (radianos)"
  ],
  "Start scene default": [
    "Predeterminado de escena inicial",
    "Padrão da cena inicial"
  ],
  "480p progressive": [
    "480p progresivo",
    "480p progressivo"
  ],
  "576p progressive": [
    "576p progresivo",
    "576p progressivo"
  ],
  "command": [
    "comando",
    "comando"
  ],
  "panning": [
    "desplazamiento",
    "deslocamento"
  ],
  "pattern": [
    "patrón",
    "padrão"
  ],
  "textureSize": [
    "tamaño de textura",
    "tamanho da textura"
  ],
  "waves": [
    "olas",
    "ondas"
  ],
  "frames ·": [
    "frames ·",
    "quadros ·"
  ],
  "Dock left": [
    "Acoplar a izquierda",
    "Acoplar à esquerda"
  ],
  "Dock right": [
    "Acoplar a derecha",
    "Acoplar à direita"
  ],
  "Dock above": [
    "Acoplar arriba",
    "Acoplar acima"
  ],
  "Dock below": [
    "Acoplar abajo",
    "Acoplar abaixo"
  ],
  "Focus": [
    "Enfoque",
    "Foco"
  ],
  "Saved": [
    "Guardado",
    "Salvo"
  ],
  "Download requested": [
    "Descarga solicitada",
    "Download solicitado"
  ],
  "objects selected": [
    "objetos seleccionados",
    "objetos selecionados"
  ],
  "Collision events": [
    "Eventos de colisión",
    "Eventos de colisão"
  ],
  "Attach geometry": [
    "Agregar geometría",
    "Adicionar geometria"
  ],
  "Set a viewpoint": [
    "Definir punto de vista",
    "Definir ponto de vista"
  ],
  "Play audio": [
    "Reproducir audio",
    "Reproduzir áudio"
  ],
  "Custom behavior": [
    "Comportamiento propio",
    "Comportamento próprio"
  ],
  "Collisions and movement": [
    "Colisiones y movimiento",
    "Colisões e movimento"
  ],
  "Cast a shadow": [
    "Proyectar sombra",
    "Projetar sombra"
  ],
  "Move, rotate and scale": [
    "Mover, rotar y escalar",
    "Mover, girar e escalar"
  ],
  "Illuminate the scene": [
    "Iluminar la escena",
    "Iluminar a cena"
  ],
  "Select": [
    "Seleccionar",
    "Selecionar"
  ],
  "Move": [
    "Mover",
    "Mover"
  ],
  "Rotate": [
    "Rotar",
    "Girar"
  ],
  "Reset": [
    "Restablecer",
    "Restaurar"
  ],
  "Selected sky panorama": [
    "Panorama de cielo seleccionado",
    "Panorama de céu selecionado"
  ],
  "Ease in": [
    "Aceleración",
    "Aceleração"
  ],
  "Ease out": [
    "Desaceleración",
    "Desaceleração"
  ],
  "Ease in / out": [
    "Aceleración / desaceleración",
    "Aceleração / desaceleração"
  ],
  "Hold / step": [
    "Mantener / salto",
    "Manter / salto"
  ],
  "Bezier": [
    "Bézier",
    "Bézier"
  ],
  "Edit script": [
    "Editar script",
    "Editar script"
  ],
  "Font size": [
    "Tamaño de fuente",
    "Tamanho da fonte"
  ],
  "Only with": [
    "Solo con",
    "Somente com"
  ],
  "Search problems…": [
    "Buscar problemas…",
    "Buscar problemas…"
  ],
  "Texture tools…": [
    "Herramientas de textura…",
    "Ferramentas de textura…"
  ],
  "alpha": [
    "Alfa",
    "Alfa"
  ],
  "brightness": [
    "Brillo",
    "Brilho"
  ],
  "caustics": [
    "Cáusticas",
    "Cáusticas"
  ],
  "object": [
    "Objeto",
    "Objeto"
  ],
  "rotation": [
    "Rotación",
    "Rotação"
  ],
  "transparency": [
    "Transparencia",
    "Transparência"
  ],
  "A character and a ground to explore, ready to make your own.": [
    "Un personaje y un suelo para explorar, listos para crear tu juego.",
    "Um personagem e um chão para explorar, prontos para criar seu jogo."
  ],
  "Walk, look around and jump through the eyes of your player.": [
    "Caminá, mirá alrededor y saltá desde la perspectiva del jugador.",
    "Caminhe, olhe ao redor e pule pela perspectiva do jogador."
  ],
  "Run and jump between platforms, with a camera that follows you.": [
    "Corré y saltá entre plataformas con una cámara que te sigue.",
    "Corra e pule entre plataformas com uma câmera que segue você."
  ],
  "Move a character through a scene viewed from above.": [
    "Mové un personaje en una escena vista desde arriba.",
    "Mova um personagem em uma cena vista de cima."
  ],
  "Start with a camera and a light, and build everything yourself.": [
    "Empezá con una cámara y una luz, y construí tu escena.",
    "Comece com uma câmera e uma luz e construa sua cena."
  ],
  "The graphics view could not start. Close unused editor windows and retry.": [
    "No se pudo iniciar la vista gráfica. Cerrá las ventanas del editor que no uses y volvé a intentar.",
    "Não foi possível iniciar a visualização gráfica. Feche as janelas do editor que não usa e tente novamente."
  ],
  "The graphics view was interrupted. Your project is safe; restore the view to continue.": [
    "Se interrumpió la vista gráfica. Tu proyecto está a salvo; restaurá la vista para continuar.",
    "A visualização gráfica foi interrompida. Seu projeto está seguro; restaure a visualização para continuar."
  ],
  "Drag to dock": [
    "Arrastrá para acoplar",
    "Arraste para encaixar"
  ],
  "Alt-drag to float": [
    "Alt + arrastrar para flotar",
    "Alt + arrastar para flutuar"
  ],
  "Tropical blue": [
    "Azul tropical",
    "Azul tropical"
  ],
  "Cloud islands": [
    "Islas de nubes",
    "Ilhas de nuvens"
  ],
  "Golden hour": [
    "Hora dorada",
    "Hora dourada"
  ],
  "Coral sunset": [
    "Atardecer coral",
    "Pôr do sol coral"
  ],
  "Blue hour": [
    "Hora azul",
    "Hora azul"
  ],
  "Moonlit night": [
    "Noche de luna",
    "Noite de luar"
  ],
  "Storm light": [
    "Luz de tormenta",
    "Luz de tempestade"
  ],
  "Desert sky": [
    "Cielo desértico",
    "Céu do deserto"
  ],
  "Cosmic nebula": [
    "Nebulosa cósmica",
    "Nebulosa cósmica"
  ],
  "Cobalt sky, sunlit ivory cumulus and deep blue cloud shadows": [
    "Cielo cobalto, cúmulos claros al sol y sombras azul intenso",
    "Céu cobalto, cúmulos claros ao sol e sombras azul intenso"
  ],
  "Sculpted cloud towers with brilliant edges and open azure sky": [
    "Torres de nubes con bordes brillantes y cielo abierto",
    "Torres de nuvens com bordas brilhantes e céu aberto"
  ],
  "Honey-lit clouds against a deep teal sky": [
    "Nubes doradas sobre un cielo turquesa intenso",
    "Nuvens douradas sobre um céu turquesa intenso"
  ],
  "Glowing tangerine horizon, coral clouds and violet sky": [
    "Horizonte naranja luminoso, nubes coral y cielo violeta",
    "Horizonte laranja luminoso, nuvens coral e céu violeta"
  ],
  "Ultramarine twilight, lavender clouds and a rose horizon": [
    "Crepúsculo azul intenso, nubes lavanda y horizonte rosado",
    "Crepúsculo azul intenso, nuvens lavanda e horizonte rosado"
  ],
  "Milky Way, silver cloud edges and a luminous moon": [
    "Vía Láctea, nubes de bordes plateados y luna luminosa",
    "Via Láctea, nuvens com bordas prateadas e lua luminosa"
  ],
  "Vivid green and violet curtains over a dark cloud sea": [
    "Cortinas verdes y violetas sobre un mar de nubes oscuras",
    "Cortinas verdes e violetas sobre um mar de nuvens escuras"
  ],
  "Indigo thunderclouds, golden light shafts and cobalt openings": [
    "Nubes de tormenta índigo, rayos dorados y claros azules",
    "Nuvens de tempestade índigo, raios dourados e aberturas azuis"
  ],
  "Sapphire sky, ivory clouds and warm golden haze": [
    "Cielo zafiro, nubes claras y bruma dorada",
    "Céu safira, nuvens claras e névoa dourada"
  ],
  "Electric cyan and violet nebulae, magenta filaments and dense tiny stars": [
    "Nebulosas cian y violetas, filamentos magenta y estrellas diminutas",
    "Nebulosas ciano e violetas, filamentos magenta e estrelas pequenas"
  ],
  "Below the horizon, the sky repeats its edge without extra texture memory.": [
    "Debajo del horizonte, el cielo repite su borde sin usar más memoria de textura.",
    "Abaixo do horizonte, o céu repete sua borda sem usar mais memória de textura."
  ]
};
