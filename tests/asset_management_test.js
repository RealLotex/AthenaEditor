import {assertEquals,assertThrows,assert} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();

Deno.test('asset inventory covers nested objects, HUD, prefabs and reusable sequences',()=>{
  const p=A.mkProject(),s=p.scenes[0],o=A.mkObject('Door');
  o.components.model={...A.makeComponent('model'),file:'door.obj',textureFile:'door.png'};
  s.objects.push({ ...A.mkObject('Group'),children:[o] });
  s.uiElements.push({...A.mkUIEl('Image'),image:'door.png'});
  p.prefabs.push(A.prefabSnapshot(o));
  const seq=A.mkSequence(),track=A.mkCinematicTrack('portrait');track.clips.push({...A.mkCinematicClip('portrait'),file:'door.png'});seq.tracks.push(track);p.sequenceLibrary.push(seq);
  const asset={name:'door.png',cat:'textures',dataUrl:'data:image/png;base64,AA=='};
  assertEquals(A.assetUsage(p,asset).length,4);
  const missing=A.missingAssetReferences(p,[asset]);
  assertEquals(missing.filter(r=>r.name==='door.obj').length,2);
  assert(missing.some(r=>r.label.includes('Prefab Door')));
});

Deno.test('reimport keeps the identity, folder and every assignment even when the new filename differs',()=>{
  const p=A.mkProject(),o=A.mkObject('Hero');p.scenes[0].objects.push(o);
  const mesh='v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
  const before=A.putProjectAsset(p,A.textMeshAsset('hero.obj',mesh));
  A.moveAssetToFolder(p,before,'Models/Characters');
  o.components.model={...A.makeComponent('model'),file:'hero.obj'};
  const after=A.replaceProjectAsset(p,A.editorAssets(p)[0],A.textMeshAsset('new-export.obj',mesh.replace('v 1 0 0','v 2 0 0')));
  assertEquals(after.id,before.id);assertEquals(after.name,'hero.obj');assertEquals(after.libraryFolder,'Characters');
  assertEquals(o.components.model.file,'hero.obj');assert(after.content!==before.content);assertEquals(p.assets.length,1);
  assertThrows(()=>A.replaceProjectAsset(p,after,{name:'wrong.png',cat:'textures',dataUrl:'data:x;base64,AA=='}),Error,'Choose a .obj');
  assertEquals(p.assets[0],after);
});

Deno.test('library folders persist when empty and reject cross-type moves before mutation',()=>{
  const p=A.mkProject(),f={name:'hero.obj',id:'external',cat:'models',content:'first'};
  A.createAssetFolder(p,'Models/Characters/Heroes');
  assert(A.assetFolderTree([],p.assetFolders).some(f=>f.path==='Models/Characters/Heroes'&&f.count===0));
  A.moveAssetToFolder(p,f,'Models/Characters');
  const refreshed=A.editorAssets(p,[{...f,content:'second'}])[0];
  assertEquals(refreshed.content,'second');assertEquals(refreshed.id,f.id);assertEquals(A.assetLibraryFolder(refreshed),'Models/Characters');
  assertThrows(()=>A.moveAssetToFolder(p,f,'Textures/Characters'),Error,'match the asset type');
  A.moveAssetToFolder(p,refreshed,'Models');assertEquals(A.assetLibraryFolder(A.editorAssets(p,[f])[0]),'Models');
});

Deno.test('removal hides external copies, reports broken references and reimport restores the asset',()=>{
  const p=A.mkProject(),f={name:'sound.wav',id:'sound',cat:'sounds',dataUrl:'data:audio/wav;base64,AA=='};
  const o=A.mkObject('Radio');o.components.sound={...A.makeComponent('sound'),file:f.name};p.scenes[0].objects.push(o);
  assertEquals(A.assetUsage(p,f).length,1);
  A.removeProjectAsset(p,f);assertEquals(A.editorAssets(p,[f]),[]);assertEquals(A.missingAssetReferences(p,A.editorAssets(p,[f])).length,1);
  A.replaceProjectAsset(p,f,{...f,name:'new.wav'});assertEquals(A.editorAssets(p,[f])[0].name,f.name);assertEquals(p.hiddenAssets,[]);
});
