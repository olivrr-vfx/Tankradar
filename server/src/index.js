#!/usr/bin/env node
import { createApp } from './app.js';
import { startCollector } from './collector.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createClient } from './tankerkoenig.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const client = config.apiKey ? createClient(config) : null;
if (!client) console.warn('TANKERKOENIG_API_KEY is not set – the server only serves already collected data.');

const server = createApp({ db, client, config });
server.listen(config.port, config.host, () => console.log(`Tankradar server listening on http://${config.host}:${config.port}`));
const stop = startCollector({ db, client, config });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
