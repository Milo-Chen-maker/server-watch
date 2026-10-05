import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const aiProviders=sqliteTable('ai_providers',{id:text('id').primaryKey(),data:text('data').notNull()});
export const aiSessions=sqliteTable('ai_sessions',{id:text('id').primaryKey(),data:text('data').notNull()});
