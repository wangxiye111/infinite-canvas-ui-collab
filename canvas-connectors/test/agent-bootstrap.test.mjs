import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLocalAgentConnection} from '../src/agent-bootstrap.mjs';

test('local bootstrap exposes only the verified local connection',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'canvas-agent-bootstrap-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'agent.json');await writeFile(path,JSON.stringify({url:'http://127.0.0.1:17371',token:'test-only-token',workspace:{private:'not-returned'}}));
 const result=await readLocalAgentConnection(path,async url=>{assert.equal(String(url),'http://127.0.0.1:17371/health');return Response.json({ok:true});});
 assert.deepEqual(result,{url:'http://127.0.0.1:17371',token:'test-only-token'});
});
test('external or unavailable agent configurations never expose the token',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'canvas-agent-bootstrap-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'agent.json');let called=false;
 await writeFile(path,JSON.stringify({url:'https://external.example',token:'test-only-token'}));
 await assert.rejects(readLocalAgentConnection(path,async()=>{called=true;}),/仅支持本机/);assert.equal(called,false);
 await writeFile(path,JSON.stringify({url:'http://127.0.0.1:17371',token:'test-only-token'}));
 await assert.rejects(readLocalAgentConnection(path,async()=>Response.json({ok:false})),error=>!error.message.includes('test-only-token'));
});
