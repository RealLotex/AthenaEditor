# AthenaEditor
AthenaEditor is a browser-based 3D Level Editor that allows you to open your project folder, arrange 3D models in scenes, create empty objects and add any type of component to them.

AthenaEditor.html runs entirely in your browser — no installation/internet access needed — and produces main.js scripts that you can copy and paste.

Key concepts:
• Every level is a Scene — a list of objects with components
• Every object gets a Transform (position, rotation, scale) automatically
• Additional behavior comes from Components (Model, Light, Camera, Sound, Script, Animator)
• Scripts are ES module files that receive a shared `ctx` object each frame that contains references to all RenderObjects, RenderDatas, Sounds, Textures and AnimCollections in the scene
• Export Button generates one `main.js` per scene and links them.

Requirements:
Your "project/" folder should have the following structure. 
project/
   3dmodels/
   textures/
   sounds/
   fonts/
   scripts/
   MyPS2Game.athena.json
   main.js
   athena.elf

Usage:
• When you use the Load Button (Inside the File menu), the editor will ask you to upload your main "project/" folder. After you select it and upload it, it will list all files inside all those children folders.
• After that, It will load MyPS2Game.athena.json if it is found, populating your scenes.
• Every time you save, you should take the downloaded MyPS2Game.athena.json and replace the old MyPS2Game.athena.json one in your project folder.
• Every time you hit Export, you should copy the exported main.js content and manually replace the old text inside the main.js in your project. Same with every other scene.

Known Issues:
Shaded mode may not represent final look on PS2 or PCSX2.
Face culling seems not to be working.
Shading modes (gouraud/flat) seem not to be working
Texture map (inside model component) seems not to do anything when toggled on/off
Objects' icons in the outliner don't get updated according to the components in them.
Prefabs aren't fully implemented and may not get saved/loaded/replaced correctly. They are more like templates at the time of writing.
Font's don't get previewed correctly.

Upcoming features:
Shadow Projectors.
ODE Physics, Collisions and Raycasting.
Better saving/loading system (maybe dropping .json saving system and just parsing the main.js every time we load?)
Better Scene management/linking (maybe combining scenes in one single main.js?)
Cutscenes system (.csv player that disables behaviors, lerps properties of objects, plays sound clips, and plays animations following a timeline)


Download:
This is a public Claude Artifact that you can access/customize according to Anthropic's legal terms through the following link:
https://claude.ai/public/artifacts/a1416ff3-fe03-41e6-b25b-da00bf7488c2

This software is released under GNU GENERAL PUBLIC LICENSE 3.0
https://www.gnu.org/licenses/gpl-3.0.html
