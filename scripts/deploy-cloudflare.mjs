import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const optional = ['RESEND_API_KEY', 'FEEDBACK_DIGEST_TO', 'FEEDBACK_DIGEST_FROM'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());

if (missing.length) {
  console.error(`Missing Cloudflare Build Secrets: ${missing.join(', ')}`);
  process.exit(1);
}

const secrets = Object.fromEntries(
  [...required, ...optional]
    .filter((name) => String(process.env[name] || '').trim())
    .map((name) => [name, String(process.env[name]).trim()]),
);
const secretsFile = join(tmpdir(), `future-planner-secrets-${process.pid}.json`);

await writeFile(secretsFile, JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 });

try {
  const child = spawn('npx', ['wrangler', 'deploy', '--secrets-file', secretsFile], {
    stdio: 'inherit',
    // Node 24 on Windows cannot spawn .cmd shims directly with shell:false.
    // All arguments here are fixed except our own random temp-file path.
    shell: process.platform === 'win32',
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await unlink(secretsFile).catch(() => {});
}
