import {load,shutdown} from '../tests/_load.js';
try{
  const A=await load();await Deno.mkdir('examples/tours',{recursive:true});
  const entries=[];
  for(const tour of A.EDITOR_TOURS){const project=await A.makeTourProject(tour.id);await Deno.writeTextFile('examples/tours/'+tour.id+'.atheditor',JSON.stringify(project,null,2)+'\n');entries.push(`${tour.title}: ${tour.steps.length} steps`);}
  await Deno.writeTextFile('examples/tours/README.md','# Guided tour projects\n\nThese are the same starting projects used by Help → Guided tours. Open an `.atheditor` directly to experiment independently, or run its guided tour in the editor. Use Previous to revisit a step and Next to continue. At the end, close the guide to keep editing the practice, download it, or explicitly return to your prior project.\n\n'+entries.map(e=>'- '+e).join('\n')+'\n');
  console.log(entries.join('\n'));
}finally{await shutdown();}
