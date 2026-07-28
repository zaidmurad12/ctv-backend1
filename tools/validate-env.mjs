import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const requiredKeys = [
  'APP_NAME',
  'APP_ENV',
  'APP_PORT',
  'APP_HOST',
  'APP_URL',
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'TMDB_API_KEY',
  'CINEMANA_BASE_URL',
];

const envPath = path.join(rootDir, '.env');
const examplePath = path.join(rootDir, '.env.example');

if (!existsSync(examplePath)) {
  console.error('Missing .env.example file.');
  process.exit(1);
}

const exampleContent = readFileSync(examplePath, 'utf8');
const exampleKeys = new Set(
  exampleContent
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => line.split('=')[0].trim()),
);

const missingInExample = requiredKeys.filter((key) => !exampleKeys.has(key));
if (missingInExample.length > 0) {
  console.error(`Missing required keys in .env.example: ${missingInExample.join(', ')}`);
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.warn(
    'No .env file found. Environment validation scaffold is ready for runtime configuration.',
  );
  process.exit(0);
}

const envContent = readFileSync(envPath, 'utf8');
const envKeys = new Set(
  envContent
    .split(/\r?\n/)
    .filter((line) => line.includes('='))
    .map((line) => line.split('=')[0].trim()),
);

const missingInEnv = requiredKeys.filter((key) => !envKeys.has(key));
if (missingInEnv.length > 0) {
  console.warn(`Missing required keys in .env: ${missingInEnv.join(', ')}`);
}

console.log('Environment validation architecture is ready.');
