'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const requiredFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'shared/qualification.js',
  'api/qualify.js',
  'api/health.js',
  'lib/server-config.js',
  'vercel.json',
];

for (const file of requiredFiles) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
    throw new Error(`Missing required production file: ${file}`);
  }
}

JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
require(path.join(process.cwd(), 'api/qualify.js'));

for (const file of [
  'app.js',
  'api/qualify.js',
  'api/health.js',
  'lib/input-validation.js',
  'lib/server-config.js',
  'shared/qualification.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(process.cwd(), file)], { stdio: 'pipe' });
}

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(process.cwd(), 'app.js'), 'utf8');
if (!html.includes('./shared/qualification.js') || html.indexOf('./shared/qualification.js') > html.indexOf('./app.js')) {
  throw new Error('The browser response normalizer must load before app.js.');
}
if (!app.includes("fetch('/api/qualify'")) {
  throw new Error('The frontend must submit through /api/qualify.');
}
if (html.includes('config.js') || /https?:\/\/[^\s'\"]*n8n/i.test(html + app)) {
  throw new Error('Browser assets must not contain an n8n endpoint.');
}

console.log('Production artifact verification passed.');
