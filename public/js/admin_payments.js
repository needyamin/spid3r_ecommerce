(function () {
  "use strict";

  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.getAttribute("content")) {
      return meta.getAttribute("content");
    }
    var input = document.querySelector('input[name="_csrf"]');
    if (input && input.value) {
      return input.value;
    }
    if (window.ADMIN && window.ADMIN.csrf) {
      return window.ADMIN.csrf;
    }
    return "";
  }

  function generateWebhookSecret() {
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var secret = "whsec_";
    for (var i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    var el = document.getElementById("webhook_secret");
    if (el) {
      el.value = secret;
      el.classList.add("is-valid");
      setTimeout(function () {
        el.classList.remove("is-valid");
      }, 1500);
    }
    if (window.ADMIN && window.ADMIN.toast) {
      window.ADMIN.toast("Generated new random webhook secret.", true);
    }
  }

  function runWebhookDiagnostic(btn) {
    var out = document.getElementById("webhookDiagnosticResult");
    if (btn) btn.disabled = true;
    if (out) {
      out.classList.remove("d-none");
      out.innerHTML = "<div class='text-muted'><span class='spinner-border spinner-border-sm me-2' role='status'></span>Calculating HMAC-SHA256 signature verification...</div>";
    }

    var csrf = getCsrfToken();
    fetch("/admin/api/payments/webhook-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrf
      },
      body: JSON.stringify({ _csrf: csrf })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (btn) btn.disabled = false;
        if (!out) return;
        if (data.ok) {
          out.innerHTML =
            "<div class='text-success fw-bold mb-1'>✓ Webhook HMAC Verification Passed!</div>" +
            "<div>Algorithm: <strong>" + (data.algorithm || "HMAC-SHA256") + "</strong></div>" +
            "<div>Header Required: <code>" + (data.header_name || "X-Signature") + "</code></div>" +
            "<div class='mt-1'>Sample Payload Hash: <code class='text-primary text-break'>" + (data.signature || "") + "</code></div>" +
            "<div class='text-muted small mt-1'>" + (data.message || "Signatures generated and verified successfully.") + "</div>";
          if (window.ADMIN && window.ADMIN.toast) {
            window.ADMIN.toast("Webhook diagnostic passed!", true);
          }
        } else {
          out.innerHTML = "<div class='text-danger fw-bold'>✕ Webhook Diagnostic Failed: " + (data.message || "Unknown error") + "</div>";
          if (window.ADMIN && window.ADMIN.toast) {
            window.ADMIN.toast("Webhook diagnostic failed.", false);
          }
        }
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        if (out) {
          out.innerHTML = "<div class='text-danger'>Diagnostic test network error: " + err + "</div>";
        }
      });
  }

  function testGateway(provider, mode, targetElId, btn) {
    var out = document.getElementById(targetElId);
    if (btn) btn.disabled = true;
    if (out) {
      out.classList.remove("d-none");
      out.innerHTML =
        "<div class='text-muted small py-1'><span class='spinner-border spinner-border-sm me-2' role='status'></span>Testing <strong>" +
        provider +
        "</strong> in <strong>" +
        mode +
        "</strong> mode...</div>";
    }

    var csrf = getCsrfToken();
    fetch("/admin/api/payments/test-gateway", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrf
      },
      body: JSON.stringify({
        _csrf: csrf,
        provider: provider,
        mode: mode
      })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (btn) btn.disabled = false;
        if (!out) return;
        if (data.ok) {
          var detailsHtml = "";
          if (data.details) {
            for (var k in data.details) {
              detailsHtml +=
                "<div><span class='text-secondary'>" +
                k +
                ":</span> <code class='text-dark'>" +
                data.details[k] +
                "</code></div>";
            }
          }
          out.innerHTML =
            "<div class='p-2 rounded bg-success bg-opacity-10 border border-success-subtle text-success small'>" +
            "<div class='fw-bold'>✓ " +
            data.message +
            "</div>" +
            (detailsHtml ? "<div class='mt-1 font-monospace'>" + detailsHtml + "</div>" : "") +
            "</div>";
          if (window.ADMIN && window.ADMIN.toast) {
            window.ADMIN.toast(provider.toUpperCase() + " (" + mode + "): Test Passed", true);
          }
        } else {
          out.innerHTML =
            "<div class='p-2 rounded bg-danger bg-opacity-10 border border-danger-subtle text-danger small'>" +
            "<strong>✕ Test Failed:</strong> " +
            (data.message || "Failed response from gateway API.") +
            "</div>";
          if (window.ADMIN && window.ADMIN.toast) {
            window.ADMIN.toast(provider.toUpperCase() + " (" + mode + "): Failed", false);
          }
        }
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        if (out) {
          out.innerHTML =
            "<div class='p-2 rounded bg-danger bg-opacity-10 border text-danger small'>Network error: " +
            err +
            "</div>";
        }
      });
  }

  function runAllSandboxTests(btn) {
    if (btn) {
      btn.disabled = true;
      var origText = btn.innerHTML;
      btn.innerHTML = "<span class='spinner-border spinner-border-sm me-1' role='status'></span> Running Suite...";
    }

    var list = ["bkash", "nagad", "sslcommerz", "stripe", "cod"];
    var delay = 0;
    list.forEach(function (p, index) {
      setTimeout(function () {
        testGateway(p, "sandbox", "res_lab_" + p, null);
        if (index === list.length - 1 && btn) {
          setTimeout(function () {
            btn.disabled = false;
            btn.innerHTML = origText;
            if (window.ADMIN && window.ADMIN.toast) {
              window.ADMIN.toast("All sandbox gateway tests completed!", true);
            }
          }, 800);
        }
      }, delay);
      delay += 300;
    });
  }

  function createInstantTestOrder(btn) {
    var selectEl = document.getElementById("testOrderProvider");
    var prov = selectEl ? selectEl.value : "bkash";
    var out = document.getElementById("testOrderResult");
    if (btn) btn.disabled = true;
    if (out) {
      out.classList.remove("d-none");
      out.innerHTML = "<div class='text-muted small'><span class='spinner-border spinner-border-sm me-2' role='status'></span>Creating test order in database...</div>";
    }

    var csrf = getCsrfToken();
    fetch("/admin/api/payments/create-test-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": csrf
      },
      body: JSON.stringify({
        _csrf: csrf,
        provider: prov
      })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (btn) btn.disabled = false;
        if (!out) return;
        if (data.ok) {
          out.innerHTML =
            "<div class='text-success fw-bold mb-1'>✓ Test Order Created: #" +
            data.order_number +
            " (" +
            data.total_display +
            ")</div>" +
            "<div class='small text-secondary mb-2'>Gateway: <strong class='text-dark text-uppercase'>" +
            prov +
            "</strong> | Status: <span class='badge bg-warning text-dark'>awaiting_payment</span></div>" +
            "<div class='d-flex flex-wrap gap-2 mt-2'>" +
            "<a href='" +
            data.simulator_url +
            "' target='_blank' class='btn btn-sm btn-primary'>Open Gateway Simulator ↗</a>" +
            "<a href='" +
            data.confirmation_url +
            "' target='_blank' class='btn btn-sm btn-outline-secondary'>View Confirmation ↗</a>" +
            "<a href='/payment/" +
            data.order_number +
            "/simulate-success' target='_blank' class='btn btn-sm btn-success'>⚡ 1-Click Pay Success ↗</a>" +
            "</div>";
          if (window.ADMIN && window.ADMIN.toast) {
            window.ADMIN.toast("Test order #" + data.order_number + " created!", true);
          }
        } else {
          out.innerHTML = "<div class='text-danger'>Could not create test order: " + (data.message || "") + "</div>";
        }
      })
      .catch(function (err) {
        if (btn) btn.disabled = false;
        if (out) {
          out.innerHTML = "<div class='text-danger'>Network failed: " + err + "</div>";
        }
      });
  }

  function initPaymentsPage() {
    // Check if we are on the payments admin page
    var paymentsForm = document.getElementById("paymentsForm");
    if (!paymentsForm) return;

    // Attach event listeners via delegated clicks
    document.addEventListener("click", function (evt) {
      var target = evt.target.closest("[data-action]");
      if (!target) return;

      var action = target.getAttribute("data-action");

      if (action === "test-gateway") {
        evt.preventDefault();
        var provider = target.getAttribute("data-provider");
        var mode = target.getAttribute("data-mode") || "sandbox";
        var outId = target.getAttribute("data-target");
        testGateway(provider, mode, outId, target);
      } else if (action === "generate-webhook-secret") {
        evt.preventDefault();
        generateWebhookSecret();
      } else if (action === "webhook-diagnostic") {
        evt.preventDefault();
        runWebhookDiagnostic(target);
      } else if (action === "run-all-sandbox-tests") {
        evt.preventDefault();
        runAllSandboxTests(target);
      } else if (action === "create-test-order") {
        evt.preventDefault();
        createInstantTestOrder(target);
      }
    });
  }

  if (document.readyState !== "loading") {
    initPaymentsPage();
  } else {
    document.addEventListener("DOMContentLoaded", initPaymentsPage);
  }
})();

