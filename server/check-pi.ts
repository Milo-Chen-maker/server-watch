import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {AssistantService,type AssistantRepository} from '../lib/assistant-service';
import {PiRuntime} from './pi-runtime';
import {createMockSnapshot,defaults} from '../contracts/monitoring';
import type {Session,Provider} from '../contracts/assistant';

const snapshot=createMockSnapshot('normal');snapshot.id='authoritative-server-snapshot';
const client=createMockSnapshot('critical');client.id='forged-client-snapshot';
const requests:Record<string,any>[]=[];let mode='gpu',callId=0;
const upstream=createServer(async(req,res)=>{
 let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests.push(body);
 assert.equal(req.headers.authorization,'Bearer test-secret');assert.equal(body.chat_template_kwargs.enable_thinking,false);
 assert.deepEqual(body.tools.map((t:any)=>t.function.name).sort(),['get_alerts','get_gpu','get_processes','get_storage','get_users']);
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 if(mode==='hang'){res.write(': waiting\n\n');return;}
 const tools=body.messages.filter((m:any)=>m.role==='tool');
 const last=body.messages.at(-1);
 const chunk=(delta:unknown,finish_reason:string|null=null)=>res.write('data: '+JSON.stringify({id:'test',object:'chat.completion.chunk',created:1,model:'test-model',choices:[{index:0,delta,finish_reason}]})+'\n\n');
 if(last.role==='user'||mode==='loop')chunk({role:'assistant',tool_calls:[{index:0,id:'gpu-'+(++callId),type:'function',function:{name:mode==='unknown'?'delete_files':({inference:'get_processes',processes:'get_processes',users:'get_users',storage:'get_storage',alerts:'get_alerts',invalid_processes:'get_processes',extra_args:'get_storage'} as Record<string,string>)[mode]??'get_gpu',arguments:JSON.stringify(mode==='invalid_processes'?{gpuId:-1}:mode==='extra_args'?{mount:'/data',path:'/private'}:mode==='inference'?{pid:snapshot.processes![0].pid}:mode==='processes'?{user:'alice',limit:1}:mode==='users'?{limit:1}:mode==='storage'?{mount:'/data'}:mode==='alerts'?{}:{gpuId:mode==='invalid'?63:4})}}]},'tool_calls');
 else{assert.ok(tools.length);chunk({role:'assistant',content:mode==='inference'?JSON.stringify({hypothesis:'可能是推理服务',confidence:'low',limitations:['参数不可确认']}):mode==='gpu'?'GPU 4 已核对':'工具报告查询失败'},'stop');}
 res.end('data: [DONE]\n\n');
});
upstream.listen(0,'127.0.0.1');await once(upstream,'listening');const port=(upstream.address() as {port:number}).port;
const rows=new Map<string,string>();const repo:AssistantRepository={async list(kind){return [...rows].filter(([k])=>k.startsWith(kind+'/')).map(([k,data])=>({id:k.split('/')[1],data}));},async put(kind,id,data){rows.set(kind+'/'+id,data);},async remove(kind,id){rows.delete(kind+'/'+id);},async compareSession(id,expected,next){if(rows.get('sessions/'+id)!==expected)return false;rows.set('sessions/'+id,next);return true;}};
const key=Buffer.alloc(32,7).toString('base64');const runtime=new PiRuntime({async collect(){return snapshot;},async thresholds(){return defaults;}});
const service=new AssistantService(repo,key,true,fetch,runtime);
try{
 const provider=await service.action({action:'saveProvider',provider:{name:'Test Pi',baseUrl:`http://127.0.0.1:${port}/v1`,models:['test-model'],apiKey:'test-secret',enabled:true,isDefault:true,disableThinking:true}}) as Provider;
 const session=await service.action({action:'createSession'}) as Session;
 const chat=async(signal?:AbortSignal)=>service.action({action:'chat',sessionId:session.id,providerId:provider.id,model:'test-model',input:{question:'查询 GPU4',snapshot:client,thresholds:{...defaults,gpu:1},history:[]}},signal) as Promise<Response>;
 const first=await (await chat()).text();assert.ok(first.includes('"type":"tool"'));assert.ok(!first.includes('forged-client-snapshot'));
 let stored=(await service.state()).sessions[0];assert.equal(stored.messages.at(-1)?.status,'complete');assert.equal(stored.messages.at(-1)?.tools?.[0].status,'complete');assert.ok(stored.messages.at(-1)?.piMessages?.length);
 const tool=JSON.parse(requests[1].messages.find((m:any)=>m.role==='tool').content);assert.equal(tool.snapshotId,snapshot.id);assert.equal(tool.thresholds.gpu,defaults.gpu);assert.equal(tool.gpu.id,4);
 await (await chat()).text();assert.equal(requests[2].messages.filter((m:any)=>m.role==='tool').length,1,'prior tool results survive next turn');
 for(const test of ['invalid','unknown','invalid_processes','extra_args']){mode=test;await (await chat()).text();stored=(await service.state()).sessions[0];assert.equal(stored.messages.at(-1)?.tools?.[0].status,'error');}
 for(const [test,name] of [['processes','get_processes'],['users','get_users'],['storage','get_storage'],['alerts','get_alerts']]){mode=test;const response=await (await chat()).text();assert.ok(response.includes(name));stored=(await service.state()).sessions[0];assert.equal(stored.messages.at(-1)?.status,'complete');assert.equal(stored.messages.at(-1)?.tools?.[0].status,'complete');const result=JSON.parse(stored.messages.at(-1)!.tools![0].result!);assert.equal(result.snapshotId,snapshot.id);}
 mode='inference';const sessionBefore=JSON.stringify((await service.state()).sessions);const inferred=await service.inferProcess(snapshot,defaults,snapshot.processes![0].pid,provider,new AbortController().signal);assert.equal(inferred.confidence,'low');assert.ok(inferred.evidence[0].includes(snapshot.processes![0].command));assert.equal(JSON.stringify((await service.state()).sessions),sessionBefore,'inference must not create chat messages');assert.equal(JSON.parse(requests.at(-1)!.messages.filter((m:any)=>m.role==='tool').at(-1).content).snapshotId,snapshot.id);
 mode='loop';const before=requests.length;await (await chat()).text();assert.ok(requests.length-before<=9);assert.equal((await service.state()).sessions[0].messages.at(-1)?.status,'error');
 mode='hang';const cancel=new AbortController();const response=await chat(cancel.signal);setTimeout(()=>cancel.abort(),80);await response.text();stored=(await service.state()).sessions[0];assert.equal(stored.messages.at(-1)?.status,'stopped');assert.equal(stored.busyUntil,undefined);
 const reloaded=new AssistantService(repo,key,true,fetch,runtime);assert.ok((await reloaded.state()).sessions[0].messages[1].tools?.length);
 const directory=await mkdtemp(join(tmpdir(),'server-watch-pi-'));const oldDir=process.env.SERVER_WATCH_DATA_DIR,oldKey=process.env.AI_CONFIG_ENCRYPTION_KEY;process.env.SERVER_WATCH_DATA_DIR=directory;process.env.AI_CONFIG_ENCRYPTION_KEY=key;
 const {createServer}=await import('./app');const app=createServer();
 try{
  await app.listen({port:0,host:'127.0.0.1'});const url=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  const action=async(body:unknown)=>(await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  const p=await action({action:'saveProvider',provider:{name:'HTTP test',baseUrl:`http://127.0.0.1:${port}/v1`,models:['test-model'],apiKey:'test-secret',enabled:true,isDefault:true,disableThinking:true}});
  const s=await action({action:'createSession'});const cancelHttp=new AbortController();
  const stream=await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'chat',sessionId:s.id,providerId:p.id,model:'test-model',input:{question:'GPU4',snapshot:client,thresholds:defaults,history:[]}}),signal:cancelHttp.signal});await stream.body!.getReader().read();cancelHttp.abort();
  let saved:Session|undefined;for(let n=0;n<50;n++){await delay(50);const state=await (await fetch(url+'/api/assistant')).json();saved=state.sessions[0];if(!saved?.busyUntil)break;}
  assert.equal(saved?.messages.at(-1)?.status,'stopped','HTTP disconnect must cancel SDK and persist stopped state');assert.equal(saved?.busyUntil,undefined);
 }finally{await app.close();if(oldDir===undefined)delete process.env.SERVER_WATCH_DATA_DIR;else process.env.SERVER_WATCH_DATA_DIR=oldDir;if(oldKey===undefined)delete process.env.AI_CONFIG_ENCRYPTION_KEY;else process.env.AI_CONFIG_ENCRYPTION_KEY=oldKey;await rm(directory,{recursive:true,force:true});}
 console.log('PI_CHECK_PASS: real SDK tools, authoritative context, replay, invalid/unknown tools, budget, abort, persistence');
}finally{upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
