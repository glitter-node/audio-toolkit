(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem("audioToolkit.theme");
    if (["system", "light", "dark"].includes(saved)) preference = saved;
  } catch (error) {
    preference = "system";
  }
  document.documentElement.dataset.theme = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
})();
