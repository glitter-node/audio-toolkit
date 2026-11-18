const audioToolkitI18n = (() => {
  const supported = ["ko", "en", "ja", "zh-CN"];
  const themeValues = ["system", "light", "dark"];
  const storage = (key, value) => {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (error) {
      return null;
    }
    return value;
  };
  const normalize = (tag) => {
    const value = String(tag || "").toLowerCase();
    if (value === "ko" || value.startsWith("ko-")) return "ko";
    if (value === "en" || value.startsWith("en-")) return "en";
    if (value === "ja" || value.startsWith("ja-")) return "ja";
    if (value === "zh-cn" || value === "zh-sg" || value.startsWith("zh-hans")) return "zh-CN";
    return "en";
  };
  const savedLocale = storage("audioToolkit.locale");
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const detected = browserLanguages.map(normalize).find((value, index) => value !== "en" || String(browserLanguages[index]).toLowerCase().startsWith("en")) || "en";
  let locale = supported.includes(savedLocale) ? savedLocale : detected;
  let themePreference = themeValues.includes(storage("audioToolkit.theme")) ? storage("audioToolkit.theme") : "system";
  let dictionaries = { en: {} };
  const media = matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => {
    document.documentElement.dataset.theme = themePreference === "system" ? (media.matches ? "dark" : "light") : themePreference;
    if (typeof draw === "function") draw();
  };
  media.addEventListener("change", () => { if (themePreference === "system") applyTheme(); });
  applyTheme();
  const lookup = (language, key) => key.split(".").reduce((value, part) => value?.[part], dictionaries[language]);
  const t = (key, params = {}) => {
    const template = lookup(locale, key) ?? lookup("en", key) ?? `[${key}]`;
    return String(template).replace(/\{([a-zA-Z]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
  };
  const applyText = (previousLocale = locale) => {
    document.documentElement.lang = locale;
    document.title = t("app.title");
    for (const element of document.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
    for (const [attribute, name] of [["aria-label", "i18nAriaLabel"], ["title", "i18nTitle"], ["placeholder", "i18nPlaceholder"]]) {
      for (const element of document.querySelectorAll(`[data-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}]`)) element.setAttribute(attribute, t(element.dataset[name]));
    }
    document.querySelector("#theme-preference").value = themePreference;
    document.querySelector("#locale-preference").value = locale;
    document.dispatchEvent(new CustomEvent("audioToolkit:localechange", { detail: { previousLocale } }));
  };
  const load = async (language) => {
    if (dictionaries[language] && Object.keys(dictionaries[language]).length) return;
    try {
      const response = await fetch(`/static/i18n/${language}.json`);
      if (!response.ok) throw new Error("Translation resource unavailable");
      dictionaries[language] = await response.json();
    } catch (error) {
      dictionaries[language] = {};
    }
  };
  const setLocale = async (value) => {
    const previousLocale = locale;
    locale = supported.includes(value) ? value : "en";
    storage("audioToolkit.locale", locale);
    await load(locale);
    applyText(previousLocale);
  };
  const setTheme = (value) => {
    themePreference = themeValues.includes(value) ? value : "system";
    storage("audioToolkit.theme", themePreference);
    applyTheme();
  };
  document.querySelector("#theme-preference").addEventListener("change", (event) => setTheme(event.target.value));
  document.querySelector("#locale-preference").addEventListener("change", (event) => setLocale(event.target.value));
  const ready = Promise.all([load("en"), load(locale)]).then(applyText);
  const translateExisting = (value, previousLocale) => {
    const scan = (object, prefix = "") => {
      for (const [part, text] of Object.entries(object || {})) {
        const key = prefix ? `${prefix}.${part}` : part;
        if (typeof text === "string" && text === value) return key;
        if (text && typeof text === "object") {
          const found = scan(text, key);
          if (found) return found;
        }
      }
      return null;
    };
    const key = scan(dictionaries[previousLocale]);
    return key ? t(key) : value;
  };
  return { t, ready, setLocale, setTheme, translateExisting, get locale() { return locale; } };
})();
