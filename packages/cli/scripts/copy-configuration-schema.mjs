import { copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

await copyFile(
  join(packageDirectory, 'configuration.schema.json'),
  join(packageDirectory, 'dist', 'configuration.schema.json'),
);
