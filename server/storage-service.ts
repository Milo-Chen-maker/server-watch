import {opendir,lstat,realpath,statfs,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import type {StorageRoot,StorageEntry,StorageListing,StorageJob} from '../contracts/storage';

export class StorageService {
 private jobs=new Map<string,StorageJob>();private active?:{job:StorageJob;child:ChildProcess};private pending:string[]=[];private stopped=false;private pumping=false;
 private cache=resolve(process.env.SERVER_WATCH_DATA_DIR??'server-data','storage-cache');
 constructor(private configured:string[]=JSON.parse(process.env.SERVER_WATCH_STORAGE_ROOTS??'["/data"]'),private timeoutMs=120000){if(!Array.isArray(configured)||!configured.length||configured.some(p=>typeof p!=='string'||!isAbsolute(p)))throw Error('存储根目录配置无效');this.configured=configured.map(p=>resolve(p));}
 async roots():Promise<StorageRoot[]>{return Promise.all(this.configured.map(async path=>{try{await this.validate(path);const info=await statfs(path);return {path,available:true,totalBytes:info.blocks*info.bsize,freeBytes:info.bfree*info.bsize,availableBytes:info.bavail*info.bsize};}catch{return {path,available:false};}}));}
 private async validate(value:string){
  if(!isAbsolute(value)||value.includes('\0'))throw Error('目录路径无效');const path=resolve(value),root=this.configured.filter(r=>path===r||(!(relative(r,path)==='..'||relative(r,path).startsWith('../')||relative(r,path).startsWith('..\\'))&&!isAbsolute(relative(r,path)))).sort((a,b)=>b.length-a.length)[0];if(!root)throw Error('目录不在允许浏览的根目录内');
  if(await realpath(root)!==root)throw Error('根目录不能是符号链接');let current=root;
  for(const part of [undefined,...relative(root,path).split(/[\\/]/).filter(Boolean)]){if(part)current=join(current,part);const info=await lstat(current);if(info.isSymbolicLink()||!info.isDirectory())throw Error('仅可浏览真实目录，不跟随符号链接');}
  if(await realpath(path)!==path)throw Error('目录已发生变化，请刷新');return {path,root};
 }
 async list(value:string,offset=0,limit=100):Promise<StorageListing>{
  const {path,root}=await this.validate(value),parentStat=await lstat(path),entries:StorageEntry[]=[];let truncated=false;
  const directory=await opendir(path);for await(const entry of directory){if(entries.length>=10000){truncated=true;break;}const child=join(path,entry.name);try{const info=await lstat(child);entries.push({name:entry.name,path:child,type:info.isSymbolicLink()?'symlink':info.isDirectory()?'directory':info.isFile()?'file':'other',modifiedAt:info.mtime.toISOString(),allocatedBytes:info.isDirectory()?undefined:info.blocks*512,apparentBytes:info.isDirectory()?undefined:info.size,mount:info.dev!==parentStat.dev,readable:true});}catch{entries.push({name:entry.name,path:child,type:'other',readable:false});}}
  if(await realpath(path)!==path)throw Error('目录已发生变化，请刷新');entries.sort((a,b)=>Number(b.type==='directory')-Number(a.type==='directory')||a.name.localeCompare(b.name));return {path,root,parent:path===root?undefined:dirname(path),entries:entries.slice(offset,offset+limit),offset,total:entries.length,hasMore:offset+limit<entries.length,truncated,capturedAt:new Date().toISOString()};
 }
 private key(path:string){return createHash('sha256').update(path).digest('hex');}
 async scan(value:string,refresh=false):Promise<StorageJob>{
  const {path,root}=await this.validate(value);if(this.stopped)throw Error('目录统计服务已停止');const existing=[...this.jobs.values()].find(j=>j.path===path&&['queued','running'].includes(j.status));if(existing)return structuredClone(existing);
  if(!refresh){const cached=await this.cached(path);if(cached)return cached;}
  const concurrent=[...this.jobs.values()].find(j=>j.path===path&&['queued','running'].includes(j.status));if(concurrent)return structuredClone(concurrent);if(this.stopped)throw Error('目录统计服务已停止');
  if(this.pending.length>=10)throw Error('统计队列已满，请等待当前任务完成');if(this.jobs.size>=100){for(const [id,job] of this.jobs)if(!['queued','running'].includes(job.status)){this.jobs.delete(id);break;}if(this.jobs.size>=100)throw Error('统计记录已满，请稍后重试');}
  const job:StorageJob={id:crypto.randomUUID(),path,status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),rows:[],errors:0};this.jobs.set(job.id,job);this.pending.push(job.id);void this.pump();return structuredClone(job);
 }
 async cached(value:string):Promise<StorageJob|undefined>{const {path}=await this.validate(value);const active=[...this.jobs.values()].find(j=>j.path===path&&['queued','running'].includes(j.status));if(active)return structuredClone(active);try{const cached=JSON.parse(await readFile(join(this.cache,this.key(path)+'.json'),'utf8')) as StorageJob;if(cached.path===path&&cached.finishedAt&&Date.now()-Date.parse(cached.finishedAt)<900000&&['complete','partial'].includes(cached.status)&&Array.isArray(cached.rows)){cached.cached=true;if(this.jobs.size>=100)for(const [id,j] of this.jobs)if(!['queued','running'].includes(j.status)){this.jobs.delete(id);break;}this.jobs.set(cached.id,cached);return structuredClone(cached);}}catch{}return undefined;}
 status(id:string){const job=this.jobs.get(id);if(!job)throw Error('统计任务不存在或已过期');return structuredClone(job);}
 cancel(id:string){const job=this.jobs.get(id);if(!job)throw Error('统计任务不存在');if(['queued','running'].includes(job.status)){job.status='cancelled';job.finishedAt=new Date().toISOString();job.updatedAt=job.finishedAt;if(this.active?.job.id===id)this.active.child.kill('SIGTERM');this.pending=this.pending.filter(i=>i!==id);}return structuredClone(job);}
 async stop(){this.stopped=true;for(const job of this.jobs.values())if(['queued','running'].includes(job.status))this.cancel(job.id);const child=this.active?.child;if(child)await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once('close',()=>resolve());});}
 private async pump(){
  if(this.active||this.stopped||this.pumping)return;const id=this.pending.shift();if(!id)return;this.pumping=true;const job=this.jobs.get(id)!;
  let target;try{target=await this.validate(job.path);}catch{job.status='failed';job.error='目录已变化或不可读取';job.finishedAt=new Date().toISOString();this.pumping=false;void this.pump();return;}
  if(this.stopped||job.status==='cancelled'){this.pumping=false;void this.pump();return;}job.status='running';
  const child=spawn(process.env.SERVER_WATCH_PYTHON??'python3',[fileURLToPath(new URL('./storage_scan.py',import.meta.url)),target.path,target.root],{stdio:['ignore','pipe','ignore']});this.active={job,child};this.pumping=false;let buffer='',done=false,failed=false;
  const timer=setTimeout(()=>{if(job.status==='running'){job.status='partial';job.error='扫描超过两分钟，保留已统计的部分目录；请展开更小目录统计';child.kill('SIGTERM');}},this.timeoutMs);
  child.stdout?.setEncoding('utf8');child.stdout?.on('data',(chunk:string)=>{buffer+=chunk;if(buffer.length>2_000_000){failed=true;child.kill('SIGTERM');return;}const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines){try{const event=JSON.parse(line);if(event.type==='row'){const index=job.rows.findIndex(r=>r.path===event.row.path);if(index<0)job.rows.push(event.row);else job.rows[index]=event.row;}if(event.type==='done'){done=true;job.totalBytes=event.totalBytes;job.rootBytes=event.rootBytes;job.errors=event.errors;}if(event.type==='error'){failed=true;job.error=event.error;}job.updatedAt=new Date().toISOString();}catch{failed=true;child.kill('SIGTERM');}}});
  child.once('error',()=>{failed=true;job.error='Python 扫描器无法启动';});
  child.once('close',async code=>{clearTimeout(timer);if(!done)job.errors=job.rows.reduce((sum,r)=>sum+r.errors,0);if(job.status==='running')job.status=done&&!failed&&code===0?(job.errors?'partial':'complete'):'failed';job.finishedAt=new Date().toISOString();job.updatedAt=job.finishedAt;
   if(done&&['complete','partial'].includes(job.status))try{await mkdir(this.cache,{recursive:true,mode:0o700});const file=join(this.cache,this.key(job.path)+'.json'),temp=file+'.tmp';await writeFile(temp,JSON.stringify(job),{mode:0o600});await rename(temp,file);}catch{job.error='统计完成，缓存保存失败';}
   this.active=undefined;void this.pump();
  });
 }
}
