import {createServer} from './app';
const port=Number(process.env.PORT??3000);
const app=createServer();
await app.listen({port,host:process.env.HOST??'127.0.0.1'});
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void app.close();});
