const changeLanguage = function (language) {
  const selected = language === "en" ? "en" : "de";
  document.documentElement.lang = selected;
  document.title =
    selected === "en"
      ? "VideoVault · Your videos. Your memories."
      : "VideoVault · Eure Videos. Eure Erinnerungen.";
  document.querySelectorAll("[data-content-language]").forEach((content) => {
    content.hidden = content.dataset.contentLanguage !== selected;
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.language === selected),
    );
  });
  document.querySelector("[data-footer-security]").textContent =
    selected === "en" ? "Security architecture" : "Sicherheitsarchitektur";
  try {
    localStorage.setItem("video-vault-docs-language", selected);
  } catch {
    // Language switching also works when browser storage is unavailable.
  }
};

let initialLanguage = navigator.language.toLowerCase().startsWith("de")
  ? "de"
  : "en";
try {
  const saved = localStorage.getItem("video-vault-docs-language");
  if (saved === "de" || saved === "en") initialLanguage = saved;
} catch {
  // Fall back to the browser language.
}

changeLanguage(initialLanguage);

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () =>
    changeLanguage(button.dataset.language),
  );
});
