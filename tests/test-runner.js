/**
 * Minimal browser-based test runner. No build tools needed.
 */
const TestRunner = (() => {
  const suites = [];
  let currentSuite = null;

  function describe(name, fn) {
    const suite = { name, tests: [], beforeEachFn: null };
    suites.push(suite);
    const prev = currentSuite;
    currentSuite = suite;
    fn();
    currentSuite = prev;
  }

  function beforeEach(fn) {
    if (currentSuite) currentSuite.beforeEachFn = fn;
  }

  function it(name, fn) {
    if (currentSuite) currentSuite.tests.push({ name, fn });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  assert.equal = (actual, expected, msg) => {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  assert.deepEqual = (actual, expected, msg) => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
  };

  assert.ok = (val, msg) => {
    if (!val) throw new Error(msg || `Expected truthy, got ${JSON.stringify(val)}`);
  };

  assert.throws = async (fn, msgMatch) => {
    let threw = false;
    let error;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') await result;
    } catch (e) {
      threw = true;
      error = e;
    }
    if (!threw) throw new Error('Expected function to throw');
    if (msgMatch && !error.message.includes(msgMatch)) {
      throw new Error(`Expected error to include "${msgMatch}", got "${error.message}"`);
    }
  };

  assert.includes = (str, substr, msg) => {
    if (!str.includes(substr)) {
      throw new Error(msg || `Expected "${str}" to include "${substr}"`);
    }
  };

  assert.greaterThan = (actual, expected, msg) => {
    if (!(actual > expected)) {
      throw new Error(msg || `Expected ${actual} > ${expected}`);
    }
  };

  async function run() {
    const results = { total: 0, passed: 0, failed: 0, suites: [] };

    for (const suite of suites) {
      const suiteResult = { name: suite.name, tests: [] };
      results.suites.push(suiteResult);

      for (const test of suite.tests) {
        results.total++;
        try {
          if (suite.beforeEachFn) await suite.beforeEachFn();
          await test.fn();
          results.passed++;
          suiteResult.tests.push({ name: test.name, passed: true });
        } catch (err) {
          results.failed++;
          suiteResult.tests.push({ name: test.name, passed: false, error: err.message });
        }
      }
    }

    return results;
  }

  function renderResults(results, container) {
    container.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = `summary ${results.failed === 0 ? 'all-pass' : 'has-fail'}`;
    summary.textContent = `${results.passed}/${results.total} tests passed` +
      (results.failed > 0 ? ` (${results.failed} failed)` : ' - All green!');
    container.appendChild(summary);

    for (const suite of results.suites) {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'suite';

      const titleEl = document.createElement('h2');
      titleEl.textContent = suite.name;
      sectionEl.appendChild(titleEl);

      for (const test of suite.tests) {
        const testEl = document.createElement('div');
        testEl.className = `test ${test.passed ? 'pass' : 'fail'}`;
        testEl.innerHTML = `<span class="indicator">${test.passed ? 'PASS' : 'FAIL'}</span> ${test.name}`;
        if (!test.passed) {
          const errEl = document.createElement('pre');
          errEl.className = 'error';
          errEl.textContent = test.error;
          testEl.appendChild(errEl);
        }
        sectionEl.appendChild(testEl);
      }

      container.appendChild(sectionEl);
    }
  }

  return { describe, beforeEach, it, assert, run, renderResults };
})();
