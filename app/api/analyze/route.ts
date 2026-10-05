import { z } from 'zod';
import { analysisAdapter } from '@/lib/adapters';
import { snapshotSchema, thresholdsSchema } from '@/lib/monitoring';
const schema=z.object({snapshot:snapshotSchema,thresholds:thresholdsSchema}).strict();
export async function POST(request: Request) {
  if(Number(request.headers.get('content-length')??0)>100000)return Response.json({error:'请求过大'},{status:413});
  try { const raw=await request.text(); if(raw.length>100000)return Response.json({error:'请求过大'},{status:413}); const parsed=schema.safeParse(JSON.parse(raw)); if(!parsed.success)return Response.json({error:'数据或阈值格式无效'},{status:400});return Response.json(await analysisAdapter.analyze(parsed.data.snapshot,parsed.data.thresholds),{headers:{'Cache-Control':'no-store'}}); } catch {return Response.json({error:'分析请求失败，请检查数据后重试'},{status:400});}
}
