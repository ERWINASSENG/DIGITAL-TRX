import { cpSync, existsSync } from 'node:fs';

if (existsSync('dist/browser')) {
  cpSync('dist/browser', 'dist', { recursive: true });
}
