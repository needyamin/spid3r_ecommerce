/* Spid3r Admin — dashboard SPA framework.
   Every module renders client-side from JSON APIs; no full-page reloads on
   any data action. CSP-safe: no inline JS, all behaviour wired here. */
(function () {
  "use strict";

  function meta(name) {
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? m.getAttribute("content") : "";
  }

  var ADMIN = {};
  ADMIN.csrf = meta("csrf-token");
  ADMIN.currency = (meta("store-currency") || "BDT").toUpperCase();
  ADMIN.moduleName = meta("admin-module");

  // ---------------------------------------------------------------- helpers
  ADMIN.esc = function (s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  ADMIN.fmt = function (minor) {
    var v = parseInt(minor || 0, 10);
    var neg = v < 0 ? "−" : "";
    if (v < 0) v = -v;
    var major = Math.floor(v / 100);
    var frac = v - major * 100;
    var s = "" + major;
    var grouped = "";
    for (var i = 0; i < s.length; i++) {
      grouped += s.charAt(i);
      var pos = s.length - i - 1;
      if (pos > 0 && pos % 3 === 0) grouped += ",";
    }
    var f = "" + frac;
    if (f.length === 1) f = "0" + f;
    return neg + "৳" + grouped + "." + f;
  };

  ADMIN.toast = function (msg, ok) {
    var ex = document.getElementById("dz-toast");
    if (ex) ex.remove();
    var t = document.createElement("div");
    t.id = "dz-toast";
    t.className = ok ? "dz-toast dz-toast-ok" : "dz-toast dz-toast-err";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
  };

  ADMIN.loadingHTML =
    '<div class="dz-admin-loading"><div class="dz-spinner"></div>' +
    '<p class="dz-admin-loading-text">Loading…</p></div>';

  ADMIN.errorHTML = function (msg) {
    return '<div class="dz-admin-error"><strong>Could not load this view.</strong>' +
      '<p class="mb-0">' + ADMIN.esc(msg || "") + "</p>" +
      '<button class="btn btn-primary btn-sm mt-2" data-admin-retry>Retry</button></div>';
  };

  ADMIN.emptyHTML = function (msg) {
    return '<div class="empty-note">' + ADMIN.esc(msg || "No records found.") + "</div>";
  };

  ADMIN.badge = function (status) {
    var map = {
      published: "text-bg-success", draft: "text-bg-secondary", archived: "text-bg-dark",
      pending: "text-bg-warning", awaiting_payment: "text-bg-warning", paid: "text-bg-info",
      processing: "text-bg-primary", packed: "text-bg-primary", shipped: "text-bg-info",
      delivered: "text-bg-success", cancelled: "text-bg-danger", refunded: "text-bg-dark",
      suspended: "text-bg-danger", active: "text-bg-success"
    };
    var cls = map[String(status)] || "text-bg-secondary";
    return '<span class="badge ' + cls + '">' + ADMIN.esc(String(status).replace(/_/g, " ")) + "</span>";
  };

  ADMIN.paginationHTML = function (meta) {
    if (!meta || !meta.last_page || meta.last_page <= 1) return "";
    var h = '<nav class="dz-admin-pagination" aria-label="Pagination"><div class="dz-admin-pagination-info">' +
      "Page " + meta.page + " of " + meta.last_page + " · " + meta.total + " items</div><div class=\"btn-group\">";
    if (meta.page > 1) h += '<button class="btn btn-light border btn-sm" data-page="' + (meta.page - 1) + '">Previous</button>';
    else h += '<button class="btn btn-light border btn-sm" disabled>Previous</button>';
    if (meta.page < meta.last_page) h += '<button class="btn btn-light border btn-sm" data-page="' + (meta.page + 1) + '">Next</button>';
    else h += '<button class="btn btn-light border btn-sm" disabled>Next</button>';
    h += "</div></nav>";
    return h;
  };

  // ---------------------------------------------------------------- requests
  function request(method, url, params, data) {
    var opts = { method: method, headers: { Accept: "application/json" }, credentials: "same-origin" };
    if (params) {
      var q = [];
      for (var k in params) {
        if (params[k] !== "" && params[k] !== null && params[k] !== undefined) {
          q.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
        }
      }
      if (q.length) url += (url.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
    }
    if (data && method !== "GET") {
      var body = new URLSearchParams();
      for (var k2 in data) {
        if (data[k2] !== undefined && data[k2] !== null) body.set(k2, data[k2]);
      }
      body.set("_csrf", ADMIN.csrf);
      body.set("format", "json");
      opts.body = body;
    }
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) { window.location.href = "/login"; return { ok: false, auth: true }; }
      return res.json().then(function (j) { return { ok: res.ok, status: res.status, data: j }; })
        .catch(function () { return { ok: false, status: res.status, data: {} }; });
    }).catch(function () { return { ok: false, status: 0, data: {} }; });
  }

  ADMIN.get = function (url, params) { return request("GET", url, params, null); };
  ADMIN.post = function (url, data) { return request("POST", url, null, data); };
  ADMIN.put = function (url, data) { return request("PUT", url, null, data); };
  ADMIN.del = function (url, data) { return request("DELETE", url, null, data); };

  // High-level action: resolves with data, throws on failure (err.fields set).
  ADMIN.act = function (method, url, params, data) {
    return request(method, url, params, data).then(function (res) {
      if (res.auth) return null;
      if (!res.ok) {
        var fields = null, message = "The request failed.";
        if (res.data && res.data.errors) fields = res.data.errors;
        if (res.data && res.data.message) message = res.data.message;
        if (res.data && res.data.error) message = res.data.error;
        var e = new Error(message);
        e.fields = fields;
        throw e;
      }
      return res.data;
    });
  };

  // ---------------------------------------------------------------- modal
  ADMIN.ensureModalHost = function () {
    var el = document.getElementById("adminModal");
    if (!el) {
      var div = document.createElement("div");
      div.className = "modal fade";
      div.id = "adminModal";
      div.tabIndex = -1;
      div.setAttribute("aria-labelledby", "adminModalTitle");
      div.setAttribute("aria-hidden", "true");
      div.innerHTML =
        '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">' +
          '<div class="modal-content">' +
            '<div class="modal-header">' +
              '<h2 class="modal-title h5" id="adminModalTitle">Dialog</h2>' +
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
            '</div>' +
            '<div class="modal-body" id="adminModalBody"></div>' +
            '<div class="modal-footer" id="adminModalFooter"></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(div);
    }
  };

  ADMIN.modal = {
    open: function (title, bodyHTML, footerHTML, dialogClass) {
      ADMIN.ensureModalHost();
      var t = document.getElementById("adminModalTitle");
      var b = document.getElementById("adminModalBody");
      var f = document.getElementById("adminModalFooter");
      var modalEl = document.getElementById("adminModal");
      var dialog = modalEl ? modalEl.querySelector(".modal-dialog") : null;
      if (dialog) {
        dialog.className = "modal-dialog modal-dialog-centered modal-dialog-scrollable" + (dialogClass ? " " + dialogClass : "");
      }
      if (t) t.innerHTML = title || "";
      if (b) {
        if (typeof bodyHTML === "string") {
          b.innerHTML = bodyHTML || "";
        } else if (bodyHTML instanceof Node) {
          b.innerHTML = "";
          b.appendChild(bodyHTML);
        }
      }
      if (f) {
        if (typeof footerHTML === "string") {
          f.innerHTML = footerHTML || "";
        } else if (footerHTML instanceof Node) {
          f.innerHTML = "";
          f.appendChild(footerHTML);
        } else if (!footerHTML) {
          f.innerHTML = "";
        }
      }
      if (modalEl) {
        var ccButtons = modalEl.querySelectorAll("[data-cc]");
        ccButtons.forEach(function (btn) {
          btn.onclick = function () { ADMIN.modal.close(); };
        });
      }
      var m = bootstrap.Modal.getOrCreateInstance(modalEl);
      m.show();
      return m;
    },
    close: function () {
      ADMIN.ensureModalHost();
      var modalEl = document.getElementById("adminModal");
      if (modalEl) {
        var m = bootstrap.Modal.getOrCreateInstance(modalEl);
        m.hide();
      }
    }
  };

  ADMIN.confirm = function (opts) {
    return new Promise(function (resolve) {
      var footer =
        '<button type="button" class="btn btn-light border" data-cc>Cancel</button>' +
        '<button type="button" class="btn ' + (opts.danger ? "btn-outline-danger" : "btn-primary") +
        '" data-cy>' + ADMIN.esc(opts.confirmLabel || "Confirm") + "</button>";
      ADMIN.modal.open(opts.title || "Please confirm", '<p class="mb-0">' + ADMIN.esc(opts.message || "") + "</p>", footer);
      var modalEl = document.getElementById("adminModal");
      modalEl.querySelector("[data-cy]").onclick = function () { ADMIN.modal.close(); resolve(true); };
      modalEl.querySelector("[data-cc]").onclick = function () { ADMIN.modal.close(); resolve(false); };
    });
  };

  // ---------------------------------------------------------------- form builder
  ADMIN.buildForm = function (cfg) {
    var form = document.createElement("form");
    form.className = "dz-admin-form";
    form.setAttribute("novalidate", "");
    (cfg.fields || []).forEach(function (f) {
      var wrap = document.createElement("div");
      wrap.className = "dz-form-group mb-3";
      var id = "f-" + f.name;
      var label = document.createElement("label");
      label.className = "form-label small text-secondary mb-1";
      label.setAttribute("for", id);
      label.textContent = f.label;
      wrap.appendChild(label);
      var input;
      if (f.type === "select") {
        input = document.createElement("select");
        input.className = "form-select";
        (f.options || []).forEach(function (o) {
          var op = document.createElement("option");
          op.value = o.value;
          op.textContent = o.label;
          if (cfg.values && String(cfg.values[f.name]) === String(o.value)) op.selected = true;
          input.appendChild(op);
        });
      } else if (f.type === "textarea") {
        input = document.createElement("textarea");
        input.className = "form-control";
        input.rows = f.rows || 3;
        input.value = (cfg.values && cfg.values[f.name] != null) ? cfg.values[f.name] : "";
      } else if (f.type === "checkbox") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.className = "form-check-input";
        input.checked = !!(cfg.values && cfg.values[f.name]);
        input.value = "1";
      } else {
        input = document.createElement("input");
        input.className = "form-control";
        input.type = f.type || "text";
        if (f.type === "number") {
          if (f.min != null) input.min = f.min;
          if (f.step != null) input.step = f.step;
        }
        input.value = (cfg.values && cfg.values[f.name] != null) ? cfg.values[f.name] : "";
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.id = id;
      input.name = f.name;
      if (f.disabled) input.disabled = true;
      wrap.appendChild(input);
      if (f.help) {
        var h = document.createElement("div");
        h.className = "form-text";
        h.textContent = f.help;
        wrap.appendChild(h);
      }
      var err = document.createElement("div");
      err.className = "dz-field-error";
      err.hidden = true;
      wrap.appendChild(err);
      form.appendChild(wrap);
    });
    var foot = document.createElement("div");
    foot.className = "dz-admin-form-actions d-flex gap-2 align-items-center flex-wrap";
    var submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn " + (cfg.danger ? "btn-outline-danger" : "btn-primary");
    submit.textContent = cfg.submitLabel || "Save";
    foot.appendChild(submit);
    if (cfg.onCancel) {
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-light border";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", cfg.onCancel);
      foot.appendChild(cancel);
    }
    var feedback = document.createElement("span");
    feedback.className = "dz-form-feedback small text-secondary";
    foot.appendChild(feedback);
    form.appendChild(foot);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true;
      var data = {};
      (cfg.fields || []).forEach(function (f) {
        var input = form.querySelector("#f-" + f.name);
        var errEl = input.parentNode.querySelector(".dz-field-error");
        var val = f.type === "checkbox" ? (input.checked ? 1 : 0) : input.value;
        if (f.type === "number" && val === "") val = "";
        data[f.name] = val;
        if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
        if (f.required && (val === "" || val == null)) {
          ok = false;
          if (errEl) { errEl.hidden = false; errEl.textContent = f.label + " is required."; }
        }
        if (ok && f.type === "number" && val !== "" && f.min != null && parseFloat(val) < parseFloat(f.min)) {
          ok = false;
          if (errEl) { errEl.hidden = false; errEl.textContent = f.label + " must be at least " + f.min + "."; }
        }
      });
      if (!ok) return;
      submit.disabled = true;
      feedback.textContent = "Saving…";
      Promise.resolve(cfg.onSubmit(data)).then(function () {
        feedback.textContent = "";
      }).catch(function (err) {
        submit.disabled = false;
        feedback.textContent = "";
        var msg = err && err.message ? err.message : "Could not save. Please check the form.";
        ADMIN.toast(msg, false);
        if (err && err.fields) {
          for (var k in err.fields) {
            var input = form.querySelector("#f-" + k);
            if (input) {
              var errEl = input.parentNode.querySelector(".dz-field-error");
              if (errEl) { errEl.hidden = false; errEl.textContent = err.fields[k]; }
            }
          }
        }
      });
    });
    return form;
  };

  // ---------------------------------------------------------------- generic list module
  function ListModule(root, cfg) {
    this.root = root;
    this.cfg = cfg || {};
    this.module = (cfg && cfg.module) || "";
    this.state = { page: 1, q: "", filters: {} };
    this.rowsById = {};
  }

  ListModule.prototype.applyConfig = function (c) {
    this.cfg = c || {};
    this.module = (c && c.module) || this.module;
  };

  ListModule.prototype.getListEl = function () {
    var m = this.module || (this.cfg && this.cfg.module) || "";
    if (m) {
      var el = this.root.querySelector("#" + m + "-list");
      if (el) return el;
    }
    return this.root.querySelector(".dz-admin-list-wrap") || this.root;
  };

  ListModule.prototype.mount = function () {
    var self = this;
    this.renderShell();
    this.bindRoot();
    this.load();
  };

  ListModule.prototype.renderShell = function () {
    var m = this.cfg.module;
    this.root.innerHTML =
      '<div class="dz-admin-page-head">' +
        '<div><span class="dz-eyebrow">' + ADMIN.esc(this.cfg.eyebrow || "") + "</span>" +
        '<h1 class="page-title">' + ADMIN.esc(this.cfg.title || "") + "</h1>" +
        '<p class="page-description">' + ADMIN.esc(this.cfg.description || "") + "</p></div>" +
        '<div class="dz-admin-page-head-actions" id="' + m + '-head"></div>' +
      "</div>" +
      '<div class="dz-admin-toolbar" id="' + m + '-toolbar"></div>' +
      '<div class="dz-admin-list-wrap" id="' + m + '-list"></div>';
    var head = this.root.querySelector("#" + m + "-head");
    if (this.cfg.addLabel) {
      var b = document.createElement("button");
      b.className = "btn btn-primary";
      b.textContent = this.cfg.addLabel;
      var self = this;
      b.addEventListener("click", function () { self.cfg.onAdd(); });
      head.appendChild(b);
    }
    this.renderToolbar();
  };

  ListModule.prototype.renderToolbar = function () {
    var self = this;
    var m = this.cfg.module;
    var tb = this.root.querySelector("#" + m + "-toolbar");
    var html = '<div class="dz-admin-search"><span class="dz-admin-search-icon" aria-hidden="true"></span>' +
      '<input type="search" class="form-control form-control-sm" id="' + m + '-search" placeholder="' +
      ADMIN.esc(this.cfg.searchPlaceholder || "Search") + '" value="' + ADMIN.esc(this.state.q) + '"></div>';
    (this.cfg.filters || []).forEach(function (f) {
      html += '<select class="form-select form-select-sm dz-admin-filter" data-filter="' + f.key + '">' +
        '<option value="">' + ADMIN.esc(f.label) + "</option>";
      (f.options || []).forEach(function (o) {
        html += '<option value="' + ADMIN.esc(o.value) + '"' +
          (self.state.filters[f.key] === o.value ? " selected" : "") + ">" + ADMIN.esc(o.label) + "</option>";
      });
      html += "</select>";
    });
    html += '<button class="btn btn-light border btn-sm" data-admin-refresh type="button">Refresh</button>';
    tb.innerHTML = html;

    var search = tb.querySelector("#" + m + "-search");
    var t;
    search.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { self.state.q = search.value.trim(); self.state.page = 1; self.load(); }, 300);
    });
    (this.cfg.filters || []).forEach(function (f) {
      var sel = tb.querySelector('[data-filter="' + f.key + '"]');
      sel.addEventListener("change", function () {
        self.state.filters[f.key] = sel.value;
        self.state.page = 1;
        self.load();
      });
    });
    tb.querySelector("[data-admin-refresh]").addEventListener("click", function () { self.load(); });
  };

  ListModule.prototype.load = function () {
    var self = this;
    var m = this.cfg.module;
    var list = this.root.querySelector("#" + m + "-list");
    list.innerHTML = ADMIN.loadingHTML;
    var params = { page: this.state.page, q: this.state.q };
    for (var k in this.state.filters) params[k] = this.state.filters[k];
    ADMIN.get(this.cfg.endpoint, params).then(function (res) {
      if (res.auth) return;
      if (!res.ok) { list.innerHTML = ADMIN.errorHTML("Could not load data."); return; }
      var body = res.data || {};
      var meta = body.meta || {};
      var rows = body.data || [];
      self.rowsById = {};
      var filtered = self.state.q !== "" || Object.keys(self.state.filters).some(function (key) { return self.state.filters[key] !== ""; });
      if (rows.length === 0) {
        list.innerHTML = ADMIN.emptyHTML(filtered ? "No results match your filters." : (self.cfg.emptyText || "No records yet."));
        return;
      }
      rows.forEach(function (r) { self.rowsById[String(r.id != null ? r.id : r.product_id)] = r; });
      var thead = "<thead><tr>" + self.cfg.columns.map(function (c) {
        return "<th>" + ADMIN.esc(c.label) + "</th>";
      }).join("") + "<th>Actions</th></tr></thead>";
      var tbody = "<tbody>" + rows.map(function (row) { return self.renderRow(row); }).join("") + "</tbody>";
      list.innerHTML =
        '<div class="dz-card p-0 dz-table-card"><div class="table-responsive"><table class="table dz-admin-table align-middle mb-0">' +
        thead + tbody + "</table></div>" + ADMIN.paginationHTML(meta) + "</div>";
      self.bindTable(list);
    }).catch(function () {
      list.innerHTML = ADMIN.errorHTML("Network error while loading.");
    });
  };

  ListModule.prototype.renderRow = function (row) {
    var self = this;
    var tds = this.cfg.columns.map(function (c) {
      var val = c.render ? c.render(row) : ADMIN.esc(row[c.key]);
      return '<td data-label="' + ADMIN.esc(c.label) + '">' + val + "</td>";
    }).join("");
    var actions = this.cfg.rowActions ? this.cfg.rowActions(row) : [];
    var actsHtml = '<div class="dz-row-actions">';
    actions.forEach(function (a, i) {
      actsHtml += '<button class="btn btn-sm ' + (a.cls || "btn-light border") + '" data-act="' + i + '">' + ADMIN.esc(a.label) + "</button>";
    });
    actsHtml += "</div>";
    var id = row.id != null ? row.id : (row.product_id != null ? row.product_id : "");
    return '<tr data-id="' + ADMIN.esc(id) + '">' + tds + '<td data-label="Actions">' + actsHtml + "</td></tr>";
  };

  ListModule.prototype.bindTable = function (list) {
    var self = this;
    list.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tr = btn.closest("tr");
        var row = self.rowsById[String(tr.getAttribute("data-id"))];
        var idx = parseInt(btn.getAttribute("data-act"), 10);
        var action = self.cfg.rowActions(row)[idx];
        if (!action) return;
        if (action.href) { window.location.href = action.href; return; }
        if (action.confirm) {
          ADMIN.confirm({
            title: action.confirmTitle || "Please confirm",
            message: action.confirm,
            confirmLabel: action.confirmLabel || action.label,
            danger: action.danger
          }).then(function (yes) {
            if (yes) action.onClick(row, function () { self.load(); });
          });
        } else {
          action.onClick(row, function () { self.load(); });
        }
      });
    });
    list.querySelectorAll("[data-page]").forEach(function (b) {
      b.addEventListener("click", function () {
        self.state.page = parseInt(b.getAttribute("data-page"), 10);
        self.load();
      });
    });
    var retry = list.querySelector("[data-admin-retry]");
    if (retry) retry.addEventListener("click", function () { self.load(); });
  };

  ListModule.prototype.showPanel = function (html) {
    this.root.querySelector("#" + this.cfg.module + "-list").innerHTML = html;
  };

  ListModule.prototype.showList = function () { this.load(); };

  ListModule.prototype.bindRoot = function () {
    var self = this;
    this.root.addEventListener("click", function (e) {
      var back = e.target.closest("[data-admin-back]");
      if (back) { self.showList(); return; }
    });
  };

  ListModule.prototype.panelHead = function (title) {
    return '<div class="dz-admin-panel-head mb-3"><button class="btn btn-light border btn-sm" data-admin-back>&larr; Back to list</button>' +
      '<h2 class="h5 mb-0 ms-2">' + ADMIN.esc(title) + "</h2></div>";
  };

  ADMIN.ListModule = ListModule;

  // ============================================================ MODULES

  // ---- Options (categories / brands / statuses) ----
  var OPTIONS = null;
  ADMIN.loadOptions = function () {
    if (OPTIONS) return Promise.resolve(OPTIONS);
    return ADMIN.get("/admin/api/options").then(function (res) {
      OPTIONS = res.data && res.data.data ? res.data.data : { categories: [], brands: [], order_statuses: [], product_statuses: [] };
      return OPTIONS;
    });
  };

  // ---- Categories ----
  function CategoriesModule(root) {
    var self = new ListModule(root, {});
    self.module = "categories";
    var cfg = {
      module: "categories", title: "Categories", eyebrow: "Catalog",
      description: "Group products so shoppers can browse and filter.",
      endpoint: "/admin/api/list/categories", searchPlaceholder: "Search categories",
      addLabel: "Add category", emptyText: "No categories yet — add the first one.",
      columns: [
        { label: "Name", key: "name" },
        { label: "Slug", render: function (r) { return "<code>" + ADMIN.esc(r.slug) + "</code>"; } },
        { label: "Products", render: function (r) { return ADMIN.esc(r.product_count); } }
      ],
      rowActions: function (row) {
        return [
          { label: "Edit", cls: "btn-light border", onClick: function (r) { self.openEdit(r); } },
          { label: "Delete", cls: "btn-outline-danger", danger: true, confirm: "Delete this category? Products assigned to it keep their link until reassigned.",
            confirmLabel: "Delete", onClick: function (r, reload) {
              ADMIN.act("POST", "/admin/api/categories/" + r.id + "/delete-form").then(function () {
                ADMIN.toast("Category deleted.", true); reload();
              }).catch(function (e) { ADMIN.toast(e.message, false); });
            } }
        ];
      },
      onAdd: function () { self.openCreate(); }
    };
    self.applyConfig(cfg);
    self.openCreate = function () {
      ADMIN.loadOptions().then(function (opt) {
        var form = ADMIN.buildForm({
          fields: [
            { name: "name", label: "Name", required: true, placeholder: "e.g. Audio" },
            { name: "parent_id", label: "Parent category", type: "select",
              options: [{ value: "", label: "Top level" }].concat(opt.categories.map(function (c) { return { value: c.id, label: c.name }; })) },
            { name: "description", label: "Description", type: "textarea" }
          ],
          values: {}, submitLabel: "Create category",
          onSubmit: function (data) {
            return ADMIN.act("POST", "/admin/api/categories/create", null, data).then(function () {
              ADMIN.toast("Category created.", true);
              ADMIN.modal.close();
              OPTIONS = null;
              self.load(self.state.page);
            });
          },
          onCancel: function () { ADMIN.modal.close(); }
        });
        ADMIN.modal.open("Add Category", form, "");
      });
    };
    self.openEdit = function (row) {
      ADMIN.loadOptions().then(function (opt) {
        var form = ADMIN.buildForm({
          fields: [
            { name: "name", label: "Name", required: true, value: row.name },
            { name: "parent_id", label: "Parent category", type: "select",
              options: [{ value: "", label: "Top level" }].concat(opt.categories
                .filter(function (c) { return c.id !== row.id; })
                .map(function (c) { return { value: c.id, label: c.name }; })) },
            { name: "description", label: "Description", type: "textarea", value: row.description }
          ],
          values: { name: row.name, parent_id: row.parent_id, description: row.description },
          submitLabel: "Save changes",
          onSubmit: function (data) {
            return ADMIN.act("POST", "/admin/api/categories/" + row.id + "/update", null, data).then(function () {
              ADMIN.toast("Category updated.", true);
              ADMIN.modal.close();
              OPTIONS = null;
              self.load(self.state.page);
            });
          },
          onCancel: function () { ADMIN.modal.close(); }
        });
        ADMIN.modal.open("Edit Category — " + ADMIN.esc(row.name), form, "");
      });
    };
    self.mount();
  }

  // ---- Brands ----
  function BrandsModule(root) {
    var self = new ListModule(root, {});
    self.module = "brands";
    var cfg = {
      module: "brands", title: "Brands", eyebrow: "Catalog",
      description: "Manufacturers and labels attached to your products.",
      endpoint: "/admin/api/list/brands", searchPlaceholder: "Search brands",
      addLabel: "Add brand", emptyText: "No brands yet — add the first one.",
      columns: [
        { label: "Name", key: "name" },
        { label: "Slug", render: function (r) { return "<code>" + ADMIN.esc(r.slug) + "</code>"; } },
        { label: "Products", render: function (r) { return ADMIN.esc(r.product_count); } }
      ],
      rowActions: function (row) {
        return [
          { label: "Edit", cls: "btn-light border", onClick: function (r) { self.openEdit(r); } },
          { label: "Delete", cls: "btn-outline-danger", danger: true, confirm: "Delete this brand? Products keep their brand link until reassigned.",
            confirmLabel: "Delete", onClick: function (r, reload) {
              ADMIN.act("POST", "/admin/api/brands/" + r.id + "/delete-form").then(function () {
                ADMIN.toast("Brand deleted.", true); OPTIONS = null; reload();
              }).catch(function (e) { ADMIN.toast(e.message, false); });
            } }
        ];
      },
      onAdd: function () { self.openCreate(); }
    };
    self.applyConfig(cfg);
    self.openCreate = function () {
      var form = ADMIN.buildForm({
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "e.g. Acme" },
          { name: "description", label: "Description", type: "textarea" }
        ],
        values: {}, submitLabel: "Create brand",
        onSubmit: function (data) {
          return ADMIN.act("POST", "/admin/api/brands/create", null, data).then(function () {
            ADMIN.toast("Brand created.", true);
            ADMIN.modal.close();
            OPTIONS = null;
            self.load(self.state.page);
          });
        },
        onCancel: function () { ADMIN.modal.close(); }
      });
      ADMIN.modal.open("Add Brand", form, "");
    };
    self.openEdit = function (row) {
      var form = ADMIN.buildForm({
        fields: [
          { name: "name", label: "Name", required: true, value: row.name },
          { name: "description", label: "Description", type: "textarea", value: row.description }
        ],
        values: { name: row.name, description: row.description }, submitLabel: "Save changes",
        onSubmit: function (data) {
          return ADMIN.act("POST", "/admin/api/brands/" + row.id + "/update", null, data).then(function () {
            ADMIN.toast("Brand updated.", true);
            ADMIN.modal.close();
            OPTIONS = null;
            self.load(self.state.page);
          });
        },
        onCancel: function () { ADMIN.modal.close(); }
      });
      ADMIN.modal.open("Edit Brand — " + ADMIN.esc(row.name), form, "");
    };
    self.mount();
  }

  // ---- Customers ----
  function CustomersModule(root) {
    var self = new ListModule(root, {});
    self.module = "customers";
    var cfg = {
      module: "customers", title: "Customers", eyebrow: "People",
      description: "Shopper accounts — activate, suspend or review.",
      endpoint: "/admin/api/list/customers", searchPlaceholder: "Search name or email",
      addLabel: null, emptyText: "No customers yet.",
      columns: [
        { label: "Name", key: "name" },
        { label: "Email", key: "email" },
        { label: "Status", render: function (r) { return ADMIN.badge(r.status); } }
      ],
      rowActions: function (row) {
        return [
          { label: row.status === "suspended" ? "Activate" : "Suspend", cls: "btn-light border",
            onClick: function (r, reload) { self.toggle(r, reload); } }
        ];
      }
    };
    self.applyConfig(cfg);
    self.toggle = function (row, reload) {
      var next = row.status === "suspended" ? "active" : "suspended";
      var label = next === "active" ? "Activate" : "Suspend";
      ADMIN.confirm({ title: label + " customer", message: label + " " + row.name + " (" + row.email + ")?",
        confirmLabel: label, danger: next === "suspended" }).then(function (yes) {
        if (!yes) return;
        ADMIN.act("POST", "/admin/api/customers/" + row.id + "/status", null, { status: next })
          .then(function () { ADMIN.toast("Customer " + next + ".", true); reload(); })
          .catch(function (e) { ADMIN.toast(e.message, false); });
      });
    };
    self.mount();
  }

  // ---- Inventory ----
  function InventoryModule(root) {
    var self = new ListModule(root, {});
    self.module = "inventory";
    var cfg = {
      module: "inventory", title: "Inventory", eyebrow: "Stock",
      description: "On-hand, available and reserved units for every product.",
      endpoint: "/admin/api/list/inventory", searchPlaceholder: "Search product",
      addLabel: null, emptyText: "No inventory tracked yet — create a product first.",
      filters: [{ key: "low", label: "Stock level", options: [
        { value: "1", label: "Low stock only" }
      ] }],
      columns: [
        { label: "Product", render: function (r) {
            var img = r.has_thumb ? '<img class="dz-admin-thumb" src="' + ADMIN.esc(r.thumb) + '" alt="">' :
              '<span class="dz-admin-thumb dz-admin-thumb-empty">—</span>';
            return img + '<div class="dz-inv-name"><strong>' + ADMIN.esc(r.product_name) + "</strong>" +
              '<span class="small text-secondary">' + ADMIN.esc(r.product_status) + "</span></div>";
          } },
        { label: "On hand", render: function (r) { return "<strong>" + ADMIN.esc(r.quantity) + "</strong>"; } },
        { label: "Available", render: function (r) { return ADMIN.esc(r.available); } },
        { label: "Reserved", render: function (r) { return ADMIN.esc(r.reserved); } },
        { label: "Low at", render: function (r) {
            return r.is_low_stock ? '<span class="badge text-bg-warning">Low · ' + ADMIN.esc(r.low_stock_threshold) + "</span>"
              : '<span class="badge text-bg-light border">' + ADMIN.esc(r.low_stock_threshold) + "</span>";
          } }
      ],
      rowActions: function (row) {
        return [
          { label: "Restock", cls: "btn-light border", onClick: function (r) { self.restock(r); } },
          { label: "Set exact", cls: "btn-primary", onClick: function (r) { self.setExact(r); } }
        ];
      }
    };
    self.applyConfig(cfg);
    self.restock = function (row) {
      var body = '<form id="invForm"><div class="mb-2"><label class="form-label small">Units to add to ' +
        ADMIN.esc(row.product_name) + '</label><input name="quantity" type="number" min="1" value="1" class="form-control"></div></form>';
      var footer = '<button class="btn btn-light border" data-cc>Cancel</button>' +
        '<button class="btn btn-primary" data-cy>Restock</button>';
      ADMIN.modal.open("Restock " + ADMIN.esc(row.product_name), body, footer);
      var modalEl = document.getElementById("adminModal");
      modalEl.querySelector("[data-cy]").onclick = function () {
        var qty = parseInt(modalEl.querySelector('[name="quantity"]').value, 10);
        if (!qty || qty < 1) { ADMIN.toast("Enter a quantity of 1 or more.", false); return; }
        ADMIN.act("POST", "/admin/api/products/" + row.product_id + "/inventory/restock", null, { quantity: qty })
          .then(function () { ADMIN.modal.close(); ADMIN.toast("Stock added.", true); self.load(); })
          .catch(function (e) { ADMIN.toast(e.message, false); });
      };
    };
    self.setExact = function (row) {
      var body = '<form id="invForm"><div class="row g-2"><div class="col-6"><label class="form-label small">On hand</label>' +
        '<input name="quantity" type="number" min="0" value="' + ADMIN.esc(row.quantity) + '" class="form-control"></div>' +
        '<div class="col-6"><label class="form-label small">Low-stock at</label>' +
        '<input name="low_stock_threshold" type="number" min="0" value="' + ADMIN.esc(row.low_stock_threshold) + '" class="form-control"></div></div></form>';
      var footer = '<button class="btn btn-light border" data-cc>Cancel</button>' +
        '<button class="btn btn-primary" data-cy>Save stock</button>';
      ADMIN.modal.open("Set exact stock — " + ADMIN.esc(row.product_name), body, footer);
      var modalEl = document.getElementById("adminModal");
      modalEl.querySelector("[data-cy]").onclick = function () {
        var qty = parseInt(modalEl.querySelector('[name="quantity"]').value, 10);
        var thr = parseInt(modalEl.querySelector('[name="low_stock_threshold"]').value, 10);
        if (qty == null || qty < 0) { ADMIN.toast("Enter a quantity of zero or more.", false); return; }
        ADMIN.act("POST", "/admin/api/products/" + row.product_id + "/inventory/set-form", null,
          { quantity: qty, low_stock_threshold: (thr || 0) })
          .then(function () { ADMIN.modal.close(); ADMIN.toast("Stock updated.", true); self.load(); })
          .catch(function (e) { ADMIN.toast(e.message, false); });
      };
    };
    self.mount();
  }

  // ---- Orders ----
  function OrdersModule(root) {
    var self = new ListModule(root, {});
    self.module = "orders";
    var cfg = {
      module: "orders", title: "Orders", eyebrow: "Fulfilment",
      description: "Track, filter and update every order's status.",
      endpoint: "/admin/api/list/orders", searchPlaceholder: "Search order number",
      addLabel: null, emptyText: "No orders yet.",
      filters: [{ key: "status", label: "Status", options: [
        { value: "pending", label: "Pending" }, { value: "awaiting_payment", label: "Awaiting payment" },
        { value: "paid", label: "Paid" }, { value: "processing", label: "Processing" },
        { value: "packed", label: "Packed" }, { value: "shipped", label: "Shipped" },
        { value: "delivered", label: "Delivered" }, { value: "cancelled", label: "Cancelled" },
        { value: "refunded", label: "Refunded" }
      ] }],
      columns: [
        { label: "Order", render: function (r) { return "<code>" + ADMIN.esc(r.order_number) + "</code>"; } },
        { label: "Customer", render: function (r) { return ADMIN.esc(r.customer_name); } },
        { label: "Status", render: function (r) { return ADMIN.badge(r.status); } },
        { label: "Total", render: function (r) { return "<strong>" + ADMIN.esc(r.total_display) + "</strong>"; } },
        { label: "Items", render: function (r) { return ADMIN.esc(r.item_count); } },
        { label: "Placed", render: function (r) { return ADMIN.esc(r.placed_at); } }
      ],
      rowActions: function (row) {
        return [
          { label: "View", cls: "btn-primary", onClick: function (r) { self.openModalView(r); } },
          { label: "Status", cls: "btn-light border", onClick: function (r) { self.openStatusModal(r); } }
        ];
      }
    };
    self.applyConfig(cfg);
    self.openModalView = function (row) {
      ADMIN.ensureModalHost();
      ADMIN.modal.open("Order #" + row.order_number, ADMIN.loadingHTML, "", "modal-lg");
      ADMIN.get("/admin/api/order/" + row.id).then(function (res) {
        if (res.auth) return;
        if (!res.ok) {
          ADMIN.modal.open("Order #" + row.order_number, ADMIN.errorHTML("Could not load order details."), "", "modal-lg");
          return;
        }
        var d = res.data.data;
        var o = d.order;
        var items = (d.items || []).map(function (it) {
          return "<tr><td>" + ADMIN.esc(it.name) + "</td><td><code>" + ADMIN.esc(it.sku) + "</code></td>" +
            "<td>" + ADMIN.esc(it.quantity) + "</td><td>" + ADMIN.esc(it.unit_display) + "</td>" +
            "<td>" + ADMIN.esc(it.line_display) + "</td></tr>";
        }).join("");
        var addr = d.address || {};
        var addrHtml = [addr.name, addr.phone, addr.address_line1, addr.city, addr.postal_code]
          .filter(function (x) { return x; }).map(function (x) { return ADMIN.esc(x); }).join("<br>") || "<em>No address on file.</em>";
        var statusOpts = (d.statuses || []).map(function (s) {
          return '<option value="' + ADMIN.esc(s) + '"' + (s === o.status ? " selected" : "") + ">" + ADMIN.esc(s.replace(/_/g, " ")) + "</option>";
        }).join("");
        var body =
          '<div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
            '<div><span class="text-secondary small">Placed ' + ADMIN.esc(o.placed_at) + '</span></div>' +
            ADMIN.badge(o.status) +
          '</div>' +
          '<div class="table-responsive mb-3"><table class="table dz-admin-table align-middle mb-0"><thead><tr>' +
          '<th>Product</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead><tbody>' +
          items + '</tbody></table></div>' +
          '<div class="row g-3 mb-3">' +
            '<div class="col-12 col-md-6"><div class="dz-card p-3 h-100">' +
              '<h4 class="h6 mb-2">Customer &amp; Shipping</h4>' +
              (d.customer ? '<p class="mb-1"><strong>' + ADMIN.esc(d.customer.name) + '</strong></p><p class="mb-2 text-secondary small">' + ADMIN.esc(d.customer.email) + '</p>' : '<p class="mb-2 text-secondary small">Guest checkout</p>') +
              '<p class="mb-0 small">' + addrHtml + '</p>' +
            '</div></div>' +
            '<div class="col-12 col-md-6"><div class="dz-card p-3 h-100">' +
              '<h4 class="h6 mb-2">Totals</h4>' +
              '<div class="dz-totals">' +
                self.totalRow("Subtotal", d.subtotal_display) + self.totalRow("Discount", d.discount_display) +
                self.totalRow("Shipping", d.shipping_display) + self.totalRow("Tax", d.tax_display) +
                self.totalRow("Total", d.total_display, true) +
              '</div>' +
            '</div></div>' +
          '</div>' +
          '<div class="dz-card p-3"><h4 class="h6 mb-2">Update Order Status</h4>' +
            '<div class="input-group">' +
              '<select id="modalOrderStatus" class="form-select">' + statusOpts + '</select>' +
              '<button class="btn btn-primary" id="modalOrderStatusBtn">Update Status</button>' +
            '</div>' +
          '</div>';
        var footer = '<button class="btn btn-light border" data-cc>Close</button>';
        ADMIN.modal.open("Order #" + o.order_number, body, footer, "modal-lg");
        var modalEl = document.getElementById("adminModal");
        var saveBtn = modalEl.querySelector("#modalOrderStatusBtn");
        if (saveBtn) {
          saveBtn.addEventListener("click", function () {
            var st = modalEl.querySelector("#modalOrderStatus").value;
            saveBtn.disabled = true;
            ADMIN.act("POST", "/admin/api/order/" + o.id + "/status", null, { status: st })
              .then(function () {
                ADMIN.toast("Order status updated.", true);
                ADMIN.modal.close();
                self.load(self.state.page);
              })
              .catch(function (e) {
                saveBtn.disabled = false;
                ADMIN.toast(e.message, false);
              });
          });
        }
      }).catch(function () {
        ADMIN.modal.open("Order #" + row.order_number, ADMIN.errorHTML("Network error."), "", "modal-lg");
      });
    };
    self.openStatusModal = function (row) {
      ADMIN.ensureModalHost();
      ADMIN.modal.open("Update Status — Order #" + row.order_number, ADMIN.loadingHTML, "");
      ADMIN.get("/admin/api/order/" + row.id).then(function (res) {
        if (res.auth) return;
        if (!res.ok) {
          ADMIN.modal.open("Update Status", ADMIN.errorHTML("Could not load the order."), "");
          return;
        }
        var d = res.data.data;
        var o = d.order;
        var statusOpts = (d.statuses || []).map(function (s) {
          return '<option value="' + ADMIN.esc(s) + '"' + (s === o.status ? " selected" : "") + ">" + ADMIN.esc(s.replace(/_/g, " ")) + "</option>";
        }).join("");
        var body =
          '<p class="mb-2">Select new status for order <strong>' + ADMIN.esc(o.order_number) + '</strong>:</p>' +
          '<select id="quickOrderStatus" class="form-select mb-2">' + statusOpts + '</select>';
        var footer =
          '<button class="btn btn-light border" data-cc>Cancel</button>' +
          '<button class="btn btn-primary" id="quickOrderStatusBtn">Save status</button>';
        ADMIN.modal.open("Update Status — Order #" + o.order_number, body, footer);
        var modalEl = document.getElementById("adminModal");
        var saveBtn = modalEl.querySelector("#quickOrderStatusBtn");
        if (saveBtn) {
          saveBtn.addEventListener("click", function () {
            var st = modalEl.querySelector("#quickOrderStatus").value;
            saveBtn.disabled = true;
            ADMIN.act("POST", "/admin/api/order/" + o.id + "/status", null, { status: st })
              .then(function () {
                ADMIN.toast("Order status updated.", true);
                ADMIN.modal.close();
                self.load(self.state.page);
              })
              .catch(function (e) {
                saveBtn.disabled = false;
                ADMIN.toast(e.message, false);
              });
          });
        }
      }).catch(function () {
        ADMIN.modal.open("Update Status", ADMIN.errorHTML("Network error."), "");
      });
    };
    self.openView = function (row) {
      var list = self.getListEl();
      list.innerHTML = ADMIN.loadingHTML;
      ADMIN.get("/admin/api/order/" + row.id).then(function (res) {
        if (res.auth) return;
        if (!res.ok) { list.innerHTML = ADMIN.errorHTML("Could not load the order."); return; }
        self.renderOrder(res.data.data, list);
      }).catch(function () { list.innerHTML = ADMIN.errorHTML("Network error."); });
    };
    self.renderOrder = function (d, list) {
      var o = d.order;
      var items = (d.items || []).map(function (it) {
        return "<tr><td>" + ADMIN.esc(it.name) + "</td><td><code>" + ADMIN.esc(it.sku) + "</code></td>" +
          "<td>" + ADMIN.esc(it.quantity) + "</td><td>" + ADMIN.esc(it.unit_display) + "</td>" +
          "<td>" + ADMIN.esc(it.line_display) + "</td></tr>";
      }).join("");
      var addr = d.address || {};
      var addrHtml = [addr.name, addr.phone, addr.address_line1, addr.city, addr.postal_code]
        .filter(function (x) { return x; }).map(function (x) { return ADMIN.esc(x); }).join("<br>") || "<em>No address on file.</em>";
      var statusOpts = (d.statuses || []).map(function (s) {
        return '<option value="' + ADMIN.esc(s) + '"' + (s === o.status ? " selected" : "") + ">" + ADMIN.esc(s.replace(/_/g, " ")) + "</option>";
      }).join("");
      list.innerHTML = self.panelHead("Order " + o.order_number) +
        '<div class="row g-3">' +
          '<div class="col-12 col-lg-7">' +
            '<div class="dz-card p-3 p-lg-4 mb-3"><div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">' +
              '<div><span class="dz-eyebrow">Order</span><h2 class="h5 mb-0">' + ADMIN.esc(o.order_number) + "</h2>" +
              '<span class="small text-secondary">Placed ' + ADMIN.esc(o.placed_at) + "</span></div>" +
              ADMIN.badge(o.status) + "</div>" +
              '<div class="table-responsive"><table class="table dz-admin-table mb-0"><thead><tr>' +
              "<th>Product</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Line</th></tr></thead><tbody>" +
              items + "</tbody></table></div></div>" +
            '<div class="dz-card p-3 p-lg-4"><h3 class="h6">Customer</h3>' +
              (d.customer ? "<p class=\"mb-1\"><strong>" + ADMIN.esc(d.customer.name) + "</strong></p><p class=\"mb-0 text-secondary\">" + ADMIN.esc(d.customer.email) + "</p>" : "<p class=\"mb-0 text-secondary\">Guest checkout</p>") +
              '<h3 class="h6 mt-3">Shipping address</h3><p class="mb-0 small">' + addrHtml + "</p></div>" +
          "</div>" +
          '<div class="col-12 col-lg-5">' +
            '<div class="dz-card p-3 p-lg-4 mb-3"><h3 class="h6">Update status</h3>' +
              '<div class="input-group"><select id="orderStatus" class="form-select">' + statusOpts + "</select>" +
              '<button class="btn btn-primary" data-act="status">Save</button></div>' +
              '<div class="dz-totals mt-3">' +
                self.totalRow("Subtotal", d.subtotal_display) + self.totalRow("Discount", d.discount_display) +
                self.totalRow("Shipping", d.shipping_display) + self.totalRow("Tax", d.tax_display) +
                self.totalRow("Total", d.total_display, true) + "</div></div>" +
          "</div>" +
        "</div>";
      var btn = list.querySelector('[data-act="status"]');
      btn.addEventListener("click", function () {
        var st = list.querySelector("#orderStatus").value;
        btn.disabled = true;
        ADMIN.act("POST", "/admin/api/order/" + o.id + "/status", null, { status: st })
          .then(function () { ADMIN.toast("Order status updated.", true); self.openView({ id: o.id }); })
          .catch(function (e) { btn.disabled = false; ADMIN.toast(e.message, false); });
      });
    };
    self.totalRow = function (label, value, grand) {
      return '<div class="total-line' + (grand ? " total-grand" : "") + '"><span>' + ADMIN.esc(label) + "</span><strong>" + ADMIN.esc(value) + "</strong></div>";
    };
    self.mount();
  }

  // ---- Products (list + full editor) ----
  function ProductsModule(root) {
    var self = new ListModule(root, {});
    self.module = "products";
    var cfg = {
      module: "products", title: "Products", eyebrow: "Catalog",
      description: "Create products, manage visibility, stock, media and variants.",
      endpoint: "/admin/api/list/products", searchPlaceholder: "Search name or SKU",
      addLabel: "Add product", emptyText: "No products yet — add your first one.",
      filters: [{ key: "status", label: "Status", options: [
        { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" }
      ] }],
      columns: [
        { label: "Image", render: function (r) {
            return r.has_thumb ? '<img class="dz-admin-thumb" src="' + ADMIN.esc(r.thumb) + '" alt="">'
              : '<span class="dz-admin-thumb dz-admin-thumb-empty">—</span>';
          } },
        { label: "Product", render: function (r) {
            return "<strong>" + ADMIN.esc(r.name) + "</strong>" +
              (r.is_featured ? ' <span class="badge text-bg-warning ms-1">Featured</span>' : "") +
              '<span class="small text-secondary d-block">' + ADMIN.esc(r.category_name || "Uncategorized") +
              (r.brand_name ? ' · ' + ADMIN.esc(r.brand_name) : '') + "</span>";
          } },
        { label: "SKU", render: function (r) { return "<code>" + ADMIN.esc(r.sku) + "</code>"; } },
        { label: "Price", render: function (r) { return "<strong>" + ADMIN.esc(r.price_display) + "</strong>"; } },
        { label: "Stock", render: function (r) {
            var low = r.is_low_stock ? ' <span class="badge bg-warning-subtle text-warning border border-warning-subtle ms-1">Low</span>' : '';
            return '<strong>' + ADMIN.esc(r.available) + '</strong> <span class="small text-secondary">avail</span>' + low;
          } },
        { label: "Status", render: function (r) { return ADMIN.badge(r.status); } }
      ],
      rowActions: function (row) {
        var acts = [
          { label: "Manage", cls: "btn-primary", onClick: function (r) { self.openEditor(r.id); } }
        ];
        if (row && row.slug) {
          acts.push({
            label: "View", cls: "btn-light border", onClick: function (r) {
              window.open("/product/" + r.slug, "_blank");
            }
          });
        }
        acts.push({
          label: "Delete", cls: "btn-outline-danger", danger: true, confirm: "Delete this product? Products tied to orders cannot be deleted.",
          confirmLabel: "Delete", onClick: function (r, reload) {
            ADMIN.act("POST", "/admin/api/products/" + r.id + "/delete-form").then(function () {
              ADMIN.toast("Product deleted.", true); reload();
            }).catch(function (e) { ADMIN.toast(e.message, false); });
          }
        });
        return acts;
      },
      onAdd: function () { self.openCreate(); }
    };
    self.applyConfig(cfg);

    self.openCreate = function () {
      ADMIN.loadOptions().then(function (opt) {
        var form = ADMIN.buildForm({
          fields: [
            { name: "name", label: "Name", required: true, placeholder: "Product name" },
            { name: "sku", label: "SKU", required: true, placeholder: "e.g. AUD-001" },
            { name: "category_id", label: "Category", type: "select", required: true,
              options: opt.categories.map(function (c) { return { value: c.id, label: c.name }; }) },
            { name: "brand_id", label: "Brand", type: "select",
              options: [{ value: "", label: "No brand" }].concat(opt.brands.map(function (b) { return { value: b.id, label: b.name }; })) },
            { name: "price", label: "Price (" + ADMIN.currency + ")", type: "number", min: 0.01, step: "0.01", required: true, placeholder: "0.00" },
            { name: "compare_at", label: "Compare-at price (" + ADMIN.currency + ")", type: "number", min: 0, step: "0.01" },
            { name: "cost", label: "Cost price (" + ADMIN.currency + ")", type: "number", min: 0, step: "0.01" },
            { name: "tax_percent", label: "Tax rate (%)", type: "number", min: 0, step: "0.01", value: "0" },
            { name: "weight_kg", label: "Weight (kg)", type: "number", min: 0, step: "0.001", value: "0" },
            { name: "stock", label: "Opening stock", type: "number", min: 0, value: "0" },
            { name: "status", label: "Status", type: "select", options: [
              { value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "archived", label: "Archived" } ] },
            { name: "short_description", label: "Short description", type: "textarea", rows: 2 },
            { name: "description", label: "Description", type: "textarea", rows: 4 }
          ],
          values: { status: "draft" }, submitLabel: "Create product",
          onSubmit: function (data) {
            return ADMIN.act("POST", "/admin/api/products/create", null, data).then(function () {
              ADMIN.toast("Product created.", true);
              ADMIN.modal.close();
              self.load(1);
            });
          },
          onCancel: function () { ADMIN.modal.close(); }
        });
        ADMIN.modal.open("Add Product", form, "", "modal-lg");
      });
    };

    self.openEditor = function (id) {
      var list = self.getListEl();
      list.innerHTML = ADMIN.loadingHTML;
      ADMIN.get("/admin/api/product-full/" + id).then(function (res) {
        if (res.auth) return;
        if (!res.ok) { list.innerHTML = ADMIN.errorHTML("Could not load the product."); return; }
        self.renderEditor(res.data.data, list);
      }).catch(function () { list.innerHTML = ADMIN.errorHTML("Network error."); });
    };

    self.renderEditor = function (d, list) {
      var p = d.product;
      var inv = d.inventory || { quantity: 0, reserved: 0, low_stock_threshold: 0 };
      var avail = inv.quantity - inv.reserved; if (avail < 0) avail = 0;
      var gallery = (d.images || []).map(function (img, i) {
        return '<figure class="dz-gallery-item' + (img.is_primary ? " is-cover" : "") + '" data-id="' + img.id + '">' +
          '<img class="dz-gallery-thumb" src="' + ADMIN.esc(img.url) + '" alt="' + ADMIN.esc(img.alt_text) + '">' +
          '<figcaption class="small">' + (img.is_primary ? '<span class="badge text-bg-primary">Cover</span>' : "") +
          ' <button class="btn btn-light border btn-sm mt-1" data-act="img-alt" data-id="' + img.id + '">Alt</button>' +
          (img.is_primary ? "" : '<button class="btn btn-light border btn-sm mt-1" data-act="img-cover" data-id="' + img.id + '">Cover</button>') +
          (i > 0 ? '<button class="btn btn-light border btn-sm mt-1" data-act="img-up" data-id="' + img.id + '">↑</button>' : "") +
          (i < d.images.length - 1 ? '<button class="btn btn-light border btn-sm mt-1" data-act="img-down" data-id="' + img.id + '">↓</button>' : "") +
          '<button class="btn btn-outline-danger btn-sm mt-1" data-act="img-del" data-id="' + img.id + '">Delete</button>' +
          "</figcaption></figure>";
      }).join("");
      var variants = (d.variants || []).map(function (v) {
        return "<tr data-vid=\"" + v.id + "\">" +
          "<td><input class=\"form-control form-control-sm\" data-vf=\"name\" value=\"" + ADMIN.esc(v.name) + "\"></td>" +
          "<td><code>" + ADMIN.esc(v.sku) + "</code></td>" +
          "<td><input class=\"form-control form-control-sm\" data-vf=\"price\" type=\"number\" min=\"0.01\" step=\"0.01\" value=\"" + ADMIN.esc(v.price_major) + "\"></td>" +
          "<td><select class=\"form-select form-select-sm\" data-vf=\"is_active\"><option value=\"1\"" + (v.is_active ? " selected" : "") + ">Active</option><option value=\"0\"" + (v.is_active ? "" : " selected") + ">Inactive</option></select></td>" +
          '<td><button class="btn btn-light border btn-sm" data-act="var-save" data-vid="' + v.id + '">Save</button> ' +
          '<button class="btn btn-outline-danger btn-sm" data-act="var-del" data-vid="' + v.id + '">Delete</button></td></tr>';
      }).join("");

      var catOpts = d.categories.map(function (c) { return '<option value="' + c.id + '"' + (c.id === p.category_id ? " selected" : "") + ">" + ADMIN.esc(c.name) + "</option>"; }).join("");
      var brandOpts = '<option value="">No brand</option>' + d.brands.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === p.brand_id ? " selected" : "") + ">" + ADMIN.esc(b.name) + "</option>";
      }).join("");
      var statusOpts = ["draft", "published", "archived"].map(function (s) {
        return '<option value="' + s + '"' + (s === p.status ? " selected" : "") + ">" + s + "</option>";
      }).join("");

      list.innerHTML = self.panelHead("Product editor") +
        '<div class="dz-editor-breadcrumb mb-2"><code>' + ADMIN.esc(p.sku) + "</code> · " + ADMIN.esc(p.slug) + "</div>" +
        '<div class="row g-3">' +
          '<div class="col-12 col-lg-7">' +
            '<div class="dz-card p-3 p-lg-4 mb-3"><h3 class="h6">Product details</h3>' +
              '<form data-form="details">' +
                '<div class="row g-2">' +
                  field("name", "Name", "text", p.name, true) +
                  field("sku", "SKU", "text", p.sku, true, true) +
                  '<div class="col-12 col-lg-6"><label class="form-label small">Category</label><select name="category_id" class="form-select">' + catOpts + "</select></div>" +
                  '<div class="col-12 col-lg-6"><label class="form-label small">Brand</label><select name="brand_id" class="form-select">' + brandOpts + "</select></div>" +
                  field("price", "Price (" + ADMIN.currency + ")", "number", p.price_major, true, false, "0.01", "0.01") +
                  field("compare_at", "Compare-at", "number", p.compare_major, false, false, "0.01", "0") +
                  field("cost", "Cost", "number", p.cost_major, false, false, "0.01", "0") +
                  field("tax_percent", "Tax %", "number", p.tax_percent, false, false, "0.01", "0") +
                  field("weight_kg", "Weight kg", "number", p.weight_kg, false, false, "0.001", "0") +
                  '<div class="col-6"><label class="form-label small">Status</label><select name="status" class="form-select">' + statusOpts + "</select></div>" +
                  '<div class="col-6"><label class="form-label small">Featured</label><select name="is_featured" class="form-select"><option value="1"' + (p.is_featured ? " selected" : "") + ">Yes</option><option value=\"0\"" + (p.is_featured ? "" : " selected") + ">No</option></select></div>" +
                "</div>" +
                textfield("short_description", "Short description", p.short_description, 2) +
                textfield("description", "Description", p.description, 4) +
                '<button class="btn btn-primary mt-2" type="submit">Save details</button>' +
              "</form></div>" +
            '<div class="dz-card p-3 p-lg-4 mb-3"><div class="d-flex justify-content-between align-items-center mb-2"><h3 class="h6 mb-0">Gallery</h3><button class="btn btn-outline-primary btn-sm" type="button" data-act="upload-modal">Upload in modal</button></div>' +
              '<div class="dz-gallery-grid mb-3">' + (gallery || '<p class="empty-note">No images yet.</p>') + "</div>" +
              '<form data-form="upload" class="dz-upload-form">' +
                '<div class="row g-2 align-items-end">' +
                  '<div class="col-12 col-lg-5"><label class="form-label small">Image file</label><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="form-control" data-base64-target="p-img-b64" data-preview-target="p-img-preview"></div>' +
                  '<div class="col-12 col-lg-4"><label class="form-label small">Alt text</label><input name="alt_text" class="form-control" placeholder="Describe the photo"></div>' +
                  '<div class="col-6 col-lg-2"><div class="form-check"><input class="form-check-input" type="checkbox" name="is_primary" value="1" id="p-img-primary"><label class="form-check-label small" for="p-img-primary">Make cover</label></div></div>' +
                  '<div class="col-6 col-lg-1"><button class="btn btn-primary w-100" type="submit">Upload</button></div>' +
                "</div>" +
                '<input type="hidden" name="image" id="p-img-b64" value="">' +
                '<div id="p-img-preview" class="dz-preview mt-2"></div>' +
              "</form></div>" +
            '<div class="dz-card p-3 p-lg-4"><div class="d-flex justify-content-between align-items-center mb-2"><h3 class="h6 mb-0">Variants</h3><button class="btn btn-outline-primary btn-sm" type="button" data-act="var-add-modal">Add in modal</button></div>' +
              '<div class="table-responsive"><table class="table dz-admin-table mb-2"><thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>State</th><th>Actions</th></tr></thead><tbody>' +
              (variants || '<tr><td colspan="5" class="text-secondary">No variants.</td></tr>') + "</tbody></table></div>" +
              '<form data-form="var-add" class="row g-2 align-items-end">' +
                field("sku", "SKU", "text", "", true) +
                field("name", "Name", "text", "", true) +
                field("price", "Price", "number", "", true, false, "0.01", "0.01") +
                field("compare_at", "Compare-at", "number", "", false, false, "0.01", "0") +
                '<div class="col-12 col-lg-2"><button class="btn btn-primary w-100" type="submit">Add</button></div>' +
              "</form></div>" +
          "</div>" +
          '<div class="col-12 col-lg-5">' +
            '<div class="dz-card p-3 p-lg-4 mb-3"><h3 class="h6">Inventory</h3>' +
              '<div class="dz-stats-row mb-3">' +
                statBox("On hand", inv.quantity) + statBox("Available", avail) + statBox("Reserved", inv.reserved) + statBox("Low at", inv.low_stock_threshold) +
              "</div>" +
              (inv.low_stock ? '<p class="alert alert-warning py-2 small">Low stock.</p>' : "") +
              '<form data-form="restock" class="dz-inv-row"><input name="quantity" type="number" min="1" value="1" class="form-control form-control-sm"><button class="btn btn-primary btn-sm" type="submit">Restock</button></form>' +
              '<form data-form="set-exact" class="dz-inv-row"><input name="quantity" type="number" min="0" value="' + inv.quantity + '" class="form-control form-control-sm"><input name="low_stock_threshold" type="number" min="0" value="' + inv.low_stock_threshold + '" class="form-control form-control-sm"><button class="btn btn-light border btn-sm" type="submit">Set exact</button></form>' +
              '<form data-form="threshold" class="dz-inv-row"><input name="low_stock_threshold" type="number" min="0" value="' + inv.low_stock_threshold + '" class="form-control form-control-sm"><button class="btn btn-light border btn-sm" type="submit">Threshold</button></form>' +
              '<div class="dz-form-feedback small text-secondary mt-2" data-feedback></div>' +
            "</div>" +
            '<div class="dz-card p-3 p-lg-4 mb-3"><h3 class="h6">Search listing (SEO)</h3>' +
              '<form data-form="seo">' +
                field("meta_title", "Meta title", "text", p.meta_title) +
                textfield("meta_description", "Meta description", p.meta_description, 3) +
                '<button class="btn btn-primary mt-2" type="submit">Save SEO</button>' +
              "</form></div>" +
            '<div class="dz-card p-3 p-lg-4"><h3 class="h6">More actions</h3>' +
              '<button class="btn btn-light border mb-2" data-act="featured">Toggle featured</button> ' +
              '<button class="btn btn-outline-danger" data-act="delete-product">Delete product</button></div>' +
          "</div>" +
        "</div>";
      self.bindEditor(list, p.id);
    };

    function field(name, label, type, value, required, disabled, step, min) {
      return '<div class="col-12 col-lg-6"><label class="form-label small">' + label + "</label>" +
        '<input name="' + name + '" type="' + type + '" class="form-control" value="' + ADMIN.esc(value) + '"' +
        (required ? " required" : "") + (disabled ? " disabled" : "") + (step ? ' step="' + step + '"' : "") + (min ? ' min="' + min + '"' : "") + "></div>";
    }
    function textfield(name, label, value, rows) {
      return '<div class="mt-2"><label class="form-label small">' + label + '</label><textarea name="' + name + '" rows="' + rows + '" class="form-control">' + ADMIN.esc(value) + "</textarea></div>";
    }
    function statBox(label, value) {
      return '<div class="dz-stat"><span>' + label + "</span><strong>" + ADMIN.esc(value) + "</strong></div>";
    }
    self.field = field; self.textfield = textfield; self.statBox = statBox;

    self.bindEditor = function (list, id) {
      var self2 = self;
      // delegated clicks
      list.addEventListener("click", function (e) {
        var b = e.target.closest("[data-act]");
        if (!b) return;
        var act = b.getAttribute("data-act");
        var aid = b.getAttribute("data-id");
        var vid = b.getAttribute("data-vid");
        var reload = function () { self2.openEditor(id); };
        if (act === "img-cover") self2.imgAction(id, aid, "primary-form", reload);
        else if (act === "img-up") self2.imgAction(id, aid, "move-form", { direction: -1 }, reload);
        else if (act === "img-down") self2.imgAction(id, aid, "move-form", { direction: 1 }, reload);
        else if (act === "img-del") ADMIN.confirm({ title: "Delete image", message: "Remove this image from the gallery?", confirmLabel: "Delete", danger: true }).then(function (yes) { if (yes) self2.imgAction(id, aid, "delete-form", {}, reload); });
        else if (act === "img-alt") self2.imgAlt(id, aid);
        else if (act === "var-save") self2.varSave(id, vid, b);
        else if (act === "var-del") ADMIN.confirm({ title: "Delete variant", message: "Delete this variant?", confirmLabel: "Delete", danger: true }).then(function (yes) { if (yes) self2.varAction(id, vid, "delete-form", {}, reload); });
        else if (act === "featured") self2.productAction(id, "featured-form", {}, reload);
        else if (act === "upload-modal") self2.uploadModal(id);
        else if (act === "var-add-modal") self2.varModal(id);
        else if (act === "delete-product") ADMIN.confirm({ title: "Delete product", message: "Delete this product? Products linked to orders cannot be deleted.", confirmLabel: "Delete", danger: true }).then(function (yes) { if (yes) self2.productAction(id, "delete-form", {}, function () { self2.showList(); }); });
      });
      // delegated submits
      list.addEventListener("submit", function (e) {
        var form = e.target.closest("[data-form]");
        if (!form) return;
        e.preventDefault();
        var f = form.getAttribute("data-form");
        var fb = list.querySelector("[data-feedback]");
        if (fb) fb.textContent = "Saving…";
        if (f === "details" || f === "seo") {
          ADMIN.act("POST", "/admin/api/products/" + id + "/update", null, serialize(form)).then(function () { ADMIN.toast("Saved.", true); self2.openEditor(id); }).catch(function (er) { if (fb) fb.textContent = ""; ADMIN.toast(er.message, false); });
        } else if (f === "restock") {
          ADMIN.act("POST", "/admin/api/products/" + id + "/inventory/restock", null, serialize(form)).then(function () { self2.openEditor(id); }).catch(function (er) { if (fb) fb.textContent = ""; ADMIN.toast(er.message, false); });
        } else if (f === "set-exact") {
          ADMIN.act("POST", "/admin/api/products/" + id + "/inventory/set-form", null, serialize(form)).then(function () { self2.openEditor(id); }).catch(function (er) { if (fb) fb.textContent = ""; ADMIN.toast(er.message, false); });
        } else if (f === "threshold") {
          ADMIN.act("POST", "/admin/api/products/" + id + "/inventory/threshold-form", null, serialize(form)).then(function () { self2.openEditor(id); }).catch(function (er) { if (fb) fb.textContent = ""; ADMIN.toast(er.message, false); });
        } else if (f === "upload") {
          self2.uploadImage(id, form, fb);
        } else if (f === "var-add") {
          ADMIN.act("POST", "/admin/api/products/" + id + "/variants-form", null, serialize(form)).then(function () { self2.openEditor(id); }).catch(function (er) { if (fb) fb.textContent = ""; ADMIN.toast(er.message, false); });
        }
      });
      // file -> base64
      list.addEventListener("change", function (e) {
        var input = e.target.closest("[data-base64-target]");
        if (!input) return;
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { ADMIN.toast("Image larger than 2 MB.", false); input.value = ""; return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          var target = input.getAttribute("data-base64-target");
          var hidden = list.querySelector("#" + target);
          if (hidden) hidden.value = String(ev.target.result);
          var prev = list.querySelector("#" + input.getAttribute("data-preview-target"));
          if (prev) { prev.innerHTML = '<img src="' + ev.target.result + '" alt="preview">'; }
        };
        reader.readAsDataURL(file);
      });
    };

    self.imgAction = function (id, imgId, suffix, extra, reload) {
      ADMIN.act("POST", "/admin/api/images/" + imgId + "/" + suffix, null, Object.assign({ product_id: id }, extra || {}))
        .then(function () { ADMIN.toast("Gallery updated.", true); reload(); })
        .catch(function (e) { ADMIN.toast(e.message, false); });
    };
    self.productAction = function (id, suffix, extra, done) {
      ADMIN.act("POST", "/admin/api/products/" + id + "/" + suffix, null, extra || {})
        .then(function (r) { ADMIN.toast("Updated.", true); done(); })
        .catch(function (e) { ADMIN.toast(e.message, false); });
    };
    self.varAction = function (id, vid, suffix, extra, reload) {
      ADMIN.act("POST", "/admin/api/products/" + id + "/variants/" + vid + "/" + suffix, null, extra || {})
        .then(function () { ADMIN.toast("Variant updated.", true); reload(); })
        .catch(function (e) { ADMIN.toast(e.message, false); });
    };
    self.varSave = function (id, vid, btn) {
      var row = btn.closest("tr");
      var data = {};
      row.querySelectorAll("[data-vf]").forEach(function (inp) { data[inp.getAttribute("data-vf")] = inp.value; });
      self.varAction(id, vid, "update-form", data, function () { self.openEditor(id); });
    };
    self.imgAlt = function (id, imgId) {
      ADMIN.get("/admin/api/product-full/" + id).then(function (res) {
        if (!res.ok) return;
        var img = (res.data.data.images || []).filter(function (x) { return String(x.id) === String(imgId); })[0];
        if (!img) return;
        var body = '<form id="altForm"><label class="form-label small">Alt text</label><input name="alt_text" class="form-control" value="' + ADMIN.esc(img.alt_text) + '"></form>';
        var footer = '<button class="btn btn-light border" data-cc>Cancel</button><button class="btn btn-primary" data-cy>Save</button>';
        ADMIN.modal.open("Edit alt text", body, footer);
        var modalEl = document.getElementById("adminModal");
        modalEl.querySelector("[data-cy]").onclick = function () {
          var val = modalEl.querySelector('[name="alt_text"]').value;
          self.imgAction(id, imgId, "update-form", { alt_text: val }, function () { ADMIN.modal.close(); self.openEditor(id); });
        };
      });
    };
    self.uploadImage = function (id, form, fb) {
      var hidden = form.querySelector("#p-img-b64");
      if (!hidden || hidden.value === "") { ADMIN.toast("Pick an image file first.", false); return; }
      ADMIN.act("POST", "/admin/api/products/" + id + "/images-form", null, serialize(form))
        .then(function () { ADMIN.toast("Image uploaded.", true); self.openEditor(id); })
        .catch(function (e) { if (fb) fb.textContent = ""; ADMIN.toast(e.message, false); });
    };
    self.uploadModal = function (id) {
      ADMIN.ensureModalHost();
      var body =
        '<form id="modalUploadForm">' +
          '<div class="mb-3">' +
            '<label class="form-label small">Image file (PNG, JPG, WebP, GIF)</label>' +
            '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="form-control" id="modalImgFile">' +
          '</div>' +
          '<div class="mb-3">' +
            '<label class="form-label small">Alt text</label>' +
            '<input name="alt_text" id="modalImgAlt" class="form-control" placeholder="Describe the photo">' +
          '</div>' +
          '<div class="form-check mb-3">' +
            '<input class="form-check-input" type="checkbox" name="is_primary" value="1" id="modalImgCover">' +
            '<label class="form-check-label small" for="modalImgCover">Make cover photo</label>' +
          '</div>' +
          '<input type="hidden" name="image" id="modalImgB64" value="">' +
          '<div id="modalImgPreview" class="dz-preview mt-2"></div>' +
        '</form>';
      var footer =
        '<button class="btn btn-light border" data-cc>Cancel</button>' +
        '<button class="btn btn-primary" id="modalUploadBtn">Upload</button>';
      ADMIN.modal.open("Upload product image", body, footer);
      var modalEl = document.getElementById("adminModal");
      var fileInput = modalEl.querySelector("#modalImgFile");
      var b64Input = modalEl.querySelector("#modalImgB64");
      var preview = modalEl.querySelector("#modalImgPreview");
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { ADMIN.toast("Image larger than 2 MB.", false); fileInput.value = ""; return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          b64Input.value = String(ev.target.result);
          preview.innerHTML = '<img src="' + ev.target.result + '" alt="preview" style="max-height:120px;border-radius:8px;border:1px solid #e6e9ef;">';
        };
        reader.readAsDataURL(file);
      });
      modalEl.querySelector("#modalUploadBtn").onclick = function () {
        if (!b64Input.value) { ADMIN.toast("Pick an image file first.", false); return; }
        var alt = modalEl.querySelector("#modalImgAlt").value;
        var cover = modalEl.querySelector("#modalImgCover").checked ? 1 : 0;
        var payload = { image: b64Input.value, alt_text: alt, is_primary: cover };
        ADMIN.act("POST", "/admin/api/products/" + id + "/images-form", null, payload)
          .then(function () {
            ADMIN.toast("Image uploaded.", true);
            ADMIN.modal.close();
            self.openEditor(id);
          })
          .catch(function (e) {
            ADMIN.toast(e.message, false);
          });
      };
    };
    self.varModal = function (id) {
      ADMIN.ensureModalHost();
      var body =
        '<form id="modalVarForm">' +
          '<div class="mb-3">' +
            '<label class="form-label small">SKU</label>' +
            '<input name="sku" id="modalVarSku" class="form-control" required placeholder="e.g. VAR-001">' +
          '</div>' +
          '<div class="mb-3">' +
            '<label class="form-label small">Name</label>' +
            '<input name="name" id="modalVarName" class="form-control" required placeholder="e.g. Red / XL">' +
          '</div>' +
          '<div class="mb-3">' +
            '<label class="form-label small">Price (' + ADMIN.currency + ')</label>' +
            '<input name="price" id="modalVarPrice" type="number" min="0.01" step="0.01" class="form-control" required placeholder="0.00">' +
          '</div>' +
          '<div class="mb-3">' +
            '<label class="form-label small">Compare-at price (' + ADMIN.currency + ')</label>' +
            '<input name="compare_at" id="modalVarCompare" type="number" min="0" step="0.01" class="form-control" placeholder="0.00">' +
          '</div>' +
        '</form>';
      var footer =
        '<button class="btn btn-light border" data-cc>Cancel</button>' +
        '<button class="btn btn-primary" id="modalVarBtn">Add variant</button>';
      ADMIN.modal.open("Add product variant", body, footer);
      var modalEl = document.getElementById("adminModal");
      modalEl.querySelector("#modalVarBtn").onclick = function () {
        var sku = modalEl.querySelector("#modalVarSku").value.trim();
        var name = modalEl.querySelector("#modalVarName").value.trim();
        var price = modalEl.querySelector("#modalVarPrice").value.trim();
        var compare = modalEl.querySelector("#modalVarCompare").value.trim();
        if (!sku || !name || !price) { ADMIN.toast("SKU, Name and Price are required.", false); return; }
        var payload = { sku: sku, name: name, price: price, compare_at: compare };
        ADMIN.act("POST", "/admin/api/products/" + id + "/variants-form", null, payload)
          .then(function () {
            ADMIN.toast("Variant added.", true);
            ADMIN.modal.close();
            self.openEditor(id);
          })
          .catch(function (e) {
            ADMIN.toast(e.message, false);
          });
      };
    };

    function serialize(form) {
      var data = {};
      var els = form.querySelectorAll("input[name], select[name], textarea[name]");
      els.forEach(function (el) {
        if (el.type === "checkbox") data[el.name] = el.checked ? 1 : 0;
        else if (el.id === "p-img-b64") { if (el.value) data[el.name] = el.value; }
        else if (el.name) data[el.name] = el.value;
      });
      return data;
    }
    self.mount();
  }

  // ---- Overview ----
  function OverviewModule(root) {
    root.innerHTML = ADMIN.loadingHTML;
    ADMIN.get("/admin/api/overview").then(function (res) {
      if (res.auth) return;
      if (!res.ok) { root.innerHTML = ADMIN.errorHTML("Could not load the dashboard."); return; }
      var d = res.data.data;
      var recent = (d.recent_orders || []).map(function (o) {
        var cust = ADMIN.esc(o.customer_name || "Guest");
        var itemsTxt = typeof o.item_count === "number" ? ' <span class="text-secondary">(' + o.item_count + ' items)</span>' : "";
        return '<tr><td><a class="fw-semibold text-decoration-none" href="/admin/orders/' + (o.id || '') + '"><code>' + ADMIN.esc(o.order_number) + '</code></a></td>' +
          '<td class="small">' + cust + itemsTxt + '</td>' +
          '<td>' + ADMIN.badge(o.status) + '</td>' +
          '<td><strong>' + ADMIN.esc(o.total_display) + '</strong></td>' +
          '<td><a class="btn btn-outline-primary btn-sm" href="/admin/orders/' + (o.id || '') + '">View</a></td></tr>';
      }).join("");

      var lowStockHtml = "";
      if (d.low_stock_items && d.low_stock_items.length > 0) {
        lowStockHtml = '<div class="list-group list-group-flush small">' + d.low_stock_items.map(function (item) {
          return '<div class="list-group-item px-0 d-flex justify-content-between align-items-center">' +
            '<div><a href="/admin/products/' + item.product_id + '" class="fw-semibold text-decoration-none">' + ADMIN.esc(item.name) + '</a>' +
            '<div class="text-secondary">SKU: <code>' + ADMIN.esc(item.sku) + '</code> &middot; Min: ' + ADMIN.esc(item.low_stock_threshold) + '</div></div>' +
            '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">' + ADMIN.esc(item.quantity) + ' left</span></div>';
        }).join("") + '</div>';
      } else {
        lowStockHtml = '<div class="empty-note py-4"><p class="mb-0 text-secondary small">&#10003; All products are stocked above their low-stock threshold.</p></div>';
      }

      var pctPending = typeof d.pct_pending === "number" ? d.pct_pending : 25;
      var pctProc = typeof d.pct_processing === "number" ? d.pct_processing : 25;
      var pctShip = typeof d.pct_shipped === "number" ? d.pct_shipped : 25;
      var pctDeliv = typeof d.pct_delivered === "number" ? d.pct_delivered : 25;

      var kpiCards =
        '<div class="dz-stat-card dz-stat-revenue text-bg-orange">' +
          '<div class="dz-stat-top"><span class="dz-stat-title">Settled Revenue</span><span class="dz-stat-badge">Settled</span></div>' +
          '<strong class="dz-stat-value">' + ADMIN.esc(d.revenue_display) + '</strong>' +
          '<div class="dz-stat-hint">Excludes refunds &amp; pending checkouts</div>' +
        '</div>' +
        '<div class="dz-stat-card">' +
          '<div class="dz-stat-top"><span class="dz-stat-title">Total Orders</span><span class="badge bg-primary-subtle text-primary border border-primary-subtle">All time</span></div>' +
          '<strong class="dz-stat-value">' + ADMIN.esc(d.orders) + '</strong>' +
          '<div class="dz-stat-hint">' + ADMIN.esc(d.pipeline_delivered || 0) + ' delivered &middot; ' + ADMIN.esc(d.pipeline_processing || 0) + ' processing</div>' +
        '</div>' +
        '<div class="dz-stat-card">' +
          '<div class="dz-stat-top"><span class="dz-stat-title">Awaiting Payment</span><span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Pending</span></div>' +
          '<strong class="dz-stat-value">' + ADMIN.esc(d.pending_orders) + '</strong>' +
          '<div class="dz-stat-hint">Requires customer payment</div>' +
        '</div>' +
        '<div class="dz-stat-card">' +
          '<div class="dz-stat-top"><span class="dz-stat-title">Customers</span><span class="badge bg-info-subtle text-info-emphasis border border-info-subtle">Shoppers</span></div>' +
          '<strong class="dz-stat-value">' + ADMIN.esc(d.customers) + '</strong>' +
          '<div class="dz-stat-hint">Registered store accounts</div>' +
        '</div>' +
        '<div class="dz-stat-card">' +
          '<div class="dz-stat-top"><span class="dz-stat-title">Published Products</span><span class="badge bg-success-subtle text-success border border-success-subtle">Live</span></div>' +
          '<strong class="dz-stat-value">' + ADMIN.esc(d.published_products) + ' <small class="text-secondary fw-normal">/ ' + ADMIN.esc(d.products) + '</small></strong>' +
          '<div class="dz-stat-hint">' + ADMIN.esc(d.categories || 0) + ' categories &middot; ' + ADMIN.esc(d.brands || 0) + ' brands</div>' +
        '</div>' +
        '<div class="dz-stat-card">' +
          '<div class="dz-stat-top"><span class="dz-stat-title">Low Stock Alert</span><span class="badge ' + (d.low_stock > 0 ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-secondary-subtle text-secondary border border-secondary-subtle') + '">Restock</span></div>' +
          '<strong class="dz-stat-value">' + ADMIN.esc(d.low_stock) + '</strong>' +
          '<div class="dz-stat-hint">At or below reorder point</div>' +
        '</div>';

      var analyticsRow =
        '<div class="row g-3 my-1">' +
          '<div class="col-12 col-lg-7">' +
            '<div class="dz-card p-3 p-lg-4 h-100">' +
              '<div class="d-flex justify-content-between align-items-center mb-3">' +
                '<div><h2 class="h6 mb-0 fw-bold">Order Fulfilment Pipeline</h2><span class="small text-secondary">Current delivery lifecycle breakdown</span></div>' +
                '<span class="badge text-bg-light border">Live status</span>' +
              '</div>' +
              '<div class="dz-pipeline-progress mb-3">' +
                '<div class="progress" style="height: 12px;">' +
                  '<div class="progress-bar bg-warning" role="progressbar" style="width: ' + pctPending + '%" title="Pending"></div>' +
                  '<div class="progress-bar bg-primary" role="progressbar" style="width: ' + pctProc + '%" title="Processing"></div>' +
                  '<div class="progress-bar bg-info" role="progressbar" style="width: ' + pctShip + '%" title="Shipped"></div>' +
                  '<div class="progress-bar bg-success" role="progressbar" style="width: ' + pctDeliv + '%" title="Delivered"></div>' +
                '</div>' +
              '</div>' +
              '<div class="row g-2 text-center small">' +
                '<div class="col-3"><div class="p-2 rounded bg-light border"><div class="fw-bold text-dark">' + ADMIN.esc(d.pipeline_pending || 0) + '</div><div class="text-secondary"><span class="d-inline-block rounded-circle bg-warning me-1" style="width:8px;height:8px;"></span>Pending</div></div></div>' +
                '<div class="col-3"><div class="p-2 rounded bg-light border"><div class="fw-bold text-dark">' + ADMIN.esc(d.pipeline_processing || 0) + '</div><div class="text-secondary"><span class="d-inline-block rounded-circle bg-primary me-1" style="width:8px;height:8px;"></span>Processing</div></div></div>' +
                '<div class="col-3"><div class="p-2 rounded bg-light border"><div class="fw-bold text-dark">' + ADMIN.esc(d.pipeline_shipped || 0) + '</div><div class="text-secondary"><span class="d-inline-block rounded-circle bg-info me-1" style="width:8px;height:8px;"></span>Shipped</div></div></div>' +
                '<div class="col-3"><div class="p-2 rounded bg-light border"><div class="fw-bold text-dark">' + ADMIN.esc(d.pipeline_delivered || 0) + '</div><div class="text-secondary"><span class="d-inline-block rounded-circle bg-success me-1" style="width:8px;height:8px;"></span>Delivered</div></div></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="col-12 col-lg-5">' +
            '<div class="dz-card p-3 p-lg-4 h-100">' +
              '<h2 class="h6 mb-3 fw-bold">Quick Shortcuts</h2>' +
              '<div class="row g-2">' +
                '<div class="col-6"><a href="/admin/products" class="dz-quick-link-card"><span class="dz-quick-icon dz-icon-products"></span><strong>Products</strong><small class="text-secondary">Manage catalog</small></a></div>' +
                '<div class="col-6"><a href="/admin/orders" class="dz-quick-link-card"><span class="dz-quick-icon dz-icon-orders"></span><strong>Orders</strong><small class="text-secondary">Process shipping</small></a></div>' +
                '<div class="col-6"><a href="/admin/inventory" class="dz-quick-link-card"><span class="dz-quick-icon dz-icon-inventory"></span><strong>Inventory</strong><small class="text-secondary">Adjust stock</small></a></div>' +
                '<div class="col-6"><a href="/admin/settings" class="dz-quick-link-card"><span class="dz-quick-icon dz-icon-settings"></span><strong>Settings</strong><small class="text-secondary">Store config</small></a></div>' +
                '<div class="col-6"><a href="/admin/shipping" class="dz-quick-link-card"><span class="dz-quick-icon dz-icon-orders"></span><strong>Shipping Zones</strong><small class="text-secondary">Regional rates</small></a></div>' +
                '<div class="col-6"><a href="/admin/coupons" class="dz-quick-link-card"><span class="dz-quick-icon dz-icon-coupons"></span><strong>Coupons (' + ADMIN.esc(d.coupons || 0) + ')</strong><small class="text-secondary">Promo codes</small></a></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      root.innerHTML =
        '<div class="dz-admin-page-head">' +
          '<div><span class="dz-eyebrow">Store Intelligence</span><h1 class="page-title">Executive Dashboard</h1>' +
          '<p class="page-description">Real-time overview of revenue performance, catalog status, and order activity.</p></div>' +
          '<div class="dz-admin-page-head-actions">' +
            '<a class="btn btn-primary d-inline-flex align-items-center gap-1" href="/admin/products#new-product-name"><span aria-hidden="true">+</span> Add product</a>' +
            '<a class="btn btn-light border d-inline-flex align-items-center gap-1" href="/admin/orders">View orders</a>' +
            '<a class="btn btn-light border d-inline-flex align-items-center gap-1" href="/admin/settings">Store settings</a>' +
          '</div>' +
        '</div>' +
        '<div class="dz-stat-grid my-3">' + kpiCards + '</div>' +
        analyticsRow +
        '<div class="row g-3 my-2">' +
          '<div class="col-12 col-lg-8">' +
            '<div class="dz-card p-3 p-lg-4 h-100">' +
              '<div class="dz-section-heading mb-3 d-flex justify-content-between align-items-center">' +
                '<div><h2 class="h6 mb-0 fw-bold">Recent Orders</h2><p class="small text-secondary mb-0">Latest customer orders requiring fulfilment</p></div>' +
                '<a class="btn btn-light border btn-sm" href="/admin/orders">View all orders &rarr;</a>' +
              '</div>' +
              (d.has_recent
                ? '<div class="table-responsive"><table class="table dz-admin-table table-hover align-middle mb-0"><thead><tr>' +
                  '<th>Order #</th><th>Customer</th><th>Status</th><th>Total</th><th>Action</th></tr></thead><tbody>' + recent + '</tbody></table></div>'
                : '<div class="empty-note py-4"><p class="mb-0 text-secondary">No orders recorded yet. They will appear here automatically when shoppers check out.</p></div>') +
            '</div>' +
          '</div>' +
          '<div class="col-12 col-lg-4">' +
            '<div class="dz-card p-3 p-lg-4 h-100">' +
              '<div class="d-flex justify-content-between align-items-center mb-3">' +
                '<div><h2 class="h6 mb-0 fw-bold">Low Stock Watchlist</h2><p class="small text-secondary mb-0">Products at or below threshold</p></div>' +
                '<a class="btn btn-light border btn-sm" href="/admin/inventory">Inventory &rarr;</a>' +
              '</div>' +
              lowStockHtml +
            '</div>' +
          '</div>' +
        '</div>';
    }).catch(function () { root.innerHTML = ADMIN.errorHTML("Network error."); });
  }

  // ---- Settings ----
  var SETTING_META = {
    // 1. General Store
    "store.name": {
      label: "Store Brand Name",
      hint: "Brand name shown in navigation headers, browser titles, invoices, and customer emails.",
      type: "text"
    },
    "store.tagline": {
      label: "Store Tagline / Slogan",
      hint: "Short slogan or subtitle displayed in the storefront footer and social previews.",
      type: "text"
    },
    "store.support_email": {
      label: "Customer Support Email",
      hint: "Primary email address where order notifications and customer inquiries are directed.",
      type: "email"
    },
    "store.support_phone": {
      label: "Customer Support Phone / Hotline",
      hint: "Hotline phone number visible in the storefront topbar, help center, and checkout.",
      type: "tel"
    },
    "store.address": {
      label: "Physical Store / Office Address",
      hint: "Official business headquarters or warehouse dispatch location printed on packing slips.",
      type: "text"
    },
    "store.currency": {
      label: "Base Store Currency",
      hint: "Three-letter ISO currency code (BDT, USD, EUR). All catalog prices and ledger items are stored in this currency.",
      type: "select",
      options: [
        { value: "BDT", label: "BDT — Bangladeshi Taka (৳)" },
        { value: "USD", label: "USD — US Dollar ($)" },
        { value: "EUR", label: "EUR — Euro (€)" }
      ]
    },
    "store.locale": {
      label: "Default Storefront Language",
      hint: "Default language code for storefront pages and emails when no cookie preference is set.",
      type: "select",
      options: [
        { value: "en", label: "English (en)" },
        { value: "bn", label: "বাংলা / Bengali (bn)" }
      ]
    },
    "store.order_prefix": {
      label: "Order Number Prefix",
      hint: "Prefix string prepended to all auto-generated customer order numbers (e.g. SP-).",
      type: "text"
    },

    // 2. Shipping & Delivery
    "shipping.flat_minor": {
      label: "Standard Flat Shipping Fee (Minor Units)",
      hint: "Default standard delivery charge when order is below the free-shipping threshold (100 = 1.00 BDT, e.g. 6000 = 60.00 BDT).",
      type: "minor",
      unit: "minor"
    },
    "shipping.express_minor": {
      label: "Express Delivery Fee (Minor Units)",
      hint: "Priority 24h express delivery charge in minor units (e.g. 12000 = 120.00 BDT).",
      type: "minor",
      unit: "minor"
    },
    "shipping.free_threshold_minor": {
      label: "Free Standard Shipping Threshold (Minor Units)",
      hint: "Orders at or above this subtotal qualify for free standard shipping (e.g. 200000 = 2,000.00 BDT).",
      type: "minor",
      unit: "minor"
    },
    "shipping.standard_lead_days": {
      label: "Standard Delivery Lead Time",
      hint: "Estimated transit time shown on product pages and at checkout for standard delivery.",
      type: "text"
    },
    "shipping.express_lead_days": {
      label: "Express Delivery Lead Time",
      hint: "Estimated transit time shown on product pages and at checkout for priority express delivery.",
      type: "text"
    },
    "returns.window_days": {
      label: "Return Eligibility Window (Days)",
      hint: "Number of days following confirmed order delivery during which customers can request a return.",
      type: "days",
      unit: "days"
    },
    "returns.allow_customer_returns": {
      label: "Customer Self-Service Returns",
      hint: "Allow authenticated customers to submit return requests online from their account order history.",
      type: "boolean"
    },

    // 3. Promotions & Loyalty
    "cart.discount_threshold_minor": {
      label: "Volume Discount Subtotal Threshold (Minor Units)",
      hint: "Minimum cart subtotal required to trigger the automatic volume discount (e.g. 100000 = 1,000.00 BDT).",
      type: "minor",
      unit: "minor"
    },
    "cart.discount_bps": {
      label: "Volume Discount Rate (Basis Points)",
      hint: "Automatic percentage discount applied above threshold (100 bps = 1.00%, 500 bps = 5.00%).",
      type: "bps",
      unit: "bps"
    },
    "loyalty.spend_per_point_minor": {
      label: "Spend Amount Required per 1 Loyalty Point (Minor Units)",
      hint: "How much a customer must spend on paid orders to earn 1 loyalty point (e.g. 10000 = 100.00 BDT).",
      type: "minor",
      unit: "minor"
    },
    "loyalty.point_value_minor": {
      label: "Redemption Credit Value per 1 Point (Minor Units)",
      hint: "Store credit value granted when a customer redeems 1 loyalty point (e.g. 100 = 1.00 BDT).",
      type: "minor",
      unit: "minor"
    },
    "referrals.referrer_bonus_points": {
      label: "Referrer Reward Points (Points)",
      hint: "Loyalty points awarded to an existing customer when their referred friend completes their first paid order.",
      type: "number",
      unit: "pts"
    },
    "referrals.referee_bonus_points": {
      label: "Referred Friend Welcome Bonus (Points)",
      hint: "Loyalty points awarded to the new customer when they sign up with a valid referral code.",
      type: "number",
      unit: "pts"
    },

    // 4. Tax & VAT
    "store.tax_rate_bps": {
      label: "Default Store Tax / VAT Rate (Basis Points)",
      hint: "Fallback tax rate in basis points when a product does not specify its own tax rate (0 = Tax-exempt, 500 = 5.00%, 750 = 7.50%).",
      type: "bps",
      unit: "bps"
    },
    "store.tax_included": {
      label: "Catalog Pricing Tax Mode",
      hint: "Whether product prices entered in the catalog already include VAT/tax or if tax is calculated on top at checkout.",
      type: "select",
      options: [
        { value: "0", label: "Exclusive — Tax added on top at checkout" },
        { value: "1", label: "Inclusive — Catalog prices already include Tax/VAT" }
      ]
    },
    "store.tax_number": {
      label: "Business Identification Number / VAT Reg No (BIN)",
      hint: "Official government tax registration number displayed on customer VAT invoices and receipts.",
      type: "text"
    },

    // 5. Payment Gateways
    "payments.mode": {
      label: "Gateway Environment Mode",
      hint: "Set to Sandbox for test transactions without real money; switch to Live for production processing.",
      type: "select",
      options: [
        { value: "sandbox", label: "Sandbox / Test Environment (Safe)" },
        { value: "live", label: "Live / Production Environment" }
      ]
    },
    "payments.cod_enabled": {
      label: "Cash on Delivery (COD) Payment",
      hint: "Allow customers to pay cash when their parcel arrives at their doorstep.",
      type: "boolean"
    },
    "payments.cod_max_limit_minor": {
      label: "COD Maximum Order Limit (Minor Units)",
      hint: "Maximum order total eligible for Cash on Delivery (e.g. 5000000 = 50,000.00 BDT; enter 0 for unlimited).",
      type: "minor",
      unit: "minor"
    },
    "payments.bkash_enabled": {
      label: "bKash Mobile Financial Service",
      hint: "Accept mobile payments via bKash gateway / merchant API.",
      type: "boolean"
    },
    "payments.nagad_enabled": {
      label: "Nagad Mobile Financial Service",
      hint: "Accept mobile payments via Nagad gateway / merchant API.",
      type: "boolean"
    },
    "payments.sslcommerz_enabled": {
      label: "SSLCommerz Multi-Channel Payment Gateway",
      hint: "Accept Bangladeshi debit/credit cards, internet banking, and mobile wallets via SSLCommerz.",
      type: "boolean"
    },
    "payments.stripe_enabled": {
      label: "Stripe International Credit/Debit Cards",
      hint: "Accept Visa, Mastercard, and American Express cards internationally through Stripe.",
      type: "boolean"
    },
    "payments.webhook_secret": {
      label: "Payment Webhook Verification Secret",
      hint: "Shared HMAC-SHA256 secret key used to cryptographically verify incoming payment gateway webhooks.",
      type: "secret",
      unit: "secret"
    },

    // 6. Storefront & Branding
    "storefront.announcement_enabled": {
      label: "Header Announcement Banner",
      hint: "Show a highlight announcement banner at the very top of all storefront pages.",
      type: "boolean"
    },
    "storefront.announcement_bar": {
      label: "Announcement Banner Text",
      hint: "Promotional message, flash sale notice, or free delivery reminder displayed in the top banner.",
      type: "text"
    },
    "storefront.footer_text": {
      label: "Footer Description & About Notice",
      hint: "Brand description paragraph displayed in the main website footer.",
      type: "textarea"
    },
    "storefront.social_facebook": {
      label: "Facebook Page URL",
      hint: "Official Facebook community or page URL linked from the store footer.",
      type: "url"
    },
    "storefront.social_instagram": {
      label: "Instagram Profile URL",
      hint: "Official Instagram profile URL linked from the store footer.",
      type: "url"
    },

    // 7. Inventory & Order Policies
    "inventory.low_stock_default": {
      label: "Default Low-Stock Threshold",
      hint: "Default reorder point assigned to new products when no custom threshold is specified.",
      type: "number",
      unit: "units"
    },
    "inventory.allow_backorders": {
      label: "Allow Backorders When Out of Stock",
      hint: "Permit customers to purchase products even when current available inventory is zero.",
      type: "boolean"
    },
    "orders.guest_checkout_enabled": {
      label: "Guest Checkout Allowed",
      hint: "Allow visitors to complete checkout without requiring them to create a customer password account.",
      type: "boolean"
    },
    "orders.auto_cancel_unpaid_hours": {
      label: "Auto-Cancel Unpaid Orders Window (Hours)",
      hint: "Automatically mark pending unpaid checkouts as cancelled after this many hours (enter 0 to disable).",
      type: "number",
      unit: "hours"
    }
  };

  function formatSettingPreview(key, val) {
    var meta = SETTING_META[key];
    if (!meta) return "";
    var n = parseInt(val, 10);
    if ((meta.unit === "minor" || meta.type === "minor") && !isNaN(n)) {
      return (ADMIN.currency || "BDT") + " " + (n / 100).toFixed(2);
    }
    if ((meta.unit === "bps" || meta.type === "bps") && !isNaN(n)) {
      return (n / 100).toFixed(2) + "%";
    }
    if ((meta.unit === "days" || meta.type === "days") && !isNaN(n)) {
      return n + " days";
    }
    if (meta.unit === "hours" && !isNaN(n)) {
      return n > 0 ? n + " hrs" : "Never";
    }
    if (meta.unit === "pts" && !isNaN(n)) {
      return n + " pts";
    }
    if (meta.unit === "units" && !isNaN(n)) {
      return n + " units";
    }
    if (meta.type === "boolean") {
      return val === "1" || val === 1 || val === true || val === "true" ? "Enabled" : "Disabled";
    }
    if (meta.type === "select" && meta.options) {
      for (var i = 0; i < meta.options.length; i++) {
        if (String(meta.options[i].value) === String(val)) return meta.options[i].label;
      }
    }
    return "";
  }

  function renderSettingInput(s, meta) {
    var key = ADMIN.esc(s.setting_key);
    var group = ADMIN.esc(s.setting_group || "general");
    var val = s.value == null ? "" : s.value;
    var type = meta ? meta.type : "text";

    if (type === "boolean") {
      var isOne = String(val) === "1" || val === 1 || String(val) === "true";
      return '<select class="form-select" data-setting="' + key + '" data-group="' + group + '">' +
        '<option value="1"' + (isOne ? " selected" : "") + '>1 — Enabled / Active</option>' +
        '<option value="0"' + (!isOne ? " selected" : "") + '>0 — Disabled / Inactive</option>' +
      '</select>';
    }

    if (type === "select" && meta.options) {
      var opts = meta.options.map(function (opt) {
        var sel = String(val) === String(opt.value) ? " selected" : "";
        return '<option value="' + ADMIN.esc(opt.value) + '"' + sel + '>' + ADMIN.esc(opt.label) + '</option>';
      }).join("");
      return '<select class="form-select" data-setting="' + key + '" data-group="' + group + '">' + opts + '</select>';
    }

    if (type === "textarea") {
      return '<textarea class="form-control" rows="3" data-setting="' + key + '" data-group="' + group + '">' + ADMIN.esc(val) + '</textarea>';
    }

    if (type === "secret") {
      return '<div class="input-group">' +
        '<input type="password" class="form-control" data-setting="' + key + '" data-group="' + group + '" value="' + ADMIN.esc(val) + '">' +
        '<button class="btn btn-outline-secondary" type="button" data-toggle-secret title="Toggle visibility">&#128065; Show</button>' +
        '<button class="btn btn-outline-secondary" type="button" data-gen-secret title="Generate random key">&#9889; Generate</button>' +
      '</div>';
    }

    var inputType = "text";
    if (type === "minor" || type === "bps" || type === "days" || type === "number") inputType = "number";
    else if (type === "email") inputType = "email";
    else if (type === "tel") inputType = "tel";
    else if (type === "url") inputType = "url";

    return '<input type="' + inputType + '" class="form-control" data-setting="' + key + '" data-group="' + group + '" value="' + ADMIN.esc(val) + '">';
  }

  function SettingsModule(root) {
    var activeTab = "general";
    function loadSettings() {
      root.innerHTML = ADMIN.loadingHTML;
      ADMIN.get("/admin/api/settings").then(function (res) {
        if (res.auth) return;
        if (!res.ok) { root.innerHTML = ADMIN.errorHTML("Could not load settings."); return; }
        var all = (res.data && res.data.data) || [];
        var byGroup = {
          general: [],
          shipping: [],
          promotions: [],
          tax: [],
          payments: [],
          storefront: [],
          inventory: []
        };
        all.forEach(function (s) {
          var g = s.setting_group || "general";
          if (!byGroup[g]) byGroup[g] = [];
          byGroup[g].push(s);
        });

        var groups = [
          ["general", "General Store", byGroup.general || [], "Store identity, branding, customer contact, and base currency configuration."],
          ["shipping", "Shipping & Returns", byGroup.shipping || [], "Standard & express delivery fees, free shipping threshold, and return window."],
          ["promotions", "Promotions & Loyalty", byGroup.promotions || [], "Automatic cart volume discounts, loyalty points earning/redemption, and referral bonuses."],
          ["tax", "Tax & VAT", byGroup.tax || [], "Store-wide default tax rate, VAT calculation mode, and business tax registration number (BIN)."],
          ["payments", "Payment Gateways", byGroup.payments || [], "Gateway mode (sandbox/live), Cash on Delivery, bKash, Nagad, SSLCommerz, Stripe, and webhook security."],
          ["storefront", "Storefront & Branding", byGroup.storefront || [], "Header announcement bar notice, footer descriptions, and social media channel links."],
          ["inventory", "Inventory & Orders", byGroup.inventory || [], "Default product low-stock reorder thresholds, backorders, and guest checkout policy."],
          ["all", "All Keys & Custom", all, "Inspect all active configuration keys in one table or add/override any custom configuration key."]
        ];

        var tabs = groups.map(function (g) {
          var isAct = g[0] === activeTab;
          return '<button type="button" class="btn btn-sm ' + (isAct ? "btn-primary" : "btn-light border") + '" data-tab="' + g[0] + '">' +
            ADMIN.esc(g[1]) + ' <span class="badge text-bg-light border ms-1">' + g[2].length + '</span></button>';
        }).join("");

        var panels = groups.map(function (g) {
          var key = g[0];
          var isAct = key === activeTab;
          if (key === "all") {
            var tableRows = all.map(function (s) {
              var prev = formatSettingPreview(s.setting_key, s.value);
              return '<tr>' +
                '<td><code>' + ADMIN.esc(s.setting_key) + '</code></td>' +
                '<td><span class="badge text-bg-light border">' + ADMIN.esc(s.setting_group) + '</span></td>' +
                '<td><strong>' + ADMIN.esc(s.value) + '</strong>' + (prev ? ' <span class="badge bg-success-subtle text-success border border-success-subtle ms-1">' + ADMIN.esc(prev) + '</span>' : '') + '</td>' +
              '</tr>';
            }).join("");
            return '<div class="dz-settings-panel" data-panel="all"' + (isAct ? "" : " hidden") + '>' +
              '<div class="row g-4">' +
                '<div class="col-12 col-lg-7">' +
                  '<div class="dz-card p-3 p-lg-4 h-100">' +
                    '<div class="d-flex justify-content-between align-items-center mb-2">' +
                      '<div><h2 class="h6 fw-bold mb-0">All Active Configuration Keys</h2><p class="small text-secondary mb-0">' + ADMIN.esc(g[3]) + '</p></div>' +
                      '<span class="badge text-bg-light border">' + all.length + ' settings</span>' +
                    '</div>' +
                    '<div class="my-3">' +
                      '<input type="search" id="setting-table-search" class="form-control form-control-sm" placeholder="Filter settings by key or group…">' +
                    '</div>' +
                    '<div class="table-responsive" style="max-height: 480px; overflow-y: auto;">' +
                      '<table class="table table-sm table-hover align-middle mb-0">' +
                        '<thead class="sticky-top bg-white"><tr><th>Setting Key</th><th>Group</th><th>Current Value</th></tr></thead>' +
                        '<tbody id="settings-all-tbody">' + tableRows + '</tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="col-12 col-lg-5">' +
                  '<div class="dz-card p-3 p-lg-4 h-100">' +
                    '<h2 class="h6 fw-bold mb-1">Add or Override Setting Key</h2>' +
                    '<p class="small text-secondary mb-3">Create a new configuration key or update an existing key directly.</p>' +
                    '<div class="mb-3">' +
                      '<label class="form-label small text-secondary mb-1" for="custom-setting-key">Configuration Key *</label>' +
                      '<input id="custom-setting-key" class="form-control form-control-sm" placeholder="e.g. store.support_email">' +
                    '</div>' +
                    '<div class="mb-3">' +
                      '<label class="form-label small text-secondary mb-1" for="custom-setting-group">Setting Group</label>' +
                      '<select id="custom-setting-group" class="form-select form-select-sm">' +
                        '<option value="general">general</option>' +
                        '<option value="shipping">shipping</option>' +
                        '<option value="promotions">promotions</option>' +
                        '<option value="tax">tax</option>' +
                        '<option value="payments">payments</option>' +
                        '<option value="storefront">storefront</option>' +
                        '<option value="inventory">inventory</option>' +
                        '<option value="custom">custom</option>' +
                      '</select>' +
                    '</div>' +
                    '<div class="mb-3">' +
                      '<label class="form-label small text-secondary mb-1" for="custom-setting-val">Value *</label>' +
                      '<input id="custom-setting-val" class="form-control form-control-sm" placeholder="Setting value">' +
                    '</div>' +
                    '<button type="button" class="btn btn-primary btn-sm" id="custom-setting-save">Save custom setting</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
          }

          var extraBanner = "";
          if (key === "shipping") {
            extraBanner = '<div class="alert alert-light border d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 py-2 small">' +
              '<span>Need regional city/district delivery rates or return resolution?</span>' +
              '<div class="d-flex gap-2"><a class="btn btn-outline-primary btn-sm py-0 px-2" href="/admin/shipping">Shipping Zones &amp; Rates &rarr;</a>' +
              '<a class="btn btn-light border btn-sm py-0 px-2" href="/admin/returns">Manage Returns &rarr;</a></div></div>';
          } else if (key === "promotions") {
            extraBanner = '<div class="alert alert-light border d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 py-2 small">' +
              '<span>Want to create discount coupons, flash sale campaigns, or gift cards?</span>' +
              '<div class="d-flex gap-2"><a class="btn btn-outline-primary btn-sm py-0 px-2" href="/admin/coupons">Manage Coupons &rarr;</a>' +
              '<a class="btn btn-light border btn-sm py-0 px-2" href="/account/rewards">Customer Rewards &rarr;</a></div></div>';
          } else if (key === "payments") {
            extraBanner = '<div class="alert alert-light border d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 py-2 small">' +
              '<span>Supported gateways: <strong>Cash on Delivery (COD)</strong>, <strong>bKash</strong>, <strong>Nagad</strong>, <strong>SSLCommerz</strong>, <strong>Stripe</strong>.</span>' +
              '<span class="badge bg-success-subtle text-success border border-success-subtle">Multi-Gateway Configured</span></div>';
          } else if (key === "storefront") {
            extraBanner = '<div class="alert alert-light border d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 py-2 small">' +
              '<span>Top announcement notice and brand links update immediately on all customer storefront pages.</span>' +
              '<a class="btn btn-light border btn-sm py-0 px-2" href="/" target="_blank" rel="noopener">Open Storefront &nearr;</a></div>';
          }

          var rows = g[2].map(function (s) {
            var meta = SETTING_META[s.setting_key] || { label: s.setting_key, hint: "Configuration key: " + s.setting_key, type: "text" };
            var preview = formatSettingPreview(s.setting_key, s.value);
            return '<div class="dz-form-group mb-3 pb-3 border-bottom">' +
              '<div class="d-flex flex-wrap justify-content-between align-items-center mb-1">' +
                '<label class="form-label fw-semibold mb-0">' + ADMIN.esc(meta.label) + ' <code class="small text-secondary fw-normal ms-1">(' + ADMIN.esc(s.setting_key) + ')</code></label>' +
                (preview ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle" data-preview-for="' + ADMIN.esc(s.setting_key) + '">' + ADMIN.esc(preview) + '</span>' : '') +
              '</div>' +
              '<p class="small text-secondary mb-2">' + ADMIN.esc(meta.hint) + '</p>' +
              renderSettingInput(s, meta) +
            '</div>';
          }).join("") || '<p class="text-secondary small">No settings in this group yet.</p>';

          return '<div class="dz-settings-panel" data-panel="' + key + '"' + (isAct ? "" : " hidden") + '>' +
            '<div class="dz-card p-3 p-lg-4">' +
              '<div class="mb-3"><h2 class="h6 fw-bold mb-1">' + ADMIN.esc(g[1]) + '</h2><p class="small text-secondary mb-0">' + ADMIN.esc(g[3]) + '</p></div>' +
              extraBanner +
              rows +
              '<div class="d-flex align-items-center gap-2 mt-3">' +
                '<button type="button" class="btn btn-primary" data-save-group="' + key + '">Save ' + ADMIN.esc(g[1]) + '</button>' +
                '<span class="dz-form-feedback small text-secondary" data-fb="' + key + '"></span>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join("");

        root.innerHTML =
          '<div class="dz-admin-page-head">' +
            '<div><span class="dz-eyebrow">Configuration</span><h1 class="page-title">Store Settings</h1>' +
            '<p class="page-description">Complete control over general branding, delivery fees, automatic discounts, tax compliance, payment gateways, and policies.</p></div>' +
            '<div class="dz-admin-page-head-actions">' +
              '<a class="btn btn-light border btn-sm" href="/admin/shipping">Shipping Zones</a>' +
              '<a class="btn btn-light border btn-sm" href="/admin/coupons">Coupons</a>' +
              '<a class="btn btn-light border btn-sm" href="/admin/roles">Roles &amp; Permissions</a>' +
            '</div>' +
          '</div>' +
          '<div class="dz-admin-toolbar d-flex flex-wrap gap-2 mb-3">' + tabs + '</div>' +
          panels;

        root.querySelectorAll("[data-tab]").forEach(function (t) {
          t.addEventListener("click", function () {
            activeTab = t.getAttribute("data-tab");
            root.querySelectorAll("[data-tab]").forEach(function (x) { x.className = "btn btn-sm btn-light border"; });
            t.className = "btn btn-sm btn-primary";
            root.querySelectorAll("[data-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== activeTab; });
          });
        });

        root.querySelectorAll("[data-setting]").forEach(function (inp) {
          var handler = function () {
            var k = inp.getAttribute("data-setting");
            var badge = root.querySelector('[data-preview-for="' + k + '"]');
            if (badge) {
              var pv = formatSettingPreview(k, inp.value);
              badge.textContent = pv;
              badge.style.display = pv ? "" : "none";
            }
          };
          inp.addEventListener("input", handler);
          inp.addEventListener("change", handler);
        });

        root.querySelectorAll("[data-toggle-secret]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var input = btn.closest(".input-group").querySelector("input");
            if (input.type === "password") {
              input.type = "text";
              btn.innerHTML = "&#128274; Hide";
            } else {
              input.type = "password";
              btn.innerHTML = "&#128065; Show";
            }
          });
        });

        root.querySelectorAll("[data-gen-secret]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var input = btn.closest(".input-group").querySelector("input");
            var rand = "sec_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            input.value = rand;
            input.type = "text";
            var tog = btn.closest(".input-group").querySelector("[data-toggle-secret]");
            if (tog) tog.innerHTML = "&#128274; Hide";
            ADMIN.toast("Generated new random secret key. Remember to save changes.", true);
          });
        });

        root.querySelectorAll("[data-save-group]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var group = btn.getAttribute("data-save-group");
            var panel = root.querySelector('[data-panel="' + group + '"]');
            var inputs = panel.querySelectorAll("[data-setting]");
            var fb = panel.querySelector('[data-fb="' + group + '"]');
            btn.disabled = true; if (fb) fb.textContent = "Saving…";
            var chain = Promise.resolve();
            inputs.forEach(function (inp) {
              chain = chain.then(function () {
                return ADMIN.act("POST", "/admin/api/settings", null, {
                  setting_key: inp.getAttribute("data-setting"),
                  value: inp.value,
                  group: inp.getAttribute("data-group")
                });
              });
            });
            chain.then(function () {
              btn.disabled = false;
              if (fb) fb.textContent = "Saved ✓";
              ADMIN.toast("Settings saved successfully.", true);
            }).catch(function (e) {
              btn.disabled = false;
              if (fb) fb.textContent = "";
              ADMIN.toast(e.message, false);
            });
          });
        });

        var searchInput = root.querySelector("#setting-table-search");
        if (searchInput) {
          searchInput.addEventListener("input", function () {
            var q = searchInput.value.toLowerCase().trim();
            root.querySelectorAll("#settings-all-tbody tr").forEach(function (tr) {
              var txt = tr.textContent.toLowerCase();
              tr.style.display = txt.includes(q) ? "" : "none";
            });
          });
        }

        var customBtn = root.querySelector("#custom-setting-save");
        if (customBtn) {
          customBtn.addEventListener("click", function () {
            var k = (root.querySelector("#custom-setting-key").value || "").trim();
            var g = (root.querySelector("#custom-setting-group").value || "general").trim();
            var v = root.querySelector("#custom-setting-val").value || "";
            if (!k) { ADMIN.toast("Please enter a configuration key.", false); return; }
            customBtn.disabled = true;
            ADMIN.act("POST", "/admin/api/settings", null, { setting_key: k, value: v, group: g })
              .then(function () {
                ADMIN.toast("Setting '" + k + "' saved.", true);
                loadSettings();
              })
              .catch(function (e) {
                customBtn.disabled = false;
                ADMIN.toast(e.message, false);
              });
          });
        }
      }).catch(function () { root.innerHTML = ADMIN.errorHTML("Network error."); });
    }
    loadSettings();
  }

  // ---- Staff ----
  function StaffModule(root) {
    var self = new ListModule(root, {});
    self.module = "staff";
    var roleOpts = [];
    var cfg = {
      module: "staff", title: "Staff", eyebrow: "People",
      description: "Team members with admin or staff access — promote, reassign or revoke.",
      endpoint: "/admin/api/staff", searchPlaceholder: "Search name or email",
      addLabel: "Promote user", emptyText: "No staff members yet — promote a shopper by email.",
      columns: [
        { label: "Name", key: "name" },
        { label: "Email", key: "email" },
        { label: "Role", render: function (r) {
            if (!r.role_slug) return '<span class="badge text-bg-light border">none</span>';
            return '<span class="badge ' + (r.role_slug === "admin" ? "text-bg-danger" : "text-bg-primary") + '">' + ADMIN.esc(r.role_name) + "</span>";
          } }
      ],
      rowActions: function (row) {
        var acts = [
          { label: "Change role", cls: "btn-light border", onClick: function (r) { self.openAssign(r); } }
        ];
        if (row.role_slug) {
          acts.push({ label: "Remove role", cls: "btn-outline-danger", danger: true,
            confirm: "Revoke the " + (row.role_name || row.role_slug) + " role from " + row.name + "? They will lose all staff permissions.",
            confirmLabel: "Remove role",
            onClick: function (r, reload) {
              ADMIN.act("POST", "/admin/api/staff/role/remove", null, { user_id: r.id, role: r.role_slug })
                .then(function () { ADMIN.toast("Role removed.", true); reload(); })
                .catch(function (e) { ADMIN.toast(e.message, false); });
            } });
        }
        return acts;
      },
      onAdd: function () { self.openAssign(null); }
    };
    self.applyConfig(cfg);
    self.loadRoles = function () {
      if (roleOpts.length) return Promise.resolve(roleOpts);
      return ADMIN.get("/admin/api/roles").then(function (res) {
        if (res.ok && res.data && res.data.data && res.data.data.roles) {
          roleOpts = res.data.data.roles
            .filter(function (r) { return r.slug !== "customer"; })
            .map(function (r) { return { value: r.slug, label: r.name }; });
        }
        return roleOpts;
      });
    };
    self.openAssign = function (row) {
      ADMIN.ensureModalHost();
      self.loadRoles().then(function (opts) {
        var isPromote = !row;
        var fields = [];
        if (isPromote) {
          fields.push({ name: "email", label: "Email of the account to promote", required: true, placeholder: "shopper@example.com" });
        } else {
          fields.push({ name: "whoami", label: "Staff member", type: "text", disabled: true });
        }
        fields.push({ name: "role", label: "Role", type: "select", required: true, options: opts });
        var form = ADMIN.buildForm({
          fields: fields,
          values: isPromote ? {} : { whoami: row.name + " (" + row.email + ")", role: row.role_slug },
          submitLabel: isPromote ? "Assign role" : "Save role",
          onSubmit: function (data) {
            var payload = { role: data.role };
            if (isPromote) payload.email = data.email;
            else payload.user_id = row.id;
            return ADMIN.act("POST", "/admin/api/staff/role", null, payload).then(function (out) {
              ADMIN.modal.close();
              var assigned = out && out.data && out.data.assigned;
              ADMIN.toast(assigned ? "Role assigned." : "User already holds that role.", assigned);
              self.load(self.state.page);
            });
          },
          onCancel: function () { ADMIN.modal.close(); }
        });
        ADMIN.modal.open(isPromote ? "Promote user to staff" : "Change role — " + ADMIN.esc(row.name), form, "");
      });
    };
    self.mount();
  }

  // ---- Roles & permissions ----
  function RolesModule(root) {
    function load() {
      root.innerHTML = ADMIN.loadingHTML;
      ADMIN.get("/admin/api/roles").then(function (res) {
        if (res.auth) return;
        if (!res.ok || !res.data || !res.data.data) { root.innerHTML = ADMIN.errorHTML("Could not load roles."); return; }
        render(res.data.data);
      }).catch(function () { root.innerHTML = ADMIN.errorHTML("Network error."); });
    }
    function render(d) {
      var roles = d.roles || [];
      var perms = d.permissions || [];
      var html =
        '<div class="dz-admin-page-head"><div><span class="dz-eyebrow">Access control</span>' +
        '<h1 class="page-title">Roles &amp; Permissions</h1>' +
        '<p class="page-description">Tick a permission to grant it to a role, untick to revoke. Changes apply immediately.</p></div></div>';
      if (!roles.length) {
        html += ADMIN.emptyHTML("No roles defined yet.");
        root.innerHTML = html;
        return;
      }
      html += '<div class="row g-3">';
      roles.forEach(function (r) {
        var slugSet = {};
        (r.permission_slugs || []).forEach(function (s) { slugSet[s] = true; });
        var permRows = perms.map(function (p) {
          var on = !!slugSet[p.slug];
          return '<tr><td><code>' + ADMIN.esc(p.slug) + "</code></td>" +
            '<td class="text-secondary small">' + ADMIN.esc(p.name || "") + "</td>" +
            '<td class="text-end"><div class="form-check form-switch d-inline-block mb-0">' +
            '<input class="form-check-input" type="checkbox" role="switch" data-role="' + r.id + '" data-perm="' + ADMIN.esc(p.slug) + '"' + (on ? " checked" : "") + "></div></td></tr>";
        }).join("");
        html +=
          '<div class="col-12 col-lg-6"><div class="dz-card p-3 p-lg-4 h-100">' +
            '<div class="d-flex justify-content-between align-items-center mb-2">' +
              '<div><h2 class="h6 mb-0">' + ADMIN.esc(r.name) + '</h2><span class="small text-secondary"><code>' + ADMIN.esc(r.slug) + "</code> · " + ADMIN.esc(r.permission_count) + " permission(s)</span></div>" +
              '<span class="badge ' + (r.slug === "admin" ? "text-bg-danger" : "text-bg-primary") + '">' + ADMIN.esc(r.slug) + "</span>" +
            "</div>" +
            '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><tbody>' + permRows + "</tbody></table></div>" +
          "</div></div>";
      });
      html += "</div>";
      root.innerHTML = html;
      root.querySelectorAll("input[data-perm]").forEach(function (box) {
        box.addEventListener("change", function () {
          var roleId = box.getAttribute("data-role");
          var perm = box.getAttribute("data-perm");
          var enabled = box.checked;
          box.disabled = true;
          ADMIN.act("POST", "/admin/api/roles/" + roleId + "/permissions", null, { permission: perm, enabled: enabled ? 1 : 0 })
            .then(function (out) {
              box.disabled = false;
              var updated = out && out.data && out.data.updated;
              ADMIN.toast(updated ? ("Permission " + (enabled ? "granted" : "revoked") + ".") : "No change — already in that state.", enabled);
            })
            .catch(function (e) {
              box.disabled = false;
              box.checked = !enabled;
              ADMIN.toast(e.message, false);
            });
        });
      });
    }
    load();
  }

  // ---- Coupons ----
  function CouponsModule(root) {
    var self = new ListModule(root, {});
    self.module = "coupons";
    function valueDisplay(r) {
      if (r.type === "percent") {
        var pct = parseInt(r.value_minor || 0, 10) / 100;
        return pct + "%";
      }
      return ADMIN.fmt(r.value_minor);
    }
    var cfg = {
      module: "coupons", title: "Coupons", eyebrow: "Marketing",
      description: "Discount codes for checkout — create, edit, deactivate or delete.",
      endpoint: "/admin/api/coupons", searchPlaceholder: "Search code",
      addLabel: "Add coupon", emptyText: "No coupons yet — create the first one.",
      columns: [
        { label: "Code", render: function (r) { return "<code>" + ADMIN.esc(r.code) + "</code>"; } },
        { label: "Discount", render: function (r) { return "<strong>" + valueDisplay(r) + "</strong>" + '<span class="small text-secondary d-block">' + (r.type === "percent" ? "percent off" : "flat off") + "</span>"; } },
        { label: "Min order", render: function (r) { return ADMIN.fmt(r.min_order_minor); } },
        { label: "Max uses", render: function (r) { return parseInt(r.max_uses || 0, 10) === 0 ? "∞" : ADMIN.esc(r.max_uses); } },
        { label: "Status", render: function (r) {
            return '<span class="badge ' + (parseInt(r.is_active || 0, 10) === 1 ? "text-bg-success" : "text-bg-secondary") + '">' + (parseInt(r.is_active || 0, 10) === 1 ? "active" : "inactive") + "</span>";
          } }
      ],
      rowActions: function (row) {
        var active = parseInt(row.is_active || 0, 10) === 1;
        return [
          { label: "Edit", cls: "btn-light border", onClick: function (r) { self.openForm(r); } },
          { label: active ? "Deactivate" : "Activate", cls: "btn-light border",
            onClick: function (r, reload) {
              ADMIN.act("POST", "/admin/api/coupons/" + r.id + "/toggle-form", null, { active: active ? 0 : 1 })
                .then(function () { ADMIN.toast(active ? "Coupon deactivated." : "Coupon activated.", true); reload(); })
                .catch(function (e) { ADMIN.toast(e.message, false); });
            } },
          { label: "Delete", cls: "btn-outline-danger", danger: true,
            confirm: "Delete coupon " + row.code + "? Coupons that have been used cannot be deleted — deactivate them instead.",
            confirmLabel: "Delete",
            onClick: function (r, reload) {
              ADMIN.del("/admin/api/coupons/" + r.id).then(function (out) {
                ADMIN.toast("Coupon deleted.", true); reload();
              }).catch(function (e) { ADMIN.toast(e.message, false); });
            } }
        ];
      },
      onAdd: function () { self.openForm(null); }
    };
    self.applyConfig(cfg);
    // value fields are entered in display units (৳ / %) and stored as minors / bps
    self.openForm = function (row) {
      var isEdit = !!row;
      var fixedMajor = row ? (parseInt(row.value_minor || 0, 10) / 100) : "";
      var minMajor = row ? (parseInt(row.min_order_minor || 0, 10) / 100) : "";
      var form = ADMIN.buildForm({
        fields: [
          { name: "code", label: "Code", required: true, placeholder: "e.g. WELCOME10" },
          { name: "type", label: "Type", type: "select", options: [
            { value: "fixed", label: "Fixed amount (৳)" }, { value: "percent", label: "Percent (%)" } ] },
          { name: "value_input", label: "Discount amount", type: "number", min: 0, step: "0.01", required: true,
            help: "৳ amount for fixed type; percent number for percent type." },
          { name: "min_input", label: "Minimum order (৳)", type: "number", min: 0, step: "0.01" },
          { name: "max_uses", label: "Max uses (0 = unlimited)", type: "number", min: 0 },
          { name: "is_active", label: "Active", type: "checkbox" }
        ],
        values: {
          code: row ? row.code : "",
          type: row ? row.type : "fixed",
          value_input: row ? fixedMajor : "",
          min_input: row ? minMajor : "",
          max_uses: row ? row.max_uses : "0",
          is_active: row ? parseInt(row.is_active || 0, 10) === 1 : true
        },
        submitLabel: isEdit ? "Save changes" : "Create coupon",
        onSubmit: function (data) {
          var type = data.type;
          var numeric = parseFloat(data.value_input);
          if (isNaN(numeric) || numeric < 0) {
            var e = new Error("Enter a valid discount amount.");
            e.fields = { value_input: "Enter a valid discount amount." };
            throw e;
          }
          var payload = {
            code: data.code,
            type: type,
            // fixed → minor units; percent → basis points (both ×100)
            value_minor: Math.round(numeric * 100),
            max_uses: parseInt(data.max_uses || 0, 10) || 0,
            is_active: data.is_active ? 1 : 0
          };
          payload.min_order_minor = Math.round((parseFloat(data.min_input) || 0) * 100);
          var call;
          if (isEdit) call = ADMIN.act("PUT", "/admin/api/coupons/" + row.id, null, payload);
          else call = ADMIN.act("POST", "/admin/api/coupons", null, payload);
          return call.then(function () {
            ADMIN.modal.close();
            ADMIN.toast(isEdit ? "Coupon updated." : "Coupon created.", true);
            self.load(self.state.page);
          });
        },
        onCancel: function () { ADMIN.modal.close(); }
      });
      ADMIN.modal.open(isEdit ? "Edit coupon — " + ADMIN.esc(row.code) : "Add coupon", form, "");
    };
    self.mount();
  }

  // ---------------------------------------------------------------- chrome (sidebar toggle)
  function bindChrome() {
    var btn = document.getElementById("adminMenuBtn");
    var sidebar = document.getElementById("adminSidebar");
    var backdrop = document.getElementById("adminBackdrop");
    if (!btn || !sidebar) return;
    function open() { sidebar.classList.add("is-open"); if (backdrop) backdrop.hidden = false; }
    function close() { sidebar.classList.remove("is-open"); if (backdrop) backdrop.hidden = true; }
    btn.addEventListener("click", function () {
      if (sidebar.classList.contains("is-open")) close(); else open();
    });
    if (backdrop) backdrop.addEventListener("click", close);
    // Close the drawer after a top-level navigation link is chosen on mobile.
    sidebar.querySelectorAll(".dz-admin-nav-item").forEach(function (a) {
      a.addEventListener("click", function () { if (window.innerWidth <= 991) close(); });
    });
  }

  function wireAdminHelpers() {
    // image file -> base64
    document.addEventListener("change", function (e) {
      var input = e.target;
      if (!input.matches || !input.matches("input[data-base64-target]")) return;
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        ADMIN.toast("Image is larger than 2 MB — pick a smaller file.", false);
        input.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        ADMIN.toast("Could not read this image file.", false);
        input.value = "";
      };
      reader.onload = function (ev) {
        var form = input.closest("form");
        if (!form) return;
        var target = input.getAttribute("data-base64-target");
        var selector = target.charAt(0) !== "#" ? "#" + target : target;
        var hidden = form.querySelector(selector);
        if (hidden) hidden.value = String(ev.target.result);
        var prevTarget = input.getAttribute("data-preview-target");
        if (prevTarget) {
          var prevSel = prevTarget.charAt(0) !== "#" ? "#" + prevTarget : prevTarget;
          var preview = form.querySelector(prevSel);
          if (preview) {
            preview.innerHTML = '<img src="' + ev.target.result + '" alt="preview" style="max-height:100px;border-radius:8px;border:1px solid #e6e9ef;">';
          }
        }
      };
      reader.readAsDataURL(file);
    });

    // generic data-ajax="admin" form submits
    document.addEventListener("submit", function (e) {
      var form = e.target;
      if (!form || !form.hasAttribute || form.getAttribute("data-ajax") !== "admin") return;
      e.preventDefault();
      var confirmMsg = form.getAttribute("data-confirm") || (form.querySelector("[data-confirm]") && form.querySelector("[data-confirm]").getAttribute("data-confirm"));
      if (confirmMsg && !window.confirm(confirmMsg)) return;

      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      var body = new URLSearchParams(new FormData(form));
      body.set("format", "json");
      if (!body.has("_csrf") || !body.get("_csrf")) {
        body.set("_csrf", ADMIN.csrf);
      }
      fetch(form.getAttribute("action"), {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: body,
        credentials: "same-origin"
      }).then(function (res) {
        if (res.status === 401) { window.location.href = "/login"; return null; }
        return res.json().then(function (j) { return { ok: res.ok, status: res.status, data: j }; })
          .catch(function () { return { ok: res.ok, status: res.status, data: {} }; });
      }).then(function (out) {
        if (!out) return;
        if (btn) btn.disabled = false;
        if (!out.ok) {
          var msg = (out.data && (out.data.message || out.data.error)) || "Operation failed.";
          ADMIN.toast(msg, false);
          return;
        }
        var msg = (out.data && out.data.message) || "Saved successfully.";
        ADMIN.toast(msg, true);
        if (ADMIN.modal) {
          ADMIN.modal.close();
        }
        var redirect = form.getAttribute("data-success-redirect");
        if (redirect) {
          window.location.href = redirect;
          return;
        }
        if (ADMIN.activeModule && typeof ADMIN.activeModule.load === "function") {
          ADMIN.activeModule.load(ADMIN.activeModule.state ? ADMIN.activeModule.state.page : 1);
        } else if (ADMIN.activeModule && typeof ADMIN.activeModule.refresh === "function") {
          ADMIN.activeModule.refresh();
        }
        var action = form.getAttribute("action") || "";
        if (action.includes("/delete-form")) {
          var rowOrCard = form.closest("tr, .dz-gallery-item, .dz-card");
          if (rowOrCard) rowOrCard.remove();
        } else if (!action.includes("/update") && !action.includes("/status") && !action.includes("/set-form")) {
          form.reset();
        }
        var tr = form.closest("tr");
        if (tr && out.data && out.data.data && out.data.data.status) {
          var badge = tr.querySelector(".badge");
          if (badge) badge.outerHTML = ADMIN.badge(out.data.data.status);
        }
      }).catch(function (err) {
        if (btn) btn.disabled = false;
        ADMIN.toast(err.message || "Network error.", false);
      });
    });
  }

  // ---------------------------------------------------------------- init
  function init() {
    bindChrome();
    wireAdminHelpers();
    var root = document.querySelector(".dz-admin-module[data-module]");
    if (!root) return;
    var name = root.getAttribute("data-module");
    var mod = null;
    if (name === "dashboard") mod = OverviewModule(root);
    else if (name === "products") mod = ProductsModule(root);
    else if (name === "orders") mod = OrdersModule(root);
    else if (name === "categories") mod = CategoriesModule(root);
    else if (name === "brands") mod = BrandsModule(root);
    else if (name === "inventory") mod = InventoryModule(root);
    else if (name === "customers") mod = CustomersModule(root);
    else if (name === "staff") mod = StaffModule(root);
    else if (name === "roles") mod = RolesModule(root);
    else if (name === "coupons") mod = CouponsModule(root);
    else if (name === "settings") mod = SettingsModule(root);
    ADMIN.activeModule = mod;
    return mod;
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  window.ADMIN = ADMIN;
})();
