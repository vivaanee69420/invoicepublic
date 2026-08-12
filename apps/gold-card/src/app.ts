import express from 'express';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { Db } from './db.js';
import { Config } from './config.js';

export interface AppDeps {
  db: Db;
  config: Config;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/', publicRoutes(deps));
  app.use('/', adminRoutes(deps));

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
