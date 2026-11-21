// public/js/payment_simulator.js
// Sandbox payment page interactions (bKash / Nagad / SSLCommerz / Stripe).
// CSP-safe: the page carries no inline handlers or inline scripts — every
// behaviour attaches through data-* attributes + delegated listeners here.
(function () {
    'use strict';

    function setValue(id, value) {
        var el = document.getElementById(id);
        if (el) {
            el.value = value;
        }
    }

    function switchSslTab(tab) {
        var cardsBtn = document.getElementById('ssl-tab-cards');
        var mfsBtn = document.getElementById('ssl-tab-mfs');
        var netbankBtn = document.getElementById('ssl-tab-netbank');

        var cardsPanel = document.getElementById('ssl-panel-cards');
        var mfsPanel = document.getElementById('ssl-panel-mfs');
        var netbankPanel = document.getElementById('ssl-panel-netbank');
        var activeInput = document.getElementById('ssl-active-tab');

        if (!cardsBtn || !mfsBtn || !netbankBtn) {
            return;
        }

        cardsBtn.className = 'nav-link small py-2 fw-semibold text-secondary';
        mfsBtn.className = 'nav-link small py-2 fw-semibold text-secondary';
        netbankBtn.className = 'nav-link small py-2 fw-semibold text-secondary';

        cardsPanel.style.display = 'none';
        mfsPanel.style.display = 'none';
        netbankPanel.style.display = 'none';

        if (activeInput) {
            activeInput.value = tab;
        }

        if (tab === 'cards') {
            cardsBtn.className = 'nav-link active small py-2 fw-semibold';
            cardsPanel.style.display = 'block';
        } else if (tab === 'mfs') {
            mfsBtn.className = 'nav-link active small py-2 fw-semibold';
            mfsPanel.style.display = 'block';
        } else if (tab === 'netbank') {
            netbankBtn.className = 'nav-link active small py-2 fw-semibold';
            netbankPanel.style.display = 'block';
        }
    }

    function selectSslMfs(provider) {
        var providers = ['bkash', 'nagad', 'rocket'];
        for (var i = 0; i < providers.length; i++) {
            var p = providers[i];
            var btn = document.getElementById('ssl-mfs-btn-' + p);
            var radio = document.getElementById('mfs-' + p);
            if (btn && radio) {
                if (p === provider) {
                    radio.checked = true;
                    btn.classList.add('active');
                    if (p === 'bkash') btn.className = 'btn btn-outline-danger btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1 active';
                    if (p === 'nagad') btn.className = 'btn btn-outline-warning text-dark btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1 active';
                    if (p === 'rocket') btn.className = 'btn btn-outline-primary btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1 active';
                } else {
                    radio.checked = false;
                    btn.classList.remove('active');
                    if (p === 'bkash') btn.className = 'btn btn-outline-danger btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1';
                    if (p === 'nagad') btn.className = 'btn btn-outline-warning text-dark btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1';
                    if (p === 'rocket') btn.className = 'btn btn-outline-primary btn-sm px-3 py-2 fw-semibold d-flex align-items-center gap-1';
                }
            }
        }
    }

    document.addEventListener('click', function (e) {
        var fill = e.target.closest('[data-fill-id]');
        if (fill) {
            setValue(fill.getAttribute('data-fill-id'), fill.getAttribute('data-fill-value') || '');
            return;
        }

        var prefill = e.target.closest('[data-prefill-card]');
        if (prefill) {
            setValue('ssl-card-number', prefill.getAttribute('data-card-num') || '');
            setValue('ssl-card-expiry', prefill.getAttribute('data-card-exp') || '');
            setValue('ssl-card-cvv', prefill.getAttribute('data-card-cvv') || '');
            setValue('ssl-card-name', prefill.getAttribute('data-card-name') || '');
            return;
        }

        var tab = e.target.closest('[data-ssl-tab]');
        if (tab) {
            switchSslTab(tab.getAttribute('data-ssl-tab'));
            return;
        }

        var mfs = e.target.closest('[data-ssl-mfs]');
        if (mfs) {
            selectSslMfs(mfs.getAttribute('data-ssl-mfs'));
        }
    });
})();
