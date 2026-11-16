import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCloud, handle } from '../src/cloud/handler.ts';

// Vercel entry point for everything that is not a static page.
const cloud = createCloud();

export const config = { api: { bodyParser: false } };

export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handle(cloud, req, res);
}
