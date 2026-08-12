import fs from 'fs';
import path from 'path';

export interface Config {
  port: number;
  baseUrl: string;
  adminApiKey: string;
  dbPath: string;
  ghlApiToken: string | null;
  ghlLocationId: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = parseInt(env.PORT || '3000', 10);
  let baseUrl = env.BASE_URL || 'http://localhost:3000';
  baseUrl = baseUrl.replace(/\/$/, '');

  const adminApiKey = env.ADMIN_API_KEY || 'change-me';
  if (adminApiKey === 'change-me') {
    console.warn('[gold-card] ADMIN_API_KEY is not set; using default value "change-me"');
  }

  const dbPath = env.DB_PATH || 'data/goldcard.db';
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const ghlApiToken = env.GHL_API_TOKEN ? env.GHL_API_TOKEN : null;
  const ghlLocationId = env.GHL_LOCATION_ID ? env.GHL_LOCATION_ID : null;

  return {
    port,
    baseUrl,
    adminApiKey,
    dbPath,
    ghlApiToken,
    ghlLocationId,
  };
}
