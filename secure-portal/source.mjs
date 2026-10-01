import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
export const sourceDirectory=path.resolve(root,'..');
export const snapshot={repository:'https://github.com/xginini-dot/jinsul',commit:process.env.CF_PAGES_COMMIT_SHA||process.env.CI_COMMIT_SHA||'1c9ccbb2fe5d5f53bd0a51bcf51916eca3d32026'};
await readFile(path.join(sourceDirectory,'hira-prices.json'));
