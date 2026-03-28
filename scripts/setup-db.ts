import { getDb } from '../lib/db';

getDb();
console.log('Database setup complete. Run db:seed-entities-checkpoints to load checkpoints.');
// Force exit — getDb() starts the ERP sync scheduler (setImmediate + setInterval) which keeps
// the Node.js event loop alive indefinitely. process.exit ensures this script terminates cleanly.
process.exit(0);
