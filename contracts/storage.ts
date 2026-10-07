export type StorageEntry={name:string;path:string;type:'directory'|'file'|'symlink'|'other';modifiedAt?:string;allocatedBytes?:number;apparentBytes?:number;mount?:boolean;readable:boolean};
export type StorageListing={path:string;root:string;parent?:string;entries:StorageEntry[];offset:number;total:number;hasMore:boolean;truncated:boolean;capturedAt:string};
export type StorageRoot={path:string;available:boolean;totalBytes?:number;freeBytes?:number;availableBytes?:number};
export type StorageScanRow={path:string;bytes:number;apparentBytes:number;complete:boolean;errors:number;skippedMount:boolean};
export type StorageJob={id:string;path:string;status:'queued'|'running'|'complete'|'partial'|'cancelled'|'failed';createdAt:string;updatedAt:string;finishedAt?:string;rows:StorageScanRow[];totalBytes?:number;rootBytes?:number;errors:number;error?:string;cached?:boolean};
