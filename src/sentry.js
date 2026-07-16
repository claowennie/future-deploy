import * as Sentry from '@sentry/react';

const dsn = String(window.__FUTURE_PUBLIC_CONFIG__?.sentryDsn || import.meta.env.VITE_SENTRY_DSN || '').trim();
const SECRET_FIELD = /authorization|api.?key|deepseek|tts|mini.?max|google.*key|token|password|cookie/i;
const DEEPSEEK_KEY = /\bsk-[A-Za-z0-9_-]{10,}\b/g;

function scrubSecrets(value, key = '') {
  if (SECRET_FIELD.test(key)) return '[Filtered]';
  if (typeof value === 'string') return value.replace(DEEPSEEK_KEY, '[Filtered DeepSeek key]');
  if (Array.isArray(value)) return value.map((item) => scrubSecrets(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, scrubSecrets(childValue, childKey)]),
    );
  }
  return value;
}

Sentry.init({
  dsn,
  enabled: import.meta.env.PROD && Boolean(dsn),
  sendDefaultPii: false,
  beforeSend(event) {
    return scrubSecrets(event);
  },
});

export { Sentry };
