#!/usr/bin/env node
/** Run with: doppler run -p mise-observability -c prd -- node scripts/grafana.mjs <command> */
import { readFile } from 'node:fs/promises';
const base = process.env.GRAFANA_URL;
const token = process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN;
if (!base || !token) throw new Error('Run through Doppler mise-observability/prd to load Grafana credentials.');
async function api(path, body) {
  const response = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Grafana returned HTTP ${response.status} for ${path.split('?')[0]}`);
  return response.json();
}
const [command = 'status', ...args] = process.argv.slice(2);
if (command === 'status') {
  const sources = await api('/api/datasources');
  console.log(JSON.stringify({ url: base, datasources: sources.map(({ uid, name, type }) => ({ uid, name, type })) }, null, 2));
} else if (command === 'dashboard') {
  const sources = await api('/api/datasources');
  const prometheus = sources.find(s => s.uid === 'grafanacloud-prom');
  if (!prometheus) throw new Error('Expected Grafana Cloud Prometheus datasource is missing.');
  let dashboard = JSON.parse(await readFile(new URL('../observability/mcp-dashboard.json', import.meta.url), 'utf8'));
  dashboard = JSON.parse(JSON.stringify(dashboard).replaceAll('${DS_PROMETHEUS}', prometheus.uid));
  delete dashboard.__inputs;
  const result = await api('/api/dashboards/db', { dashboard, overwrite: true, message: 'Sync Mise observability dashboard from repository' });
  console.log(JSON.stringify({ status: result.status, url: new URL(result.url, base).href }, null, 2));
} else if (command === 'metrics') {
  const query = args.join(' ') || 'mise_kitchen_operations_total';
  console.log(JSON.stringify(await api('/api/datasources/proxy/uid/grafanacloud-prom/api/v1/query?' + new URLSearchParams({ query })), null, 2));
} else if (command === 'traces') {
  const q = args.join(' ') || '{ resource.service.name = "mise-kitchen" }';
  console.log(JSON.stringify(await api('/api/datasources/proxy/uid/grafanacloud-traces/api/search?' + new URLSearchParams({ q, limit: '20', start: String(Math.floor(Date.now() / 1000) - 3600), end: String(Math.floor(Date.now() / 1000)) })), null, 2));
} else if (command === 'trace' && /^[a-f0-9]{32}$/.test(args[0] ?? '')) {
  console.log(JSON.stringify(await api('/api/datasources/proxy/uid/grafanacloud-traces/api/traces/' + args[0]), null, 2));
} else {
  throw new Error('Commands: status, dashboard, metrics [PromQL], traces [TraceQL], trace <trace-id>');
}
