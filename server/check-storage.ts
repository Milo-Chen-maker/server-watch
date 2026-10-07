import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,link,open,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {StorageService} from './storage-service';
const temp=await mkdtemp(join(tmpdir(),'watch-storage-')),root=join(temp,'root');
process.env.SERVER_WATCH_DATA_DIR=join(temp,'cache');
await mkdir(root);await mkdir(join(root,'child'));await writeFile(join(root,'child','data'),'a'.repeat(13000));await link(join(root,'child','data'),join(root,'hardlink'));
const sparse=await open(join(root,'sparse'),'w');await sparse.truncate(10000000);await sparse.close();await symlink('/etc',join(root,'outside'));
const service=new StorageService([root]);
const finish=async(s:StorageService,id:string)=>{for(let n=0;n<200;n++){const j=s.status(id);if(!['queued','running'].includes(j.status))return j;await delay(20);}throw Error('scan did not finish');};
try{
 assert.equal((await service.roots())[0].available,true);
 const list=await service.list(root,0,2);assert.equal(list.entries.length,2);assert.equal(list.hasMore,true);assert.equal(list.entries[0].type,'directory');
 await assert.rejects(service.list('/etc'));await assert.rejects(service.list(join(root,'outside')));
 const [a,b]=await Promise.all([service.scan(root,true),service.scan(root,true)]);assert.equal(a.id,b.id,'concurrent scans must share one job');
 const done=await finish(service,a.id);assert.equal(done.status,'complete');const expected=Number(execFileSync('du',['-sx','-B1',root],{encoding:'utf8'}).split(/\s/)[0]);assert.equal(done.totalBytes,expected,'allocated bytes match independent GNU du including hardlink dedup and sparse file');
 assert.equal(done.rows.find(r=>r.path.endsWith('/sparse'))?.bytes,0);assert.ok(done.rows.every(r=>!r.path.includes('/etc/')));
 const reloaded=new StorageService([root]);try{const cache=await reloaded.cached(root);assert.equal(cache?.cached,true);assert.equal(cache?.totalBytes,expected);}finally{await reloaded.stop();}
 await mkdir(join(root,'denied'));await writeFile(join(root,'denied','hidden'),'content');await chmod(join(root,'denied'),0);
 try{const partial=await finish(service,(await service.scan(root,true)).id);assert.equal(partial.status,'partial');assert.ok(partial.errors>0);}finally{await chmod(join(root,'denied'),0o700);}
 const active=await service.scan(root,true);assert.equal((await service.cancel(active.id)).status,'cancelled');
 const timeout=new StorageService([root],1);try{const timed=await finish(timeout,(await timeout.scan(root,true)).id);assert.equal(timed.status,'partial');assert.ok(timed.error?.includes('两分钟'));}finally{await timeout.stop();}
 console.log('STORAGE_CHECK_PASS: boundaries, no symlink traversal, du oracle, sparse files, hardlinks, concurrency, cache reload, permissions, cancel, timeout');
}finally{await service.stop();await rm(temp,{recursive:true,force:true});}
