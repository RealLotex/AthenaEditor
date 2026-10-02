// ═══════════════════════════════════════════════════════════════════════
//  SOUNDS — Sound.Stream
//
//  Streams are opened relative to the program root, so the path keeps its
//  sounds/ prefix rather than relying on the current working directory.
//
//  What a stream can and cannot do, from the bindings (ath_sound.c:126-134):
//
//    play() pause() rewind() playing()     methods
//    loop  position                        settable properties
//    length                                read-only
//
//  There is **no per-stream volume**. The only volume control in the whole
//  module is `Sound.setVolume(n)` (ath_sound.c:284), which is global — so a
//  per-sound Volume slider could never have done anything, and for a while
//  the editor had one. It is a project setting now, emitted once.
//
//  `Sound.SFX` does have per-instance volume, pan, pitch and loop
//  (ath_sound.c:272-275). The editor does not use SFX yet.
// ═══════════════════════════════════════════════════════════════════════

function emitSounds(e, ir) {
  const master = ir.project?.audio?.volume;
  const wantsMaster = typeof master === "number" && master !== 100;
  if (!ir.sounds.length && !wantsMaster) return;

  e.section("Audio");
  // Global, and the engine's only volume control. Emitted before anything
  // starts playing so nothing is ever briefly loud.
  if (wantsMaster) e.w(`Sound.setVolume(${il(clamp(master, 0, 100))});`);

  for (const s of ir.sounds) {
    e.w(`const ${s.vn} = Sound.Stream("${jsStr(ir.dirs.sounds)}/${jsStr(s.sound.file)}");`);
    // Settable per stream, unlike volume — and it was never emitted, so the
    // Loop checkbox did nothing at all.
    if (s.sound.loop) e.w(`${s.vn}.loop = true;`);
    if (s.sound.playOnStart) e.w(`${s.vn}.play();`);
  }
  e.nl();
}
