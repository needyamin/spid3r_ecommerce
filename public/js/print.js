// print.js — progressive enhancement for the invoice print button.
// The button is a plain <button>; without JavaScript the customer simply
// uses the browser's own print action.
document.addEventListener("DOMContentLoaded", function () {
  var button = document.querySelector("[data-print]");
  if (!button) {
    return;
  }
  button.addEventListener("click", function () {
    window.print();
  });
});
