// In-browser code execution for coding assessments. Everything runs
// client-side in sandboxed Web Workers — no server round-trip, no paid API,
// no third-party execution service. A student's infinite loop or crash can
// only ever kill its own worker, never freeze the page.

const PYODIDE_CDN_VERSION = 'v0.26.4';
const PYODIDE_CDN_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_CDN_VERSION}/full/pyodide.js`;

// The Python worker is expensive to spin up (loads ~6MB of wasm), so it's
// cached and reused across runs. A timeout forcibly terminates it, so the
// cache is cleared in that case and rebuilt fresh on the next call.
let pyWorker = null;
let pyWorkerReady = null;

function buildPyWorkerSource() {
  return `
    self.onmessage = async (e) => {
      const { type, code, stdin, requestId } = e.data;

      if (type === 'init') {
        try {
          importScripts(${JSON.stringify(PYODIDE_CDN_URL)});
          self.pyodideInstance = await loadPyodide();
          self.postMessage({ type: 'ready' });
        } catch (err) {
          self.postMessage({ type: 'init_error', message: String(err && err.message || err) });
        }
        return;
      }

      if (type === 'run') {
        const pyodide = self.pyodideInstance;
        try {
          // Pyodide has already finished loading (needed fetch for that) —
          // strip network/storage APIs before running student code so it
          // can't exfiltrate data via 'from js import fetch' or reach this
          // origin's IndexedDB (Workers are same-origin, not sandboxed from it).
          try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.indexedDB = undefined; } catch {}
          const lines = (stdin || '').split('\\n');
          let idx = 0;
          let stdout = '';
          let stderr = '';
          pyodide.setStdin({ stdin: () => (idx < lines.length ? lines[idx++] : undefined) });
          pyodide.setStdout({ batched: (s) => { stdout += s + '\\n'; } });
          pyodide.setStderr({ batched: (s) => { stderr += s + '\\n'; } });
          await pyodide.runPythonAsync(code);
          self.postMessage({ type: 'result', requestId, status: 'success', stdout, stderr });
        } catch (err) {
          self.postMessage({ type: 'result', requestId, status: 'error', message: String(err && err.message || err), stdout: '', stderr: '' });
        }
      }
    };
  `;
}

function buildJsWorkerSource() {
  return `
    self.onmessage = (e) => {
      const { code, stdin } = e.data;
      const inputLines = Array.isArray(stdin) ? stdin.slice() : [];
      let inputIndex = 0;
      const outLines = [];
      const errLines = [];
      const fmt = (args) => args.map(a => {
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      }).join(' ');
      const sandboxConsole = {
        log: (...args) => outLines.push(fmt(args)),
        warn: (...args) => outLines.push(fmt(args)),
        error: (...args) => errLines.push(fmt(args))
      };
      const readLine = () => (inputIndex < inputLines.length ? inputLines[inputIndex++] : null);
      // Fresh worker, nothing loaded it needs — strip network/storage APIs
      // before running student code. Workers are same-origin (not sandboxed
      // from this site), so without this a student's code could fetch() to
      // exfiltrate data or reach this origin's IndexedDB.
      try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.indexedDB = undefined; self.importScripts = undefined; } catch {}
      try {
        const fn = new Function('console', 'readLine', code);
        fn(sandboxConsole, readLine);
        self.postMessage({ status: 'success', stdout: outLines.join('\\n'), stderr: errLines.join('\\n') });
      } catch (err) {
        self.postMessage({ status: 'error', message: String(err && err.message || err), stdout: outLines.join('\\n'), stderr: errLines.join('\\n') });
      }
    };
  `;
}

function makeWorkerFromSource(source) {
  const blob = new Blob([source], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

// Lazily creates (or reuses) the Python worker and waits for Pyodide to
// finish loading inside it. Safe to call repeatedly — subsequent calls
// resolve immediately once ready.
function initPyodide() {
  if (pyWorker && pyWorkerReady) return pyWorkerReady;

  pyWorker = makeWorkerFromSource(buildPyWorkerSource());
  pyWorkerReady = new Promise((resolve, reject) => {
    function onMessage(e) {
      if (e.data.type === 'ready') {
        pyWorker.removeEventListener('message', onMessage);
        resolve(pyWorker);
      } else if (e.data.type === 'init_error') {
        pyWorker.removeEventListener('message', onMessage);
        pyWorker.terminate();
        pyWorker = null;
        pyWorkerReady = null;
        reject(new Error(e.data.message || 'Failed to load Pyodide'));
      }
    }
    pyWorker.addEventListener('message', onMessage);
    pyWorker.postMessage({ type: 'init' });
  });

  return pyWorkerReady;
}

function resetPyWorker() {
  if (pyWorker) {
    try { pyWorker.terminate(); } catch { /* already dead */ }
  }
  pyWorker = null;
  pyWorkerReady = null;
}

async function runPython(code, stdin, timeoutMs) {
  try {
    await initPyodide();
  } catch (err) {
    return { status: 'error', message: `Pyodide failed to load: ${err.message}`, stdout: '', stderr: '' };
  }

  const requestId = `${Date.now()}_${Math.random()}`;

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resetPyWorker(); // worker may be stuck in an infinite loop — discard it
      resolve({ status: 'timeout', stdout: '', stderr: '' });
    }, timeoutMs);

    function onMessage(e) {
      if (e.data.type !== 'result' || e.data.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pyWorker.removeEventListener('message', onMessage);
      resolve(e.data);
    }

    pyWorker.addEventListener('message', onMessage);
    pyWorker.postMessage({ type: 'run', code, stdin, requestId });
  });
}

async function runJavaScript(code, stdin, timeoutMs) {
  // Fresh isolated worker per run — no shared state between submissions,
  // no access to window/document/localStorage (Workers never have these).
  const worker = makeWorkerFromSource(buildJsWorkerSource());
  const inputLines = (stdin || '').split('\n');

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve({ status: 'timeout', stdout: '', stderr: '' });
    }, timeoutMs);

    worker.onmessage = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve({ status: 'error', message: err.message || 'Worker crashed', stdout: '', stderr: '' });
    };

    worker.postMessage({ code, stdin: inputLines });
  });
}

/**
 * Execute student code in a sandboxed Web Worker.
 * Never throws and never freezes the page — worker crashes/timeouts are
 * always converted into a { status } result.
 */
async function executeCode({ language, code, stdin = '', timeoutMs = 5000 }) {
  if (typeof code !== 'string' || !code.trim()) {
    return { status: 'error', message: 'Code is empty', stdout: '', stderr: '' };
  }
  if (language === 'python') return runPython(code, stdin, timeoutMs);
  if (language === 'javascript') return runJavaScript(code, stdin, timeoutMs);
  return { status: 'error', message: `Unsupported language: ${language}`, stdout: '', stderr: '' };
}

// Exact stdout matching is too brittle (trailing newlines, trailing
// whitespace per line) — normalize before comparing.
function compareOutput(actual, expected) {
  const normalize = (s) =>
    String(s ?? '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n+$/, '')
      .trim();
  return normalize(actual) === normalize(expected);
}

export { initPyodide, executeCode, compareOutput };
