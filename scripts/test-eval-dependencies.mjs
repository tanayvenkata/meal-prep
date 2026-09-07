import assert from 'node:assert/strict';

// Exercise the same Promptfoo extension points as evals/kitchen/run.ts without
// API calls or a database. Optional provider removals must preserve this path.
process.env.PROMPTFOO_DISABLE_TELEMETRY = '1';
process.env.PROMPTFOO_DISABLE_UPDATE = '1';

const { evaluate } = await import('promptfoo');
const result = await evaluate({
  description: 'Kitchen evaluation dependency smoke test',
  writeLatestResults: false,
  prompts: ['{{scenarioId}}'],
  providers: [{
    id: () => 'kitchen-dependency-smoke',
    callApi: async (prompt) => ({ output: { acceptancePass: prompt === 'pass' } }),
  }],
  tests: ['pass', 'fail'].map((scenarioId) => ({
    vars: { scenarioId },
    assert: [{ type: 'javascript', value: 'output.acceptancePass === true' }],
  })),
}, { maxConcurrency: 1, cache: false });

const summary = await result.toEvaluateSummary();
assert.equal(summary.stats.successes, 1);
assert.equal(summary.stats.failures, 1);
assert.equal(summary.stats.errors, 0);
console.log('Kitchen evaluation dependency smoke test passed.');
process.exit(0);
