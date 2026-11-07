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

  // Admin write forms: save over AJAX, update DOM in-place without full-page reloads.
  function handleAdmin(form, data) {
    var message = form.getAttribute("data-success-message") || "Saved";
    if (data && data.data && data.data.deleted) message = "Deleted";
    toast(message, true);

    var destination = form.getAttribute("data-success-redirect");
    if (destination) {
      setTimeout(function () { window.location.assign(destination); }, 350);
      return;
    }

    var action = form.getAttribute("action") || "";

    // 1. Delete action -> remove row in-place
    if (action.indexOf("delete-form") !== -1 || (data && data.data && data.data.deleted)) {
      var row = form.closest("tr, figure, .dz-gallery-item");
      if (row) {
        row.style.transition = "opacity 0.25s, transform 0.25s";
        row.style.opacity = "0";
        row.style.transform = "scale(0.95)";
        setTimeout(function () { row.remove(); }, 250);
      }
      return;
    }

    // 2. Publish / Unpublish action -> toggle button and badge in-place
    if (action.indexOf("publish-form") !== -1) {
      var newAction = action.replace("publish-form", "unpublish-form");
      form.setAttribute("action", newAction);
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.textContent = "Unpublish";
        btn.className = btn.className.replace("btn-primary", "btn-light border");
      }
      var container = form.closest("tr, .dz-product-heading, .dz-page-heading") || document;
      var badge = container.querySelector(".badge");
      if (badge) {
        badge.className = "badge text-bg-success";
        badge.textContent = "Published";
      }
      return;
    }
    if (action.indexOf("unpublish-form") !== -1) {
      var newAction2 = action.replace("unpublish-form", "publish-form");
      form.setAttribute("action", newAction2);
      var btn2 = form.querySelector('button[type="submit"]');
      if (btn2) {
        btn2.textContent = "Publish";
        btn2.className = btn2.className.replace("btn-light border", "btn-primary");
      }
      var container2 = form.closest("tr, .dz-product-heading, .dz-page-heading") || document;
      var badge2 = container2.querySelector(".badge");
      if (badge2) {
        badge2.className = "badge text-bg-secondary";
        badge2.textContent = "draft";
      }
      return;
    }

    // 3. Featured toggle -> toggle button and badge in-place
    if (action.indexOf("featured-form") !== -1) {
      var featBtn = form.querySelector('button[type="submit"]');
      var tr = form.closest("tr") || document;
      var featBadge = tr.querySelector(".badge.text-bg-warning");
      if (featBadge) {
        featBadge.remove();
        if (featBtn) featBtn.textContent = "Mark featured";
      } else {
        var nameCell = tr.querySelector("td[data-label='Product']");
        if (nameCell) {
          var b = document.createElement("span");
          b.className = "badge text-bg-warning ms-1";
          b.textContent = "Featured";
          nameCell.appendChild(b);
        }
        if (featBtn) featBtn.textContent = "Remove featured";
      }
      return;
    }

    // 4. Inventory restock -> update On hand and Available in-place
    if (action.indexOf("inventory/restock-form") !== -1) {
      var trInv = form.closest("tr");
      var qtyInput = form.querySelector('input[name="quantity"]');
      var added = parseInt(qtyInput ? qtyInput.value : 1, 10) || 1;
      if (trInv) {
        var onHandEl = trInv.querySelector("td[data-label='On hand'] strong");
        var availEl = trInv.querySelector("td[data-label='Available'] strong");
        if (onHandEl) onHandEl.textContent = String((parseInt(onHandEl.textContent, 10) || 0) + added);
        if (availEl) availEl.textContent = String((parseInt(availEl.textContent, 10) || 0) + added);
      }
      if (qtyInput) qtyInput.value = "1";
      return;
    }

    // 5. Inventory set exact -> update On hand, Available, and Threshold in-place
    if (action.indexOf("inventory/set-form") !== -1) {
      var trSet = form.closest("tr");
      var exactQty = form.querySelector('input[name="quantity"]');
      var exactThr = form.querySelector('input[name="low_stock_threshold"]');
      if (trSet && exactQty) {
        var qVal = parseInt(exactQty.value, 10) || 0;
        var onHandEl2 = trSet.querySelector("td[data-label='On hand'] strong");
        var availEl2 = trSet.querySelector("td[data-label='Available'] strong");
        if (onHandEl2) onHandEl2.textContent = String(qVal);
        if (availEl2) availEl2.textContent = String(qVal);
        if (exactThr) {
          var thrEl = trSet.querySelector("td[data-label='Low-stock at'] .badge");
          if (thrEl) thrEl.textContent = String(exactThr.value) + " units";
        }
      }
      return;
    }

    // 6. Orders or Customers status update -> update status cell in-place
    if (action.indexOf("/status") !== -1) {
      var sel = form.querySelector('select[name="status"]');
      if (sel) {
        var trStatus = form.closest("tr");
        if (trStatus) {
          var statusCell = trStatus.querySelector("td:nth-child(4)");
          if (statusCell) statusCell.textContent = sel.value;
        }
      }
      return;
    }

    // 7. Products create -> add to table in-place and reset form
    if (action.indexOf("/admin/api/products/create") !== -1) {
      form.reset();
      toast("Product created successfully", true);
      if (data && data.data && data.data.product) {
        var p = data.data.product;
        var tbody = document.querySelector("#product-table tbody");
        if (tbody) {
          var newTr = document.createElement("tr");
          newTr.setAttribute("data-filter-row", (p.name || "") + " " + (p.sku || "") + " " + (p.status || ""));
          newTr.innerHTML =
            '<td data-label="Image"><span class="dz-admin-thumb dz-admin-thumb-empty">No image</span></td>' +
            '<td data-label="Product"><span class="dz-product-row-name"><span class="fw-semibold">' + (p.name || "") + '</span></span></td>' +
            '<td data-label="SKU"><code>' + (p.sku || "") + '</code></td>' +
            '<td data-label="Price" class="text-nowrap"><strong>৳' + (p.price || "0.00") + '</strong></td>' +
            '<td data-label="On hand"><strong>' + (p.stock || 0) + '</strong><span class="d-block small text-secondary">' + (p.stock || 0) + ' available</span></td>' +
            '<td data-label="Status"><span class="badge text-bg-' + (p.status === "published" ? "success" : "secondary") + '">' + (p.status || "draft") + '</span></td>' +
            '<td data-label="Actions"><a class="btn btn-primary btn-sm" href="/admin/products/' + p.id + '">Manage product</a></td>';
          tbody.insertBefore(newTr, tbody.firstChild);
        }
      }
      return;
    }

    // 8. Categories create / Brands create -> reset form and toast
    if (action.indexOf("/admin/api/categories/create") !== -1 || action.indexOf("/admin/api/brands/create") !== -1) {
      form.reset();
      toast(message || "Created", true);
      return;
    }
  }

  function wireOrderView() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-order-view]");
      if (!btn) return;
      var orderId = btn.getAttribute("data-order-view");
      btn.disabled = true;
      fetch("/admin/api/order/" + orderId, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      }).then(function (r) { return r.json(); })
        .then(function (res) {
          btn.disabled = false;
          if (!res || !res.data) { toast("Could not load order details.", false); return; }
          showOrderModal(res.data, btn.closest("tr"));
        })
        .catch(function () {
          btn.disabled = false;
          toast("Network error loading order.", false);
        });
    });
  }

  function showOrderModal(d, sourceTr) {
    var o = d.order || {};
    var items = (d.items || []).map(function (it) {
      return "<tr><td>" + (it.name || "") + "</td><td><code>" + (it.sku || "") + "</code></td>" +
        "<td>" + (it.quantity || "") + "</td><td>" + (it.unit_display || "") + "</td>" +
        "<td><strong>" + (it.line_display || "") + "</strong></td></tr>";
    }).join("");
    var addr = d.address || {};
    var addrLines = [addr.name, addr.phone, addr.address_line1, addr.city, addr.postal_code].filter(Boolean);
    var addrHtml = addrLines.join("<br>") || "<em>No shipping address on file.</em>";
    var statusOpts = (d.statuses || []).map(function (s) {
      return '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + s.replace(/_/g, " ") + "</option>";
    }).join("");

    var bodyHtml =
      '<div class="row g-3">' +
        '<div class="col-12 col-md-6">' +
          '<h3 class="h6 mb-2">Customer & Shipping</h3>' +
          '<div class="p-2 border rounded bg-light mb-2">' +
            (d.customer ? '<p class="mb-1"><strong>' + d.customer.name + '</strong></p><p class="mb-0 text-secondary small">' + d.customer.email + '</p>' : '<p class="mb-0 text-secondary">Guest checkout</p>') +
          '</div>' +
          '<div class="p-2 border rounded bg-light">' +
            '<p class="mb-1 fw-semibold small">Address</p><p class="mb-0 small">' + addrHtml + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="col-12 col-md-6">' +
          '<h3 class="h6 mb-2">Order Summary</h3>' +
          '<div class="p-2 border rounded bg-light">' +
            '<div class="d-flex justify-content-between py-1 small"><span>Subtotal:</span><span>' + (d.subtotal_display || "") + '</span></div>' +
            '<div class="d-flex justify-content-between py-1 small"><span>Discount:</span><span>' + (d.discount_display || "") + '</span></div>' +
            '<div class="d-flex justify-content-between py-1 small"><span>Shipping:</span><span>' + (d.shipping_display || "") + '</span></div>' +
            '<div class="d-flex justify-content-between py-1 small"><span>Tax:</span><span>' + (d.tax_display || "") + '</span></div>' +
            '<hr class="my-1">' +
            '<div class="d-flex justify-content-between py-1 fw-bold"><span>Total:</span><span>' + (d.total_display || "") + '</span></div>' +
          '</div>' +
          '<div class="mt-3">' +
            '<label class="form-label small fw-semibold">Status</label>' +
            '<div class="input-group input-group-sm">' +
              '<select class="form-select" id="modalOrderStatus">' + statusOpts + '</select>' +
              '<button class="btn btn-primary" type="button" id="saveModalOrderStatus">Save status</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="col-12">' +
          '<h3 class="h6 mb-2">Items (' + (d.items || []).length + ')</h3>' +
          '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>' +
            '<th>Item</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>' +
            items +
          '</tbody></table></div>' +
        '</div>' +
      '</div>';

    var title = "Order " + (o.order_number || "") + " · " + (d.total_display || "");
    var footer = '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>';

    var titleEl = document.getElementById("adminModalTitle");
    var bodyEl = document.getElementById("adminModalBody");
    var footEl = document.getElementById("adminModalFooter");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    if (footEl) footEl.innerHTML = footer;

    var modalEl = document.getElementById("adminModal");
    if (modalEl && typeof bootstrap !== "undefined") {
      var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    }

    var saveBtn = document.getElementById("saveModalOrderStatus");
    if (saveBtn) {
      saveBtn.onclick = function () {
        var sel = document.getElementById("modalOrderStatus");
        if (!sel) return;
        var nextStatus = sel.value;
        saveBtn.disabled = true;
        var csrfMeta = document.querySelector('meta[name="csrf-token"]') || document.querySelector('input[name="_csrf"]');
        var csrfVal = csrfMeta ? (csrfMeta.content || csrfMeta.value) : "";
        var postBody = new URLSearchParams();
        postBody.set("status", nextStatus);
        postBody.set("_csrf", csrfVal);
        postBody.set("format", "json");

        fetch("/admin/api/orders/" + o.id + "/status", {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: postBody,
          credentials: "same-origin"
        }).then(function (r) { return r.json(); })
          .then(function (res2) {
            saveBtn.disabled = false;
            toast("Order status updated to " + nextStatus, true);
            if (sourceTr) {
              var statusCell = sourceTr.querySelector("td:nth-child(4)");
              if (statusCell) statusCell.textContent = nextStatus;
              var rowSel = sourceTr.querySelector("select[name='status']");
              if (rowSel) rowSel.value = nextStatus;
            }
          })
          .catch(function () {
            saveBtn.disabled = false;
            toast("Failed to update status", false);
          });
      };
    }
  }

  function wireTableFilters() {
    document.addEventListener("input", function (e) {
      var input = e.target;
      if (!input.matches || !input.matches("[data-table-filter]")) return;
      var table = document.getElementById(input.getAttribute("data-table-filter"));
      if (!table) return;
      var query = String(input.value || "").trim().toLowerCase();
      var rows = table.querySelectorAll("tbody tr[data-filter-row]");
      var visible = 0;
      rows.forEach(function (row) {
        var text = String(row.getAttribute("data-filter-row") || "").toLowerCase();
        var match = query === "" || text.indexOf(query) !== -1;
        row.hidden = !match;
        if (match) visible += 1;
      });
      var empty = document.querySelector("[data-filter-empty='" + table.id + "']");
      if (empty) empty.hidden = visible > 0;
    });
  }

  function wireGalleryThumbnails() {
    document.addEventListener("click", function (e) {
      var button = e.target.closest && e.target.closest("[data-gallery-thumb]");
      if (!button) return;
      var target = document.getElementById(button.getAttribute("data-gallery-target"));
      if (!target) return;
      target.src = button.getAttribute("data-image-src");
      target.alt = button.getAttribute("data-image-alt") || "Product image";
      var siblings = button.parentNode.querySelectorAll("[data-gallery-thumb]");
      siblings.forEach(function (thumb) {
        var selected = thumb === button;
        thumb.classList.toggle("is-active", selected);
        thumb.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    });
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
      reader.onerror = function () {
        toast("Could not read this image file. Choose another file and try again.", false);
        input.value = "";
      };
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

  function wireProductEnhancements() {
    document.addEventListener("click", function (e) {
      var stepBtn = e.target.closest && e.target.closest("[data-qty-step]");
      if (!stepBtn) return;
      var group = stepBtn.closest(".dz-qty-stepper") || stepBtn.parentNode;
      var input = group ? group.querySelector('input[name="quantity"]') : null;
      if (!input) return;
      var delta = parseInt(stepBtn.getAttribute("data-qty-step"), 10) || 0;
      var current = parseInt(input.value, 10) || 1;
      var min = parseInt(input.getAttribute("min"), 10) || 1;
      var max = parseInt(input.getAttribute("max"), 10) || 99;
      var next = current + delta;
      if (next < min) next = min;
      if (next > max) next = max;
      input.value = String(next);
    });

    document.addEventListener("change", function (e) {
      var select = e.target;
      if (!select.matches || !select.matches("[data-variant-select]")) return;
      var opt = select.options[select.selectedIndex];
      if (!opt) return;
      var priceDisplay = opt.getAttribute("data-price-display");
      var priceEl = document.getElementById("dz-buybox-price");
      if (priceDisplay && priceEl) {
        priceEl.textContent = priceDisplay;
      }
    });
  }

  function wireCheckoutLiveQuote() {
    var form = document.getElementById("dz-checkout-form");
    if (!form) return;

    function refreshQuote(showFeedbackToast) {
      var params = new URLSearchParams();
      var methodEl = document.getElementById("shipping_method");
      var couponEl = document.getElementById("coupon_code");
      var giftEl = document.getElementById("gift_card_code");
      var addrEl = document.getElementById("address_id");
      var cityEl = document.getElementById("city");
      var distEl = document.getElementById("district");
      var countryEl = document.getElementById("country");

      if (methodEl && methodEl.value) params.set("shipping_method", methodEl.value);
      if (couponEl && couponEl.value.trim()) params.set("coupon_code", couponEl.value.trim());
      if (giftEl && giftEl.value.trim()) params.set("gift_card_code", giftEl.value.trim());
      if (addrEl && addrEl.value) params.set("address_id", addrEl.value);
      if (cityEl && cityEl.value.trim()) params.set("city", cityEl.value.trim());
      if (distEl && distEl.value.trim()) params.set("district", distEl.value.trim());
      if (countryEl && countryEl.value.trim()) params.set("country", countryEl.value.trim());

      fetch("/checkout/quote?" + params.toString(), {
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      }).then(function (res) {
        return res.json().then(function (body) { return { res: res, body: body }; });
      }).then(function (out) {
        var couponFb = document.getElementById("dz-coupon-feedback");
        var giftFb = document.getElementById("dz-gift-card-feedback");
        if (!out.res.ok) {
          var err = errorMessage(out.body) || "Could not apply code.";
          toast(err, false);
          if (couponFb && couponEl && couponEl.value.trim()) {
            couponFb.innerHTML = '<span class="text-danger fw-semibold">' + err + '</span>';
          }
          return;
        }
        var q = (out.body && out.body.data) ? out.body.data : null;
        if (!q) return;

        var setTxt = function (id, val) {
          var el = document.getElementById(id);
          if (el && typeof val === "string") el.textContent = val;
        };
        setTxt("dz-summary-subtotal", q.subtotal_display);
        setTxt("dz-summary-discount", "\u2212 " + q.discount_display);
        setTxt("dz-summary-shipping", q.shipping_display);
        setTxt("dz-summary-shipping-method", q.shipping_method);
        setTxt("dz-summary-tax", q.tax_display);
        setTxt("dz-summary-total", q.total_display);

        var volRow = document.getElementById("dz-row-volume-discount");
        if (volRow) {
          volRow.classList.toggle("d-none", !(q.volume_discount_minor > 0));
          setTxt("dz-summary-volume-discount", "\u2212 " + (q.volume_discount_display || ""));
        }

        var coupRow = document.getElementById("dz-row-coupon-discount");
        if (coupRow) {
          var hasCoup = q.coupon_discount_minor > 0;
          coupRow.classList.toggle("d-none", !hasCoup);
          setTxt("dz-summary-coupon-code", q.coupon_code || "");
          setTxt("dz-summary-coupon-discount", "\u2212 " + (q.coupon_discount_display || ""));
          if (couponFb) {
            if (hasCoup) {
              couponFb.innerHTML = '<span class="text-success fw-semibold">\u2713 Coupon ' + (q.coupon_code || "") + ' applied (\u2212' + (q.coupon_discount_display || "") + ')</span>';
            } else {
              couponFb.textContent = "Have a promo code? Enter it and click Apply.";
            }
          }
        }

        var campRow = document.getElementById("dz-row-campaign-discount");
        if (campRow) {
          campRow.classList.toggle("d-none", !(q.campaign_discount_minor > 0));
          setTxt("dz-summary-campaign-discount", "\u2212 " + (q.campaign_discount_display || ""));
        }

        var giftRow = document.getElementById("dz-row-gift-discount");
        if (giftRow) {
          var hasGift = q.gift_card_discount_minor > 0;
          giftRow.classList.toggle("d-none", !hasGift);
          setTxt("dz-summary-gift-discount", "\u2212 " + (q.gift_card_display || ""));
          if (giftFb) {
            if (hasGift) {
              giftFb.innerHTML = '<span class="text-success fw-semibold">\u2713 Gift card applied (\u2212' + (q.gift_card_display || "") + ')</span>';
            } else {
              giftFb.textContent = "Redeem a Spid3r Store gift card against your total.";
            }
          }
        }

        var estEl = document.getElementById("dz-quote-delivery-estimate");
        if (estEl && q.shipping_days_min && q.shipping_days_max) {
          var zoneTxt = q.shipping_zone ? " (" + q.shipping_zone + ")" : "";
          estEl.innerHTML = "Estimated delivery: <strong>" + q.shipping_days_min + "\u2013" + q.shipping_days_max + " business days</strong>" + zoneTxt;
        }
        var freeBadge = document.getElementById("dz-quote-free-badge");
        if (freeBadge) {
          freeBadge.classList.toggle("d-none", !(q.shipping_minor === 0));
        }

        if (showFeedbackToast) {
          toast("Order summary updated", true);
        }
      }).catch(function () {});
    }

    form.addEventListener("change", function (e) {
      var target = e.target;
      if (!target || !target.matches) return;
      if (target.matches("[data-checkout-address-select]")) {
        var opt = target.options[target.selectedIndex];
        var reqInputs = form.querySelectorAll("[data-address-required]");
        if (opt && opt.value) {
          var setField = function (id, attr) {
            var input = document.getElementById(id);
            if (input) input.value = opt.getAttribute(attr) || "";
          };
          setField("full_name", "data-full-name");
          setField("phone", "data-phone");
          setField("line1", "data-line1");
          setField("line2", "data-line2");
          setField("city", "data-city");
          setField("district", "data-district");
          setField("postal_code", "data-postal-code");
          setField("country", "data-country");
          reqInputs.forEach(function (inp) { inp.removeAttribute("required"); });
        } else {
          reqInputs.forEach(function (inp) { inp.setAttribute("required", "required"); });
        }
        refreshQuote(true);
        return;
      }
      if (target.matches("[data-checkout-quote-trigger]")) {
        refreshQuote(false);
      }
    });

    form.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-checkout-apply-quote]");
      if (!btn) return;
      refreshQuote(true);
    });
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute("data-ajax")) return;
    var submitter = e.submitter || document.activeElement;
    var isBuyNow = submitter && submitter.getAttribute && submitter.getAttribute("data-buy-now") === "1";

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
        handleAdmin(form, out.data);
      } else {
        if (isBuyNow) {
          window.location.href = "/checkout";
          return;
        }
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
  wireTableFilters();
  wireGalleryThumbnails();
  wireOrderView();
  wireProductEnhancements();
  wireCheckoutLiveQuote();
})();
