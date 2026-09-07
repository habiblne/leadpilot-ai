'use strict';

const { inspectN8nConfig } = require('../lib/server-config');

module.exports = function health(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ status: 'method_not_allowed' }));
  }

  const config = inspectN8nConfig();
  const body = {
    status: config.ready ? 'ok' : 'not_ready',
    n8nConfigured: config.n8nConfigured,
    secretConfigured: config.secretConfigured,
  };

  res.statusCode = config.ready ? 200 : 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(body));
};
