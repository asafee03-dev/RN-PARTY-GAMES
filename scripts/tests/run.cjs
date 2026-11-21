/* global __dirname */
// Logic tests with a mocked Firestore and storage: no network, no Firebase
// project involved. Loads the real src/ modules through the project's Babel.
// Run: npm run test:logic
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const babel = require(path.join(ROOT, 'node_modules/@babel/core'));
const SRC = path.join(ROOT, 'src');
const origJs = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
  if (filename.startsWith(SRC)) {
    const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [path.join(ROOT, 'node_modules/@babel/plugin-transform-modules-commonjs')],
    });
    return mod._compile(code, filename);
  }
  return origJs(mod, filename);
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
module.exports = { test, assert, eq, ROOT };

for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.cjs')).sort()) require(path.join(__dirname, f));

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`❌ ${t.name}\n   ${e.message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
