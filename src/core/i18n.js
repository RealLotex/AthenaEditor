// ═══════════════════════════════════════════════════════════════════════
//  I18N
//
//  Scope: the Help pages and the dialogs around them. The rest of the editor
//  chrome is still English only — translating all of it is roadmap item 20,
//  and doing it before the UI settles would just mean re-translating.
//
//  t("some.key") looks in the active language, falls back to English, then to
//  the literal fallback argument, then to the key itself. A missing string is
//  therefore visible but never fatal.
// ═══════════════════════════════════════════════════════════════════════

const LANGS = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "pt", label: "Português" },
];

let _lang = "en";
const setLang = (id) => { _lang = LANGS.some((l) => l.id === id) ? id : "en"; };
const getLang = () => _lang;

/** Best guess from the browser, used only the first time the editor is opened. */
function detectLang() {
  const tags = (navigator.languages || [navigator.language || "en"]).map((s) => String(s).toLowerCase());
  for (const tag of tags) {
    if (tag.startsWith("es")) return "es";
    if (tag.startsWith("pt")) return "pt";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

const UI_STRINGS = {
  en: {
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.language": "Language",

    "help.title": "Help",
    "help.build": "Build",
    "help.fullDocs": "Full documentation lives in the docs/ folder.",
    "help.search": "Search help…",
    "help.noMatch": "Nothing matches",
    "help.section.editor": "Editor",
    "help.section.engine": "Engine",
    "help.section.scripting": "Scripting",

    "newProject.title": "New Project",
    "newProject.create": "Create",
    "newProject.createInFolder": "Create in Folder…",
    "newProject.createOnly": "Create Without Folder",
    "newProject.creating": "Creating…",
    "newProject.name": "Project name",
    "newProject.template": "Template",
    "newProject.expects": "Expects:",
    "newProject.includes": "Includes placeholders for:",
    "newProject.planned": "Planned templates:",
    "newProject.runtime": "AthenaEnv runtime",
    "newProject.runtimeChoose": "Choose athena.elf…",
    "newProject.runtimeReplace": "Replace…",
    "newProject.runtimeMissing": "Not set — new folders will be missing the executable.",
    "newProject.runtimeHelp": "Point this at athena.elf from an AthenaEnv release once. It is remembered and copied into every project you create.",
    "newProject.folderHelp": "Creating in a folder writes the directory layout, athena.ini, the runtime, the template's placeholder meshes and its scripts, then links the folder so Export and Save write straight into it. Nothing that already exists is overwritten.",
    "newProject.folderUnsupported": "This browser cannot write files directly, so the project is created in memory only. Chrome and Edge can scaffold a folder.",
    "newProject.unsaved": "The current project has unsaved changes. Creating a new one discards them — Ctrl+Z will not bring it back.",
    "newProject.createOnlyDirty": "Discard and create",
    "newProject.saveFirst": "Save first",
  },

  es: {
    "common.cancel": "Cancelar",
    "common.close": "Cerrar",
    "common.language": "Idioma",

    "help.title": "Ayuda",
    "help.build": "Compilación",
    "help.fullDocs": "La documentación completa está en la carpeta docs/.",
    "help.search": "Buscar en la ayuda…",
    "help.noMatch": "No hay coincidencias con",
    "help.section.editor": "Editor",
    "help.section.engine": "Motor",
    "help.section.scripting": "Scripting",

    "newProject.title": "Nuevo proyecto",
    "newProject.create": "Crear",
    "newProject.createInFolder": "Crear en una carpeta…",
    "newProject.createOnly": "Crear sin carpeta",
    "newProject.creating": "Creando…",
    "newProject.name": "Nombre del proyecto",
    "newProject.template": "Plantilla",
    "newProject.expects": "Espera encontrar:",
    "newProject.includes": "Incluye marcadores de posición para:",
    "newProject.planned": "Plantillas previstas:",
    "newProject.runtime": "Runtime de AthenaEnv",
    "newProject.runtimeChoose": "Elegir athena.elf…",
    "newProject.runtimeReplace": "Reemplazar…",
    "newProject.runtimeMissing": "Sin definir — a las carpetas nuevas les faltará el ejecutable.",
    "newProject.runtimeHelp": "Indicá una vez dónde está athena.elf de una release de AthenaEnv. Queda guardado y se copia en cada proyecto que crees.",
    "newProject.folderHelp": "Crear en una carpeta escribe la estructura de directorios, athena.ini, el runtime, las mallas de ejemplo de la plantilla y sus scripts, y después vincula la carpeta para que Exportar y Guardar escriban ahí. No se sobrescribe nada que ya exista.",
    "newProject.folderUnsupported": "Este navegador no puede escribir archivos directamente, así que el proyecto se crea solo en memoria. Chrome y Edge sí pueden armar la carpeta.",
    "newProject.unsaved": "El proyecto actual tiene cambios sin guardar. Crear uno nuevo los descarta — Ctrl+Z no los recupera.",
    "newProject.createOnlyDirty": "Descartar y crear",
    "newProject.saveFirst": "Guardar primero",
  },

  pt: {
    "common.cancel": "Cancelar",
    "common.close": "Fechar",
    "common.language": "Idioma",

    "help.title": "Ajuda",
    "help.build": "Compilação",
    "help.fullDocs": "A documentação completa está na pasta docs/.",
    "help.search": "Pesquisar na ajuda…",
    "help.noMatch": "Nada corresponde a",
    "help.section.editor": "Editor",
    "help.section.engine": "Motor",
    "help.section.scripting": "Scripting",

    "newProject.title": "Novo projeto",
    "newProject.create": "Criar",
    "newProject.createInFolder": "Criar em uma pasta…",
    "newProject.createOnly": "Criar sem pasta",
    "newProject.creating": "Criando…",
    "newProject.name": "Nome do projeto",
    "newProject.template": "Modelo",
    "newProject.expects": "Espera encontrar:",
    "newProject.includes": "Inclui espaços reservados para:",
    "newProject.planned": "Modelos planejados:",
    "newProject.runtime": "Runtime do AthenaEnv",
    "newProject.runtimeChoose": "Escolher athena.elf…",
    "newProject.runtimeReplace": "Substituir…",
    "newProject.runtimeMissing": "Não definido — as pastas novas ficarão sem o executável.",
    "newProject.runtimeHelp": "Aponte uma vez para o athena.elf de uma release do AthenaEnv. Ele fica guardado e é copiado para cada projeto que você criar.",
    "newProject.folderHelp": "Criar em uma pasta escreve a estrutura de diretórios, o athena.ini, o runtime, as malhas de exemplo do modelo e seus scripts, e depois vincula a pasta para que Exportar e Salvar gravem ali. Nada que já exista é sobrescrito.",
    "newProject.folderUnsupported": "Este navegador não consegue gravar arquivos diretamente, então o projeto é criado apenas na memória. Chrome e Edge conseguem montar a pasta.",
    "newProject.unsaved": "O projeto atual tem alterações não salvas. Criar um novo as descarta — Ctrl+Z não as recupera.",
    "newProject.createOnlyDirty": "Descartar e criar",
    "newProject.saveFirst": "Salvar primeiro",
  },
};

// Template labels live here so the New Project dialog is translated too.
const TEMPLATE_STRINGS = {
  en: {
    "template.empty.label": "Empty",
    "template.empty.blurb": "A camera and a light. Nothing else.",
    "template.first-person.label": "First Person",
    "template.first-person.blurb": "Walk with the left stick, look with the right, jump with ✕. The camera is the player.",
    "template.third-person.label": "Third Person",
    "template.third-person.blurb": "Character runs relative to the camera and turns to face travel. The right stick orbits behind them.",
    "template.side-scroller.label": "Side Scroller",
    "template.side-scroller.blurb": "Momentum platformer: ✕ jumps, R1 sprints, ↓ rolls or charges, and □ dashes. Side camera anticipates movement.",
    "template.top-down.label": "Top Down",
    "template.top-down.blurb": "Character moves on the ground plane and turns to face travel. Camera looks down from behind.",
  },
  es: {
    "template.empty.label": "Vacío",
    "template.empty.blurb": "Una cámara y una luz. Nada más.",
    "template.first-person.label": "Primera persona",
    "template.first-person.blurb": "Caminá con el stick izquierdo, mirá con el derecho, saltá con ✕. La cámara es el personaje.",
    "template.third-person.label": "Tercera persona",
    "template.third-person.blurb": "El personaje corre según hacia dónde mira la cámara y gira hacia donde avanza. El stick derecho orbita por detrás.",
    "template.side-scroller.label": "Vista lateral",
    "template.side-scroller.blurb": "Plataformas con inercia: ✕ salta, R1 acelera, ↓ rueda o carga impulso y □ embiste. Cámara lateral que anticipa el movimiento.",
    "template.top-down.label": "Vista cenital",
    "template.top-down.blurb": "El personaje se mueve sobre el plano del suelo y gira hacia donde avanza. La cámara mira desde arriba y atrás.",
  },
  pt: {
    "template.empty.label": "Vazio",
    "template.empty.blurb": "Uma câmera e uma luz. Nada mais.",
    "template.first-person.label": "Primeira pessoa",
    "template.first-person.blurb": "Ande com o analógico esquerdo, olhe com o direito, pule com ✕. A câmera é o personagem.",
    "template.third-person.label": "Terceira pessoa",
    "template.third-person.blurb": "O personagem corre conforme a direção da câmera e gira na direção do movimento. O analógico direito orbita por trás.",
    "template.side-scroller.label": "Vista lateral",
    "template.side-scroller.blurb": "Plataformas com inércia: ✕ pula, R1 acelera, ↓ rola ou carrega impulso e □ avança. Câmera lateral que antecipa o movimento.",
    "template.top-down.label": "Vista superior",
    "template.top-down.blurb": "O personagem se move no plano do chão e gira na direção do movimento. A câmera olha de cima e de trás.",
  },
};

function t(key, fallback) {
  const table = UI_STRINGS[_lang] || UI_STRINGS.en;
  const tpl = TEMPLATE_STRINGS[_lang] || TEMPLATE_STRINGS.en;
  return table[key] ?? tpl[key] ?? UI_STRINGS.en[key] ?? TEMPLATE_STRINGS.en[key] ?? fallback ?? key;
}
