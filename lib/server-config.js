'use strict';

const MIN_SECRET_LENGTH = 32;

function inspectN8nConfig(env = process.env) {
  const rawUrl = typeof env.N8N_WEBHOOK_URL === 'string' ? env.N8N_WEBHOOK_URL.trim() : '';
  const secret = typeof env.N8N_WEBHOOK_SECRET === 'string' ? env.N8N_WEBHOOK_SECRET : '';
  let webhookUrl = null;

  try {
    const candidate = new URL(rawUrl);
    const isLocalHttp = candidate.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname);
    const hasEmbeddedCredentials = Boolean(candidate.username || candidate.password);
    if (!hasEmbeddedCredentials && (candidate.protocol === 'https:' || isLocalHttp)) webhookUrl = candidate;
  } catch {
    webhookUrl = null;
  }

  const secretConfigured = secret.length >= MIN_SECRET_LENGTH && secret.trim() === secret;
  return {
    ready: Boolean(webhookUrl) && secretConfigured,
    n8nConfigured: Boolean(webhookUrl),
    secretConfigured,
    value: webhookUrl && secretConfigured ? { webhookUrl, webhookSecret: secret } : null,
  };
}

module.exports = {
  MIN_SECRET_LENGTH,
  inspectN8nConfig,
};
