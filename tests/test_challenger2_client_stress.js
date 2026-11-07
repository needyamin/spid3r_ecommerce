// tests/test_challenger2_client_stress.js
// Challenger 2: Adversarial Stress Testing for Client-Side JS (admin.js)
// Simulates browser DOM, Bootstrap modals, and Fetch API

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runAll() {
  console.log("\n=======================================================");
  console.log("=== Running Challenger 2 Client JS Adversarial Tests ===");
  console.log("=======================================================\n");

  // Read public/js/admin.js
  const adminJsPath = path.resolve(__dirname, '../public/js/admin.js');
  const adminJsCode = fs.readFileSync(adminJsPath, 'utf8');

  // --- 1. Static Audit of admin.js ---
  console.log("--- 1. Static Security & Architecture Audit ---");

  // 1.1 Verify complete elimination of location.reload()
  const reloadMatches = adminJsCode.match(/location\.reload\s*\(/g);
  assert.strictEqual(reloadMatches, null, "admin.js must have ZERO calls to location.reload()");
  console.log("  [PASS] Zero calls to location.reload()");

  // 1.2 Verify CSP and inline JS absence
  assert.ok(!adminJsCode.includes("eval("), "admin.js must not contain eval()");
  assert.ok(!adminJsCode.includes("javascript:"), "admin.js must not contain javascript: URLs");
  console.log("  [PASS] Clean CSP compliance: no eval(), no javascript: URIs");

  // --- 2. Minimal DOM & Bootstrap Mock Environment ---
  function createMockEnvironment() {
    const elements = new Map();
    const listeners = {};

    class MockElement {
      constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.attributes = {};
        this.children = [];
        this.parentNode = null;
        this.classList = {
          classes: new Set(),
          add: (c) => this.classList.classes.add(c),
          remove: (c) => this.classList.classes.delete(c),
          contains: (c) => this.classList.classes.has(c)
        };
        this._innerHTML = "";
        this._textContent = "";
        this.value = "";
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.eventListeners = {};
      }

      setAttribute(k, v) { this.attributes[k] = String(v); }
      getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
      hasAttribute(k) { return this.attributes[k] !== undefined; }
      removeAttribute(k) { delete this.attributes[k]; }

      set id(val) { this.setAttribute('id', val); elements.set(val, this); }
      get id() { return this.getAttribute('id') || ""; }

      set className(val) {
        this.setAttribute('class', val);
        this.classList.classes = new Set(val.split(/\s+/).filter(Boolean));
      }
      get className() { return this.getAttribute('class') || ""; }

      set innerHTML(val) {
        this._innerHTML = String(val);
      }
      get innerHTML() { return this._innerHTML; }

      set textContent(val) {
        this._textContent = String(val);
        this._innerHTML = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      get textContent() { return this._textContent; }

      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      }

      remove() {
        if (this.parentNode) {
          const idx = this.parentNode.children.indexOf(this);
          if (idx >= 0) this.parentNode.children.splice(idx, 1);
        }
        if (this.id) elements.delete(this.id);
      }

      addEventListener(ev, fn) {
        if (!this.eventListeners[ev]) this.eventListeners[ev] = [];
        this.eventListeners[ev].push(fn);
      }

      dispatchEvent(ev) {
        const list = this.eventListeners[ev.type] || [];
        for (const fn of list) fn(ev);
      }

      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      }

      querySelectorAll(sel) {
        const results = [];
        function recurse(node) {
          for (const child of node.children) {
            if (matchesSel(child, sel)) results.push(child);
            recurse(child);
          }
        }
        recurse(this);
        return results;
      }

      closest(sel) {
        let cur = this;
        while (cur) {
          if (matchesSel(cur, sel)) return cur;
          cur = cur.parentNode;
        }
        return null;
      }
    }

    function matchesSel(el, sel) {
      if (!el || !el.getAttribute) return false;
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel.startsWith('.')) return el.classList && el.classList.contains(sel.slice(1));
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const inner = sel.slice(1, -1);
        if (inner.includes('=')) {
          const [k, v] = inner.split('=');
          const val = v.replace(/["']/g, '');
          return el.getAttribute(k) === val;
        }
        return el.hasAttribute(inner);
      }
      return el.tagName === sel.toUpperCase();
    }

    const document = {
      readyState: "complete",
      body: new MockElement("body"),
      createElement: (tag) => new MockElement(tag),
      getElementById: (id) => elements.get(id) || null,
      querySelector: (sel) => {
        if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
        return document.body.querySelector(sel);
      },
      querySelectorAll: (sel) => document.body.querySelectorAll(sel),
      addEventListener: (ev, fn) => {
        if (!listeners[ev]) listeners[ev] = [];
        listeners[ev].push(fn);
      },
      dispatchEvent: (ev) => {
        for (const fn of (listeners[ev.type] || [])) fn(ev);
      }
    };

    const window = {
      document: document,
      location: {
        href: "http://localhost:8090/admin/dashboard",
        reload: function () {
          throw new Error("VIOLATION: window.location.reload() was called!");
        }
      },
      confirm: () => true
    };

    let modalInstanceCount = 0;
    let modalShowCount = 0;
    let modalHideCount = 0;
    class MockBootstrapModal {
      constructor(el) {
        this.el = el;
        modalInstanceCount++;
        this.visible = false;
      }
      show() {
        this.visible = true;
        modalShowCount++;
      }
      hide() {
        this.visible = false;
        modalHideCount++;
      }
    }

    const bootstrapModalInstances = new Map();
    const bootstrap = {
      Modal: {
        getOrCreateInstance: (el) => {
          if (!bootstrapModalInstances.has(el)) {
            bootstrapModalInstances.set(el, new MockBootstrapModal(el));
          }
          return bootstrapModalInstances.get(el);
        }
      }
    };

    return {
      document,
      window,
      bootstrap,
      getModalStats: () => ({ modalInstanceCount, modalShowCount, modalHideCount })
    };
  }

  // --- 3. Evaluate admin.js in Mock Context ---
  const env = createMockEnvironment();

  // Add meta tags to document
  const metaModule = env.document.createElement("meta");
  metaModule.setAttribute("name", "admin-module");
  metaModule.setAttribute("content", "categories");
  env.document.body.appendChild(metaModule);

  const metaCsrf = env.document.createElement("meta");
  metaCsrf.setAttribute("name", "csrf-token");
  metaCsrf.setAttribute("content", "test-csrf-token-xyz");
  env.document.body.appendChild(metaCsrf);

  let mockFetchHandler = async (url, opts) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: [] })
    };
  };

  const mockFetch = (url, opts) => {
    return mockFetchHandler(url, opts);
  };

  const sandbox = {
    document: env.document,
    window: env.window,
    bootstrap: env.bootstrap,
    fetch: mockFetch,
    URLSearchParams: URLSearchParams,
    Node: class Node {},
    FileReader: class FileReader {
      readAsDataURL(file) {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: "data:image/png;base64,AAAA" } });
        }, 0);
      }
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    console: console
  };

  const runScript = new Function(
    'window', 'document', 'bootstrap', 'fetch', 'URLSearchParams', 'Node', 'FileReader', 'setTimeout', 'clearTimeout',
    adminJsCode + '; return window.ADMIN;'
  );

  const ADMIN = runScript(
    sandbox.window, sandbox.document, sandbox.bootstrap, sandbox.fetch,
    sandbox.URLSearchParams, sandbox.Node, sandbox.FileReader, sandbox.setTimeout, sandbox.clearTimeout
  );

  assert.ok(ADMIN != null, "ADMIN object exported on window");

  // --- 4. Stress Test: XSS Escaping Oracle ---
  console.log("--- 2. XSS Escaping Oracle Testing ---");
  const xssVectors = [
    { raw: "<script>alert('xss')</script>", expected: "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;" },
    { raw: "\"><img src=x onerror=alert(1)>", expected: "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;" },
    { raw: "' onfocus='alert(1)'", expected: "&#39; onfocus=&#39;alert(1)&#39;" },
    { raw: "><svg onload=alert(1)>", expected: "&gt;&lt;svg onload=alert(1)&gt;" },
    { raw: "&<>'\"", expected: "&amp;&lt;&gt;&#39;&quot;" }
  ];

  for (const vec of xssVectors) {
    const esc = ADMIN.esc(vec.raw);
    assert.strictEqual(esc, vec.expected, `ADMIN.esc(${vec.raw}) must match expected escaped representation`);
    // Ensure all 5 dangerous metacharacters are absent in raw form:
    assert.ok(!esc.includes("<"), "Must not contain raw <");
    assert.ok(!esc.includes(">"), "Must not contain raw >");
    assert.ok(!esc.includes('"'), 'Must not contain raw "');
    assert.ok(!esc.includes("'"), "Must not contain raw '");
  }
  console.log("  [PASS] ADMIN.esc accurately neutralizes all HTML metacharacters (< > \" ' &)");

  // --- 5. Stress Test: Rapid Modal Open/Close Cycles ---
  console.log("--- 3. Rapid Modal Lifecycle Stress Test ---");
  const initialStats = env.getModalStats();
  for (let i = 0; i < 50; i++) {
    ADMIN.modal.open("Title " + i, "<p>Body " + i + "</p>", "<button data-cc>Cancel</button>");
    ADMIN.modal.close();
  }
  const finalStats = env.getModalStats();
  assert.strictEqual(finalStats.modalInstanceCount, 1, "Exactly one Bootstrap modal instance should be created and reused");
  assert.strictEqual(finalStats.modalShowCount, 50, "Modal show() called 50 times cleanly");
  assert.strictEqual(finalStats.modalHideCount, 50, "Modal hide() called 50 times cleanly");
  console.log("  [PASS] Rapid 50-cycle modal open/close executed without instance leakage");

  // --- 6. Stress Test: Form Builder Validation & Empty Submits ---
  console.log("--- 4. Form Builder Validation & Empty Submits ---");
  let submittedData = null;
  const form = ADMIN.buildForm({
    fields: [
      { name: "name", label: "Category Name", required: true },
      { name: "amount", label: "Amount", type: "number", min: 10, required: true }
    ],
    onSubmit: (data) => {
      submittedData = data;
      return Promise.resolve();
    }
  });

  form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(submittedData, null, "Empty required form submission must be blocked");

  const nameErr = form.querySelector("#f-name").parentNode.querySelector(".dz-field-error");
  assert.strictEqual(nameErr.hidden, false, "Field error must be shown for required name");
  assert.ok(nameErr.textContent.includes("Category Name is required"), "Field error message matches");

  const nameInput = form.querySelector("#f-name");
  nameInput.value = "Valid Name";
  const amtInput = form.querySelector("#f-amount");
  amtInput.value = "5"; // below min=10

  form.dispatchEvent({ type: "submit", preventDefault: () => {} });
  assert.strictEqual(submittedData, null, "Form with amount < 10 must be blocked");
  const amtErr = amtInput.parentNode.querySelector(".dz-field-error");
  assert.strictEqual(amtErr.hidden, false, "Amount error must be visible");
  assert.ok(amtErr.textContent.includes("must be at least 10"), "Amount error message matches min constraint");
  console.log("  [PASS] Empty submits and numerical constraints validated client-side with zero reloads");

  // --- 7. Stress Test: Asynchronous AJAX Error Handling (422, 419, 404, 500) ---
  console.log("--- 5. Asynchronous AJAX Error Handling (422, 419, 404, 500) ---");

  // Test 422
  mockFetchHandler = async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      message: "Validation failed",
      errors: { name: "The category name has already been taken." }
    })
  });

  let toastCalls = [];
  ADMIN.toast = (msg, ok) => { toastCalls.push({ msg, ok }); };

  let actThrew = false;
  try {
    await ADMIN.act("POST", "/admin/api/categories/create", null, { name: "Duplicate" });
  } catch (e) {
    actThrew = true;
    assert.strictEqual(e.message, "Validation failed");
    assert.strictEqual(e.fields.name, "The category name has already been taken.");
  }
  assert.ok(actThrew, "ADMIN.act throws error on HTTP 422");

  // Test 419
  mockFetchHandler = async () => ({
    ok: false,
    status: 419,
    json: async () => ({ error: "CSRF token mismatch. Please try again." })
  });

  actThrew = false;
  try {
    await ADMIN.act("POST", "/admin/api/categories/create", null, { name: "CSRF Test" });
  } catch (e) {
    actThrew = true;
    assert.ok(e.message.includes("CSRF token mismatch"));
  }
  assert.ok(actThrew, "ADMIN.act throws error on HTTP 419");

  // Test 404
  mockFetchHandler = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: "Record not found." })
  });

  actThrew = false;
  try {
    await ADMIN.act("GET", "/admin/api/order/99999", null, null);
  } catch (e) {
    actThrew = true;
    assert.ok(e.message.includes("Record not found"));
  }
  assert.ok(actThrew, "ADMIN.act throws error on HTTP 404");

  // Test 500
  mockFetchHandler = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: "Internal server error." })
  });

  actThrew = false;
  try {
    await ADMIN.act("POST", "/admin/api/products/1/update", null, {});
  } catch (e) {
    actThrew = true;
    assert.ok(e.message.includes("Internal server error"));
  }
  assert.ok(actThrew, "ADMIN.act throws error on HTTP 500");

  // Test Network Error
  mockFetchHandler = async () => {
    throw new Error("Failed to fetch");
  };

  const reqRes = await ADMIN.get("/admin/api/list/products");
  assert.strictEqual(reqRes.ok, false, "Network error returns { ok: false, status: 0 }");
  assert.strictEqual(reqRes.status, 0, "Network error status is 0");
  console.log("  [PASS] 422, 419, 404, 500 and network dropouts handled asynchronously without page reload");

  // --- 8. Investigation: Module Return Values ---
  console.log("--- 6. Investigation: Module Return Values & ADMIN.activeModule ---");
  const moduleReturnTests = [
    { name: "CategoriesModule", fn: "CategoriesModule" },
    { name: "BrandsModule", fn: "BrandsModule" },
    { name: "ProductsModule", fn: "ProductsModule" },
    { name: "OrdersModule", fn: "OrdersModule" },
    { name: "InventoryModule", fn: "InventoryModule" },
    { name: "CustomersModule", fn: "CustomersModule" }
  ];

  for (const m of moduleReturnTests) {
    const regex = new RegExp("function\\s+" + m.name + "\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}", "m");
    const match = adminJsCode.match(regex);
    const returnsSelf = match && match[1].includes("return self;");
    console.log(`  Module ${m.name}: returns self? ${returnsSelf ? "YES" : "NO (returns undefined)"}`);
  }

  console.log("\n=======================================================");
  console.log("=== All Challenger 2 Client JS Tests Complete!      ===");
  console.log("=======================================================\n");
}

runAll().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
