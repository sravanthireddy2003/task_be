// test/workflow.test.js
const assert = require('assert');
const { STATES, canTransition } = require(__root + 'workflow/workflowEngine');

describe('workflowEngine', () => {
  it('allows valid transitions', () => {
    assert.strictEqual(canTransition(STATES.DRAFT, STATES.SUBMITTED), true);
    assert.strictEqual(canTransition(STATES.SUBMITTED, STATES.IN_REVIEW), true);
    assert.strictEqual(canTransition(STATES.IN_REVIEW, STATES.APPROVED), true);
  });

  it('rejects invalid transitions', () => {
    assert.strictEqual(canTransition(STATES.APPROVED, STATES.IN_REVIEW), false);
    assert.strictEqual(canTransition(STATES.CLOSED, STATES.DRAFT), false);
  });
});
