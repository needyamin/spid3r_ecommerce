/* Spid3r Store — storefront behaviour (no framework, CSP-safe: no inline JS).
   Progressive enhancement: every [data-ajax] form still works as a plain
   HTML POST if this file fails to load. */
(function () {
  "use strict";

  function setBadge(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = String(count);
    el.classList.toggle("d-none", !count);
  }

  var toastTimer = null;
  function toast(message, ok) {    var existing = document.getElementById("dz-toast");
    if (existing) existing.remove();
    var el = document.createElement("div");
    el.id = "dz-toast";
    el.className = ok ? "dz-toast dz-toast-ok" : "dz-toast dz-toast-err";
    el.setAttribute("role", "status");
    el.textContent = message;
    document.body.appendChild(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 2600);
  }

  function busy(form, on) {
    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = on;
  }

  function handleCart(form, data) {
    if (typeof data.count === "number") setBadge("dz-cart-count", data.count);
    var btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.textContent = "\u2713 Added to cart";
      setTimeout(function () { btn.textContent = "\uD83D\uDEE0 Add to cart"; }, 2000);
    }
    toast("Added to cart", true);
  }

  function handleWishlist(form, data) {
    if (typeof data.count === "number") setBadge("dz-wishlist-count", data.count);
    var btn = form.querySelector('button[type="submit"]');
    if (btn) btn.textContent = "\u2665 Saved to wishlist";
    toast("Saved to your wishlist", true);
  }

  // Admin write forms: save over AJAX, then refresh so the table shows
  // the new state.
  function handleAdmin(form) {
    toast("Saved", true);
    setTimeout(function () { window.location.reload(); }, 500);
  }

  // Pull the most useful message out of an error payload:
  // {errors: {field: "..."}} first (most specific), then {message}/{error}.
  function errorMessage(data) {
    if (!data) return "";
    if (data.errors) {
      var keys = Object.keys(data.errors);
      if (keys.length) return String(data.errors[keys[0]]);
    }
    if (data.message) return String(data.message);
    if (data.error) return String(data.error);
    return "";
  }

  // A response counts as successful when it says so explicitly ("ok")
  // or, for endpoints that answer with a plain resource, when the HTTP
  // status is 2xx.
  function isSuccess(res, data) {
    if (data && typeof data.ok === "boolean") return data.ok;
    return res.ok;
  }

  // The server's multipart parser skips binary parts, so an image is
  // sent base64-encoded (the server validates the magic bytes and the
  // 2 MB limit). Read the picked file, fill the hidden target field and
  // show a preview. The file input is disabled afterwards so the binary
  // never enters the request body.
  function wireImageInputs() {
    document.addEventListener("change", function (e) {
      var input = e.target;
      if (!input.matches || !input.matches("input[data-base64-target]")) return;
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        toast("Image is larger than 2 MB — pick a smaller file.", false);
        input.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function (ev) {
        var form = input.closest("form");
        if (!form) return;
        var target = input.getAttribute("data-base64-target");
        // The target may be a CSS selector ("#id") or a bare element id.
        var selector = target;
        if (selector && selector.charAt(0) !== "#") selector = "#" + selector;
        var hidden = selector ? form.querySelector(selector) : null;
        if (hidden) hidden.value = String(ev.target.result);
        input.disabled = true;
        var previewTarget = input.getAttribute("data-preview-target");
        var previewSelector = previewTarget;
        if (previewSelector && previewSelector.charAt(0) !== "#") previewSelector = "#" + previewSelector;
        var preview = previewSelector ? form.querySelector(previewSelector) : null;
        if (preview) {
          preview.innerHTML = "";
          var img = document.createElement("img");
          img.src = String(ev.target.result);
          img.alt = "Selected image preview";
          preview.appendChild(img);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Destructive actions ask for a confirmation first. The prompt can sit
  // on the form itself or on the button inside it.
  function confirmDestructive(form) {
    var trigger = form.getAttribute("data-confirm")
      ? form
      : form.querySelector("[data-confirm]");
    if (!trigger) return true;
    return window.confirm(trigger.getAttribute("data-confirm"));
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute("data-ajax")) return;

    // An image form whose file was not converted yet must not submit.
    var pending = form.querySelector("input[data-base64-target]:not([disabled])");
    if (pending) {
      e.preventDefault();
      toast("Pick an image file first — the upload is still being read.", false);
      return;
    }
    if (!confirmDestructive(form)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    busy(form, true);

    var body = new URLSearchParams(new FormData(form));
    body.set("format", "json");

    fetch(form.getAttribute("action"), {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: body,
      credentials: "same-origin"
    }).then(function (res) {
      // Signed-out visitors: the auth gate answers 401 JSON — send them to login.
      if (res.status === 401) {
        window.location.href = "/login";
        return null;
      }
      return res.json().then(function (data) {
        return { res: res, data: data };
      }).catch(function () {
        return { res: res, data: {} };
      });
    }).then(function (out) {
      if (!out) return; // redirecting to /login
      if (!isSuccess(out.res, out.data)) {
        busy(form, false);
        var msg = errorMessage(out.data);
        if (msg === "") msg = "Something went wrong. Please try again.";
        toast(msg, false);
        return;
      }
      if (form.getAttribute("data-ajax") === "wishlist") {
        handleWishlist(form, out.data);
      } else if (form.getAttribute("data-ajax") === "admin") {
        handleAdmin(form);
      } else {
        handleCart(form, out.data);
      }
      busy(form, false);
    }).catch(function () {
      // Network failure or offline: fall back to the normal form POST.
      form.removeAttribute("data-ajax");
      form.submit();
    });
  });

  wireImageInputs();
})();
