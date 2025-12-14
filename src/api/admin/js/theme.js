// Theme management module
export const ThemeManager = {
  getTheme() {
    const saved = localStorage.getItem("theme");
    return saved || "dark"; // dark by default
  },

  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      toggle.textContent = theme === "dark" ? "🌙 Темна" : "☀️ Світла";
    }
  },

  toggleTheme() {
    const current = this.getTheme();
    const newTheme = current === "dark" ? "light" : "dark";
    this.setTheme(newTheme);
  },

  init() {
    this.setTheme(this.getTheme());
    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => this.toggleTheme());
    }
  },
};

