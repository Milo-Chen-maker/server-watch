import { questionSchema } from '@/lib/questions';
import { questionAdapter } from '@/lib/adapters';
export async function POST(request:Request){
  try{const body=await request.text();if(body.length>100000)return Response.json({error:'请求过大'},{status:413});const parsed=questionSchema.safeParse(JSON.parse(body));if(!parsed.success)return Response.json({error:'问题或监控数据无效，请检查后重试'},{status:400});return Response.json(await questionAdapter.answer(parsed.data),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'提问失败，请重试'},{status:503});}
}
