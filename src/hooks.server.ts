import type { ServerInit } from '@sveltejs/kit/hooks';
import { connectDb } from '#lib/server/db.ts';

export const init: ServerInit = connectDb;
