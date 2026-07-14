/**
 * practice-config.js
 *
 * Detects which practice is loading the app based on subdomain,
 * fetches that practice's config from the Apps Script backend,
 * and applies branding before the rest of the app renders.
 *
 * Include this near the top of your HTML, before other app scripts run.
 */

// ---- 1. Figure out which practice this is ----
function getPracticeId() {
  const host = window.location.hostname; // e.g. "omsco.postopify.com"
  const parts = host.split(".");

  // Local testing fallback: ?practice=omsco in the URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("practice")) {
    return urlParams.get("practice");
  }

  // "omsco.postopify.com" -> "omsco"
  // "postopify.com" (no subdomain, e.g. your marketing/demo site) -> "default"
  if (parts.length >= 3) {
    return parts[0].toLowerCase();
  }
  return "default";
}

// ---- 2. Fetch that practice's config from Apps Script ----
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyW5sgcGa5aK9LWh_5bDVAq8aenM1Y4G2Cf5CmnPXb3TsVoDo8FQWLhrT-SgME0r5eh/exec";

async function loadPracticeConfig() {
  const practiceId = getPracticeId();

  try {
    const response = await fetch(
      `${APPS_SCRIPT_URL}?action=getConfig&practice=${encodeURIComponent(practiceId)}`
    );

    if (!response.ok) {
      throw new Error(`Config fetch failed: ${response.status}`);
    }

    const config = await response.json();

    if (config.error) {
      console.error("Practice config error:", config.error);
      return getFallbackConfig(practiceId);
    }

    return config;
  } catch (err) {
    console.error("Could not load practice config, using fallback:", err);
    return getFallbackConfig(practiceId);
  }
}

// ---- 3. Fallback so the app never shows a blank/broken page ----
function getFallbackConfig(practiceId) {
  return {
    practice_id: practiceId,
    clinic_name: "Post-Op Instructions",
    logo_url: "",
    primary_color: "#1D9E75",
    drive_folder_id: null,
  };
}

// ---- 4. Apply the config to the page ----
function applyPracticeBranding(config) {
  document.title = config.clinic_name;
  applyDynamicManifest(config);

  document.documentElement.style.setProperty("--practice-primary-color", config.primary_color);

  const logoEl = document.getElementById("practice-logo");
  if (logoEl && config.logo_url) {
    logoEl.src = config.logo_url;
    logoEl.alt = config.clinic_name;
  }

  const nameEls = document.querySelectorAll("[data-practice-name]");
  nameEls.forEach((el) => (el.textContent = config.clinic_name));
}

// ---- 5. Bootstrap ----
// Call this once on page load, before rendering procedure content.
// Other scripts can read window.practiceConfig once this resolves.
async function initPractice() {
  const config = await loadPracticeConfig();
  window.practiceConfig = config;
  applyPracticeBranding(config);

  // Let the rest of the app know config is ready
  document.dispatchEvent(new CustomEvent("practiceConfigReady", { detail: config }));

  return config;
}

// Auto-run on load
initPractice();
// ---- 6. Build and inject a dynamic per-practice manifest ----
function applyDynamicManifest(config) {
  const practiceId = config.practice_id.toLowerCase();

  const manifest = {
    name: config.clinic_name,
    short_name: config.clinic_name.length > 20
      ? config.clinic_name.substring(0, 20)
      : config.clinic_name,
    start_url: "/?practice=" + practiceId,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: config.primary_color || "#1D9E75",
    icons: [
      {
        src: `icon-192-${practiceId}.png`,
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: `icon-512-${practiceId}.png`,
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  const manifestUrl = URL.createObjectURL(blob);

  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    document.head.appendChild(link);
  }
  link.href = manifestUrl;
}
