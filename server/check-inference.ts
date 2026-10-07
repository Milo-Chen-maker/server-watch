import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
import {InferenceService} from './inference-service';import {createMockSnapshot,defaults} from '../contracts/monitoring';
import type {Provider} from '../contracts/assistant';import type {ProcessInference} from '../contracts/inference';
const temp=await mkdtemp(join(tmpdir(),'watch-inference-'));process.env.SERVER_WATCH_DATA_DIR=temp;
const snapshot=createMockSnapshot('normal');const pid=snapshot.processes![0].pid;snapshot.processes![0].startedAt='2026-10-07T00:00:00Z';
const original=JSON.stringify(snapshot);const provider:Provider={id:crypto.randomUUID(),name:'test',baseUrl:'http://localhost/v1',models:['model1'],enabled:true,isDefault:true,hasKey:false};let calls=0;
const monitor={async collect(){return snapshot;},async thresholds(){return defaults;}};
const assistant={async inferenceConfiguration(){return provider;},async inferProcess(s:typeof snapshot,t:typeof defaults,p:number,pr:Provider,signal:AbortSignal):Promise<ProcessInference>{calls++;await delay(30,undefined,{signal});return {hypothesis:'可能是推理任务',confidence:'low',limitations:['无法确认参数'],pid:p,source:'ai-inference',evidence:['server evidence'],snapshotId:s.id,capturedAt:s.capturedAt,generatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),model:pr.models[0],providerId:pr.id};}};
try{
 const service=new InferenceService(monitor,assistant);const [a,b]=await Promise.all([service.infer(pid,false,new AbortController().signal),service.infer(pid,false,new AbortController().signal)]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(JSON.stringify(snapshot),original,'inferences do not overwrite collected task facts');
 assert.equal((await service.cached(pid))?.cached,true);const reload=new InferenceService(monitor,assistant);assert.equal((await reload.cached(pid))?.cached,true);
 await service.infer(pid,true,new AbortController().signal);assert.equal(calls,2);
 provider.models=['model2'];assert.equal(await service.cached(pid),undefined);await service.infer(pid,false,new AbortController().signal);assert.equal(calls,3);
 snapshot.processes![0].startedAt='2026-10-07T01:00:00Z';assert.equal(await service.cached(pid),undefined,'PID reuse invalidates cache');
 await assert.rejects(service.cached(2147483647));const cancel=new AbortController();const pending=service.infer(pid,true,cancel.signal);setTimeout(()=>cancel.abort(),5);await assert.rejects(pending);
 console.log('INFERENCE_CHECK_PASS: identity/provider invalidation, refresh, cache reload, coalescing, no fact mutation, abort');
}finally{await rm(temp,{recursive:true,force:true});}
