import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = 'future-companion-windows-v0.6.2.zip';
const expectedSha256 = '0F608BEEAFAB4BCD3F11ABE2993C6A2A2318D329628C57FD08DBAA29A76880AE';
const zipPath = path.join(root, 'public', 'downloads', filename);
const viewSource = fs.readFileSync(path.join(root, 'src', 'view-radio.jsx'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

console.log('companion-package.test:');
assert.equal(fs.existsSync(zipPath), true, `${filename} is missing`);
const zip = fs.readFileSync(zipPath);
assert.equal(crypto.createHash('sha256').update(zip).digest('hex').toUpperCase(), expectedSha256);
assert.ok(zip.length > 0 && zip.length < 25 * 1024 * 1024, 'package must fit Cloudflare static asset limits');
assert.match(viewSource, new RegExp(filename.replaceAll('.', '\\.')));
assert.match(viewSource, new RegExp(expectedSha256));
assert.match(readme, new RegExp(expectedSha256));
console.log(`companion-package.test: ${filename} · ${zip.length} bytes · checksum verified\n`);
