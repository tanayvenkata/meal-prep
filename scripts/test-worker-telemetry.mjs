// Runs the actual workerd runtime against an authenticated loopback OTLP collector.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const received = [];
const collector = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  received.push({ path: req.url, auth: req.headers.authorization, body });
  res.writeHead(req.headers.authorization === 'Basic fixture==' ? 200 : 401, { 'Content-Type': 'application/json' }).end('{}');
});
await new Promise(resolve => collector.listen(0, '127.0.0.1', resolve));
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const endpoint = `http://127.0.0.1:${collector.address().port}/otlp`;
// No inherited application secrets, production credentials, or remote bindings.
const worker = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev', 'evals/kitchen/worker-telemetry-fixture.ts',
  '--local', '--port', String(port), '--inspector-port', '0',
  '--var', `OTEL_EXPORTER_OTLP_ENDPOINT:${endpoint}`,
  '--var', 'OTEL_EXPORTER_OTLP_HEADERS:Authorization=Basic%20fixture%3D%3D',
  '--var', 'MISE_ENVIRONMENT:development',
], { env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
worker.stdout.on('data', data => { output += data; });
worker.stderr.on('data', data => { output += data; });
try {
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (worker.exitCode !== null) throw new Error('Worker exited before readiness');
    try { response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', signal: AbortSignal.timeout(1000) }); break; }
    catch { await delay(250); }
  }
  assert.equal(response?.status, 401);
  for (let attempt = 0; attempt < 40; attempt++) {
    if (received.some(entry => entry.body.includes('"exception"')) && received.some(entry => entry.path === '/otlp/v1/metrics')) break;
    await delay(100);
  }
  const traces = received.filter(entry => entry.path === '/otlp/v1/traces').map(entry => entry.body).join('\n');
  assert.ok(traces.includes('"rejected"'));
  assert.ok(traces.includes('"exception"'));
  assert.ok(traces.includes('11111111-1111-4111-8111-111111111111'));
  assert.ok(traces.includes('cloudflare-workers'));
  assert.ok(received.some(entry => entry.path === '/otlp/v1/metrics' && entry.body.includes('mise.mcp.requests')));
  for (const entry of received) {
    assert.equal(entry.auth, 'Basic fixture==');
    assert.ok(!entry.body.includes('PRIVATE-worker-kitchen-token-prompt'));
  }
  assert.ok(!output.includes('PRIVATE-worker-kitchen-token-prompt'));
  console.log('Worker OTLP smoke passed: authenticated traces + metrics, rejection + exception, request correlation, payload exclusion.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  worker.kill('SIGTERM');
  await new Promise(resolve => worker.exitCode !== null ? resolve() : worker.once('exit', resolve));
  collector.closeAllConnections();
  await new Promise(resolve => collector.close(resolve));
}
