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
  function toast(message, ok) {
    var existing = document.getElementById("dz-toast");
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

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute("data-ajax")) return;
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
      if (!out.res.ok || !out.data.ok) {
        busy(form, false);
        var msg = out.data && out.data.message ? out.data.message : "Something went wrong. Please try again.";
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
})();
