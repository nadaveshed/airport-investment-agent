import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, NATIONAL_FIRST_CLAIMS } from '../../scripts/evalChecks.js';

test('evaluation rejects empty answers and incorrect values even when tool selection passed', () => {
  assert.match(checkAnswer('   ')!, /non-empty/);
  assert.match(checkAnswer('SFO scores 82.8.', { numbers: [82.7] })!, /82.7/);
  assert.equal(
    checkAnswer('**82.70**, with 274,751 passengers.', { numbers: [82.7, 274751] }),
    null,
  );
});

test('evaluation catches the actual SFO national-first hallucination', () => {
  const checks = { numbers: [82.7], terms: [/proxy/i], forbiddenClaims: NATIONAL_FIRST_CLAIMS };
  assert.match(
    checkAnswer(
      'SFO scores 82.7 on the proxy — the top score among all 396 tracked US airports.',
      checks,
    )!,
    /unsupported/,
  );
  assert.match(
    checkAnswer('SFO is nationally #1 with a proxy score of 82.7.', checks)!,
    /unsupported/,
  );
  assert.equal(
    checkAnswer(
      'SFO scores 82.7 on the proxy, nationally 16 of 396; first of 1 selected airport.',
      checks,
    ),
    null,
  );
  assert.equal(
    checkAnswer(
      'SFO scores 82.7 on the proxy, ranked 16 of 396. Its NAS delay rate is near the top of the national distribution.',
      checks,
    ),
    null,
  );
});

test('evaluation requires stated limitations, not just the right number', () => {
  assert.match(checkAnswer('SFO: 82.7.', { terms: [/proxy/i] })!, /explanation/);
});
