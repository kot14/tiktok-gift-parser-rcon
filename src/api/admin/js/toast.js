// Toast notification module
const toastEl = document.getElementById("toast");

export const showToast = (msg, isError = false) => {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.style.background = isError
    ? "var(--toast-error-bg)"
    : "var(--toast-bg)";
  toastEl.style.display = "block";
  setTimeout(() => (toastEl.style.display = "none"), 2500);
};

