import {z} from 'zod';
export const inferenceOutput=z.object({hypothesis:z.string().trim().min(1).max(600),confidence:z.enum(['low','medium']),limitations:z.array(z.string().max(300)).max(8)}).strict();
export type ProcessInference=z.infer<typeof inferenceOutput>&{pid:number;startedAt?:string;source:'ai-inference';evidence:string[];snapshotId:string;capturedAt:string;generatedAt:string;expiresAt:string;model:string;providerId:string;cached?:boolean};
