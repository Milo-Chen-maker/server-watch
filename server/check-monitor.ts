import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MonitorService} from './monitor-service';
import {createMockSnapshot,defaults} from '../contracts/monitoring';
const dir=await mkdtemp(join(tmpdir(),'server-watch-monitor-'));
process.env.SERVER_WATCH_DATA_DIR=dir;process.env.SERVER_WATCH_MONITOR_MODE='script';
const sample={...createMockSnapshot('normal'),source:'script' as const,capacityUnit:'GiB' as const};
try{
 const good=new MonitorService(async()=>sample);await good.start();
 assert.equal((await good.collect('critical',99)).source,'script');
 const captured=(await good.collect('normal',0)).capturedAt;
 assert.equal((await good.collect('normal',1)).capturedAt,captured,'cached reads must not renew sample time');
 await good.saveThresholds({...defaults,gpu:76});await good.stop();
 const failed=new MonitorService(async()=>{throw Error('collector failed');});await failed.start();
 assert.equal(failed.health().status,'degraded');
 await assert.rejects(()=>failed.collect('normal',0));
 assert.equal(JSON.parse(await readFile(join(dir,'snapshot.json'),'utf8')).capturedAt,captured,'failure must preserve persisted sample');
 assert.equal((await failed.thresholds()).gpu,76,'thresholds survive new service instance');
 await assert.rejects(()=>failed.saveThresholds({...defaults,gpu:101}));
 assert.equal((await failed.thresholds()).gpu,76);await failed.stop();
 console.log('PASS: real source, cached timestamps, failed collection does not fabricate data, persisted thresholds and invalid input rejection');
}finally{await rm(dir,{recursive:true,force:true});}
