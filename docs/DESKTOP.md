# AthEditor on Windows

AthEditor is the editor's name. AthenaEnv is the target runtime by DanielSantos;
its ELF, configuration names and runtime references retain their original names.
The bundled ELF is the official AthenaEnv `latest` release published August 1, 2026.
[The player reference](../reference/AthenaEnvReleaseAndExamples/README.md) records
its verified hashes. Updating the local repository updates this player. If Run
settings points at a custom ELF, select reference/AthenaEnvReleaseAndExamples/athena.elf to use it.

## Start and install

1. Double-click **Start AthEditor.vbs** in the editor folder. Deno must already
   be installed. The local service starts without a terminal and opens the editor.
2. Open **http://127.0.0.1:8080/** in Chrome or Edge.
3. Choose **Help → Install AthEditor…**, or the browser's install action.
   Confirm the browser's installation dialog. AthEditor can then be opened from
   Windows Start, pinned to the taskbar and used in its own window.

The same browser profile and address share projects, folder handles and layout
between the browser tab and the installed app. Other profiles, ports and the
standalone HTML have separate browser storage. Installation does not transfer
projects from another origin; save/open a project file to move existing work.

The launcher reuses a service from this editor folder. If another application
or the development server occupies port 8080, it explains the conflict instead
of silently changing the address and appearing to lose saved projects.

## Local service and offline editing

**Ctrl+O** opens a project file with the system dialog. **Ctrl+S** chooses its
destination on the first save, then updates that same file. **Ctrl+Shift+S**
selects a different destination. Renaming the project does not create another
file automatically. The status bar shows the chosen filename.

The file handle is remembered with the project's ID and restored with that
project's browser autosave. Startup does not ask for access or overwrite the
autosave with disk content. Saving checks the permission and asks only if needed.
Cancelling a dialog or declining access leaves the project unsaved. Unsupported
browsers retain the file input and download fallback.

A project file includes generated assets, dropped assets and embedded scripts.
Files loaded by linking a folder remain external. Opening a single project file
does not grant access to its parent folder; **Open Existing Folder** loads that
project's external assets. A known recent file recovers its matching linked folder;
opening an unrelated file clears the former folder association.

The linked folder is also remembered with that project's ID. On reopening,
AthEditor checks the existing permission and restores external assets without
reading the disk project over the browser autosave. If access has expired, use
**Load project assets…** in the status bar to allow reading the same folder;
there is no need to select it again. This asks for read access only. Write access
is checked separately when exporting.

**Reload Assets** updates changed files and removes missing files from the asset
list. It preserves the current scene, unsaved edits, undo history and save file.
Old folder handles saved without a project ID must be linked once again, so
AthEditor cannot accidentally restore another project's assets.

## Explorer, project files and recent projects

Drop supported models, textures, sounds, fonts or scripts onto **Assets**. Folder
drops include subfolders; folder rows and breadcrumbs choose the library destination.
A category folder accepts its own asset types. The import retains the original
files, embeds copies in the project and can be undone as one action. Duplicate
filenames get a free name rather than replacing existing assets. Unsupported or
unreadable files are reported. Dropping a whole project folder imports its assets;
use Open Existing Folder when the folder should remain linked to disk.

New saves use **.atheditor**. Existing **.athena.json** and ordinary project JSON
files still open. Installing the app registers .atheditor with the browser's File
Handling API, making AthEditor available in Windows Open With. Windows controls
the default association; AthEditor does not change the registry itself.

System file launches request the existing editor window without navigating it.
Opening that same file focuses the window and preserves current edits. A different
file passes through the existing unsaved-project confirmation. Multiple incoming
launches are processed in order so confirmation dialogs cannot replace each other.

**File → Recent Projects** remembers up to eight saved or opened project files
with their folder association. Opening a recent file checks its access and restores
external assets from its matching folder. Missing files report an error without
discarding the current project. Installed app shortcuts expose **New project** and
**Recent projects**; they open the corresponding dialog without reloading work.

## Colors and title bar

On browsers with EyeDropper, color fields include **Pick color from screen**.
Picking preserves opacity and commits one edit; Escape cancels. Unsupported
browsers keep their existing color controls.

The installed app opts into Window Controls Overlay. When enabled, the menu and
project name occupy the browser-provided title area, leaving Windows controls
uncovered. Empty header space moves the window; buttons and fields remain clickable.
Disabling the overlay restores the ordinary header. The window title reflects the
project name and marks unsaved edits.

## Panel windows

Open a panel's **⋯ → Open in window** to move its existing content into a real
window. This shares the same project and undo history rather than opening another
editor instance. The panel's inputs, asset search and viewport camera remain mounted.
Use **Return to editor**, close that window, or select a layout preset to bring
the panel back. Blocked pop-ups leave the original panel usable and explain what
access is needed.

Native panels forward editor shortcuts while leaving text editing shortcuts to
their fields. File dialogs use the window where the action was triggered. A detached
viewport renders through its own window so it remains active on a second monitor.
Where Window Management is available, **Choose screen…** asks for screen access and
then offers the actual connected displays. Declining keeps the window usable and
movable using ordinary Windows controls.

The service remains available after closing the editor. After restarting Windows,
open **Start AthEditor** to start it again. Installing a web app does not install
an automatically starting Windows service or task.

After its first successful load, the installed editor caches its application
shell and can reopen while the service is stopped. Existing browser autosaves,
generated assets and granted folder access keep their existing storage behaviour.
Uncached files served by the local server need that server. Run in PCSX2 needs
the local service and explains how to start it if unavailable. A restarted service
is reconnected on the next Run request without reloading or replacing the project.

The cache excludes projects, imported files, PCSX2 responses and launcher session
tokens. Browser storage is not a replacement for saving a project file or folder.

Updates take effect on a subsequent load; the editor never forces a reload to
activate an update while a project is open. The worker waits for existing editor
windows to close before replacing an older worker.

## Clipboard, fonts and sharing

**Edit → Copy/Paste** uses the system clipboard where supported. Objects include
their available mesh, texture, script and audio assets; filename collisions are
resolved without overwriting the destination project's files. Pasting creates one
undo step. Text fields retain ordinary text-copy, paste and undo behaviour. Ctrl+V
can paste images directly into **Textures/Clipboard** without an async read prompt.
On unsupported browsers, object copy/paste within the editor remains available.
**Edit → Copy scene capture** copies a PNG of the currently visible Scene panel.

HUD text and button inspectors have **Font → Import font…**. Installed-font access
is requested only by **Choose installed font…**. **Import font file…** accepts a
static individual TTF or OTF as a fallback. Font bytes are embedded in the project
and exported to its font directory. Web font wrappers, collections and variable
faces are refused rather than silently exporting a different face. Imported font
previews are also loaded in a detached HUD window's own font set.

**File → More options → Share scene capture…** prepares a PNG with a preview;
the final **Share…** action opens the system dialog. Export offers **Share…** when
the browser and OS accept ZIP files. Download remains available; cancelling Share
does not discard the export or change the project.

Installed AthEditor declares PNG/JPEG reception in the Windows share dialog.
Incoming images are queued separately from the offline shell, routed to an open
editor without deliberately reloading it, and embedded under **Textures/Shared**.
A receipt is cleared only after successful import. Failed imports, interrupted
project changes and closed-window claims remain recoverable; retrying a receipt
does not duplicate files or reverse Undo. If no editor is open, the receipt opens
the editor. Actual installed Windows reception and launch behaviour are tracked
as pending checks in `NATIVE-INTEGRATIONS.md`.

## Development

`deno task app` starts the same installable editor at port 8080 without live reload.
`deno task serve` retains the development watcher and does not register a worker.
`deno task build` still produces the portable `AthenaEditor.html`; that historical
filename is retained for compatibility. It opens directly without a server and
does not advertise installation or register an offline worker.

The Windows entry point uses the existing Deno runtime. It adds no registry
associations, scheduled tasks or automatic startup entries. Diagnostics are in
`.verification/app-service.log`.
