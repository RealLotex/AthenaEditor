# AthEditor

A visual scene and game editor for [AthenaEnv](https://github.com/DanielSant0s/AthenaEnv) on PlayStation 2.
Create a project, arrange objects, try the game, then export its scenes, scripts and assets.

[Open the editor](https://reallotex.github.io/AthenaEditor/) · [Design review](docs/UX-REVIEW.md) · [Verification](docs/PRODUCTION-VERIFICATION.md)

![Focused scene workspace](docs/verification/workspace.jpg)

## Start editing

Open **AthenaEditor.html** in a desktop browser. The editor includes its dependencies and works offline.
Choose **Create project**, enter a name and press Enter. A third-person game starts with a
character, ground and playable controller. **Change starting point** offers first-person,
platform and top-down games, or a blank scene with a camera and light.

The scene occupies the center, Objects and Assets share the left side, and Properties appear on
the right. **Add object** offers common objects first; search or **More objects…** reveals
other types. **Add a model** lets you choose an existing file or import and place one in a
single step. Assets shows all files; drag a model into the scene to place it where you drop
it. Folder filters are optional. Select an object to see its transformation tools and properties.
**Save** and **Export** stay in the header; the local installation also provides **Run game**.
Export is the primary project action on the hosted site and standalone file. Additional tools are available
through the menus and Ctrl+K. A new project starts in Focus; resumed projects retain their
layout preferences. **Scene options** opens sky and scene settings beside the scene.

**Save** writes a portable project file with imported assets and scripts. The browser also keeps
a recovery copy; that backup is distinct from saving a file. When Save falls back to a
download, the status says **Download requested**. Keep a file copy of your work.
Opening another project with changes offers **Save and continue**, **Discard changes** or
**Cancel**. A cancelled or failed save keeps your current work open.
Linking an existing project folder lets Save and Export write there, with conflict checks before
replacing edited files. File and folder pickers depend on the browser; Chrome and Edge support
the full folder workflow, and the editor falls back to file uploads and downloads elsewhere.

**Export** produces a ZIP containing main.js, every scene, scripts, assets and athena.ini.
The game starts at the project's start scene. Add athena.elf from the included reference folder
to run the exported folder on the console or an emulator. Referenced files must be available;
missing assets, ambiguous filenames and glTF models with external dependencies block export.
Use self-contained GLB models for glTF assets. Scene exits are available to scripts as
`ctx.goToScene("Exit name")` and take effect on the next frame.

## Run on Windows

Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2.9 and PCSX2,
then double-click **Start AthEditor.vbs**, or run:

```sh
deno task app
```

The editor opens at a fixed local address. **Run** discovers the included console player and
PCSX2's standard installation. If necessary, Run settings lets you select their locations.
PCSX2 needs a working BIOS and HostFS enabled. Run stages the open scene in a fresh temporary
folder; Stop controls only the emulator process started by this editor.
The standalone file and the hosted site provide export; native Run requires the local service.
See [Desktop setup](docs/DESKTOP.md).

## Develop and verify

```sh
deno task check       # Build the standalone editor and run the automated suite
deno task serve       # Development server with rebuild/reload
deno task build       # Rebuild AthenaEditor.html from src/
```

Deno downloads build dependencies on the first run. No separate Node installation is required.
Do not edit the generated HTML. Source modules live in src/ and their build order is in
tools/modules.js. Read [CLAUDE.md](CLAUDE.md) and the [verified engine API](docs/ATHENAENV-API.md)
before changing generated engine calls.

The release review includes automated regression tests, browser interaction checks, four
controller fixtures in PCSX2 and repeated scene transitions. It does not certify real PS2
hardware or every possible combination of user scripts and assets.
GitHub Actions builds and tests on each change before deploying the generated editor to Pages.

The editor is GPL-3.0; bundled libraries and AthenaEnv retain their own licenses.
See [LICENSE](LICENSE), [vendor licenses](vendor/LICENSE-MIT.txt) and the
[console player notice](reference/AthenaEnvReleaseAndExamples/README.md).
