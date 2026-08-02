import { createRequire } from 'module';

// Keep a single source of truth for agent runtime logic in index.cjs.
const require = createRequire(import.meta.url);
require('./index.cjs');
