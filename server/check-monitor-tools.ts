import assert from 'node:assert/strict';
import {monitoringTools} from './monitor-tools';
import {createMockSnapshot,defaults} from '../contracts/monitoring';
const snapshot=createMockSnapshot('critical');snapshot.capacityUnit='GiB';snapshot.capturedAt='2026-10-06T16:00:00.000Z';
snapshot.processes=[{gpuId:0,pid:123,user:'alice',command:'python',task:'未知用途',taskSource:'unknown',memoryUsed:10},{gpuId:2,pid:123,user:'alice',command:'python',task:'未知用途',taskSource:'unknown',memoryUsed:20},{gpuId:4,pid:456,user:'bob',command:'worker',task:'训练',memoryUsed:50}];
snapshot.disks=[{mount:'/data',used:90,total:100,available:5}];
const tools=monitoringTools(snapshot,{...defaults,enabled:false});
async function run(name:string,args:Record<string,unknown>={}){const tool=tools.find(t=>t.name===name)!;const r=await tool.execute('test',args,new AbortController().signal);return JSON.parse((r.content[0] as {text:string}).text);}
const processes=await run('get_processes',{pid:123,limit:1});assert.equal(processes.total,2);assert.equal(processes.uniqueProcessCount,1);assert.equal(processes.attributedMemoryUsed,30);assert.equal(processes.items[0].gpuId,2);assert.equal(processes.hasMore,true);
assert.equal((await run('get_processes',{pid:123,offset:1,limit:1})).items[0].gpuId,0);assert.equal((await run('get_processes',{user:'alice',gpuId:2,pid:123})).total,1);assert.equal((await run('get_processes',{user:'absent'})).dataAvailable,true);assert.equal((await run('get_processes',{user:'absent'})).total,0);
const users=await run('get_users');assert.equal(users.total,2);assert.equal(users.items[0].user,'bob');assert.equal(users.items[1].processCount,1);assert.equal(users.items[1].memoryUsed,30);assert.deepEqual(users.items[1].gpuIds,[0,2]);assert.equal(users.uniqueProcessCount,2);assert.equal((await run('get_users',{user:'alice'})).total,1);
const disk=await run('get_storage',{mount:'/data'});assert.equal(disk.disks[0].available,5);assert.equal(disk.disks[0].free,10);assert.equal(disk.disks[0].usagePercent,90);assert.equal(disk.disks[0].thresholdExceeded,true);assert.equal(disk.alertsEnabled,false);
const paused=await run('get_alerts');assert.equal(paused.alerts.length,0);assert.ok(paused.risks.length);assert.equal(paused.notificationSent,false);assert.equal(paused.capacityUnit,'GiB');assert.equal(paused.snapshotId,snapshot.id);assert.equal(paused.stale,true);assert.equal(paused.capturedAtBeijing,'2026/10/7 00:00:00 UTC+8');
assert.equal((await run('get_alerts',{resource:'/data',severity:'warning'})).risks.length,1);
const active=monitoringTools(snapshot,defaults).find(t=>t.name==='get_alerts')!;const enabled=JSON.parse(((await active.execute('test',{},new AbortController().signal)).content[0] as {text:string}).text);assert.deepEqual(enabled.alerts,enabled.risks);
await assert.rejects(run('get_gpu',{gpuId:63}));await assert.rejects(run('get_processes',{gpuId:63}));await assert.rejects(run('get_storage',{mount:'/not-a-mount'}));
const noProcesses=monitoringTools({...snapshot,processes:undefined},defaults);for(const name of ['get_processes','get_users']){const r=await noProcesses.find(t=>t.name===name)!.execute('test',{});const d=JSON.parse((r.content[0] as {text:string}).text);assert.equal(d.dataAvailable,false);assert.equal(d.total,0);}
const cancelled=new AbortController();cancelled.abort();for(const tool of tools)await assert.rejects(tool.execute('test',tool.name==='get_gpu'?{gpuId:0}:{},cancelled.signal));
const crowded={...snapshot,processes:[...snapshot.processes!,...Array.from({length:21},(_,i)=>({gpuId:4,pid:1000+i,user:'bob',command:'worker',task:'未知用途',memoryUsed:1}))]};
const summary=JSON.parse(((await monitoringTools(crowded,defaults).find(t=>t.name==='get_gpu')!.execute('test',{gpuId:4})).content[0] as {text:string}).text);assert.equal(summary.processCount,22);assert.equal(summary.processes.length,20);assert.equal(summary.processesTruncated,true);assert.equal(summary.processes[0].pid,456);
console.log('MONITOR_TOOLS_PASS: filters, pagination, cross-GPU PID deduplication, ranking, available/free disk capacity, paused alerts, metadata, missing data and abort');
