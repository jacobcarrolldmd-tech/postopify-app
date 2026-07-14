/**
 * Postopify - Alarm Reliability Setup Wizard
 * -------------------------------------------
 * Drop this file in alongside your existing app.js.
 * Uses your existing pk() namespaced-localStorage pattern and LANG dictionary.
 *
 * INTEGRATION CHECKLIST:
 * 1. Replace `pk` below with your actual imported/global pk() helper.
 * 2. Add the wizard's translation strings into your LANG dictionary (see bottom).
 * 3. Call `initReliabilityWizard()` once on app load (after profile is selected).
 * 4. Add a button/menu item that calls `openReliabilityWizard()` to let patients
 *    reopen it manually later.
 * 5. Add `<div id="reliability-wizard-overlay"></div>` to your HTML (or let the
 *    script inject it — it does, by default, see injectStyles/injectMarkup below).
 */

(function () {
  'use strict';

  // ---------- 1. DEVICE / BROWSER DETECTION ----------

  function detectPlatform() {
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isChrome = /Chrome/i.test(ua) && !/Edg|OPR|SamsungBrowser/i.test(ua);
    const isSamsungBrowser = /SamsungBrowser/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua);

    // Best-effort manufacturer sniff. Not reliable — the wizard also just asks the user.
    let likelyOEM = null;
    if (/Samsung/i.test(ua) || isSamsungBrowser) likelyOEM = 'samsung';
    else if (/Xiaomi|Redmi|MIUI/i.test(ua)) likelyOEM = 'xiaomi';
    else if (/HUAWEI|Honor/i.test(ua)) likelyOEM = 'huawei';
    else if (/OnePlus/i.test(ua)) likelyOEM = 'oneplus';

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true; // iOS Safari flag

    return { isAndroid, isIOS, isChrome, isSamsungBrowser, isSafari, likelyOEM, isStandalone };
  }

  // ---------- 2. STATE PERSISTENCE (uses your pk() pattern) ----------

  function wizardKey() {
  return pk('reliability_setup');
}

  function loadState() {
    try {
      const raw = localStorage.getItem(wizardKey());
      return raw ? JSON.parse(raw) : { steps: {}, dismissedAt: null, oem: null };
    } catch (e) {
      return { steps: {}, dismissedAt: null, oem: null };
    }
  }

  function saveState(state) {
    localStorage.setItem(wizardKey(), JSON.stringify(state));
  }

  // ---------- 3. STEP DEFINITIONS ----------
  // Each step: id, title/body come from LANG (i18n-safe), a "check" fn if
  // live-detectable, and instructions if it's manual-only.

  function buildSteps(platform) {
    const steps = [];

    // Notifications - live detectable + actionable
    steps.push({
      id: 'notifications',
      detectable: true,
      isDone: () => Notification.permission === 'granted',
      action: async () => {
        const result = await Notification.requestPermission();
        return result === 'granted';
      },
      titleKey: 'wizard_notifications_title',
      bodyKey: 'wizard_notifications_body',
      manualFallbackKey: 'wizard_notifications_manual',
    });

    // Install to home screen - live detectable, not directly triggerable on iOS
    steps.push({
      id: 'install',
      detectable: true,
      isDone: () => platform.isStandalone,
      action: platform.isAndroid ? triggerInstallPrompt : null,
      titleKey: 'wizard_install_title',
      bodyKey: platform.isIOS ? 'wizard_install_body_ios' : 'wizard_install_body_android',
    });

    if (platform.isAndroid) {
      // Battery optimization - manual only, self-checked
      steps.push({
        id: 'battery',
        detectable: false,
        titleKey: 'wizard_battery_title',
        bodyKey: 'wizard_battery_body',
        selfCheck: true,
      });

      // OEM-specific extra step (Samsung/Xiaomi/etc.)
      steps.push({
        id: 'oem',
        detectable: false,
        titleKey: 'wizard_oem_title',
        bodyKey: 'wizard_oem_body',
        selfCheck: true,
        askOEM: true, // renders the "what phone do you have" picker
      });

      // Do Not Disturb / volume - manual only, self-checked
      steps.push({
        id: 'dnd',
        detectable: false,
        titleKey: 'wizard_dnd_title',
        bodyKey: 'wizard_dnd_body',
        selfCheck: true,
      });
    }

    if (platform.isIOS) {
      steps.push({
        id: 'ios_notifications_after_install',
        detectable: false,
        titleKey: 'wizard_ios_notif_title',
        bodyKey: 'wizard_ios_notif_body',
        selfCheck: true,
      });
    }

    return steps;
  }

  // ---------- 4. INSTALL PROMPT CAPTURE (Android only) ----------

  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  async function triggerInstallPrompt() {
    if (!deferredInstallPrompt) return false;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return choice.outcome === 'accepted';
  }

  // ---------- 5. UI RENDERING ----------

  function injectStyles() {
    if (document.getElementById('reliability-wizard-styles')) return;
    const style = document.createElement('style');
    style.id = 'reliability-wizard-styles';
    style.textContent = `
      #reliability-wizard-overlay {
        position: fixed; inset: 0; background: rgba(10,20,30,0.55);
        display: none; align-items: center; justify-content: center;
        z-index: 9999; padding: 16px;
      }
      #reliability-wizard-overlay.open { display: flex; }
      .rw-card {
        background: #fff; border-radius: 14px; max-width: 420px; width: 100%;
        max-height: 85vh; overflow-y: auto; padding: 20px;
        font-family: inherit; box-shadow: 0 10px 40px rgba(0,0,0,0.25);
      }
      .rw-step { border: 1px solid #e2e8ec; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
      .rw-step.done { border-color: #2fa36b; background: #f2fbf6; }
      .rw-step-title { font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .rw-badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #eee; }
      .rw-badge.done { background: #2fa36b; color: #fff; }
      .rw-body { font-size: 14px; color: #444; margin-top: 6px; line-height: 1.4; }
      .rw-btn { margin-top: 10px; padding: 8px 14px; border-radius: 8px; border: none;
        background: #14506b; color: #fff; font-weight: 600; cursor: pointer; }
      .rw-btn.secondary { background: #eef2f4; color: #14506b; }
      .rw-check { margin-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 14px; }
      .rw-close { float: right; background: none; border: none; font-size: 20px; cursor: pointer; }
      .rw-oem-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
      .rw-oem-chip { padding: 4px 10px; border-radius: 999px; border: 1px solid #ccc;
        background: #fff; font-size: 13px; cursor: pointer; }
      .rw-oem-chip.selected { background: #14506b; color: #fff; border-color: #14506b; }
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    if (document.getElementById('reliability-wizard-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'reliability-wizard-overlay';
    overlay.innerHTML = `<div class="rw-card" id="rw-card-body"></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeReliabilityWizard();
    });
  }

  function t(key) {
    // TODO: hook into your existing LANG/applyLang system.
    // Fallback English strings live here so this works standalone.
    const fallback = {
      wizard_notifications_title: 'Enable reminder notifications',
      wizard_notifications_body: 'Lets the app alert you when it\'s time for a dose.',
      wizard_notifications_manual: 'If nothing happens when you tap Enable, notifications were previously blocked — open Chrome → Site settings → Notifications → Allow.',
      wizard_install_title: 'Add to Home Screen',
      wizard_install_body_android: 'Installing the app (instead of using it in a browser tab) makes reminders much more reliable.',
      wizard_install_body_ios: 'On iPhone, reminders only work if the app is added to your Home Screen. Tap the Share icon, then "Add to Home Screen."',
      wizard_battery_title: 'Allow unrestricted battery use',
      wizard_battery_body: 'Go to Settings → Apps → Chrome → Battery → tap "Unrestricted." This stops your phone from silencing reminders when idle.',
      wizard_oem_title: 'Extra phone-specific setting',
      wizard_oem_body: 'Some phone brands (Samsung, Xiaomi, etc.) have an additional battery manager beyond the standard Android setting.',
      wizard_dnd_title: 'Check Do Not Disturb & volume',
      wizard_dnd_body: 'Make sure Do Not Disturb is off, or this app is allowed through it, and notification volume isn\'t muted.',
      wizard_ios_notif_title: 'Allow notifications',
      wizard_ios_notif_body: 'After adding to Home Screen, open the app and allow notifications when prompted (or in Settings → [App Name] → Notifications).',
      wizard_title: 'Set up reliable reminders',
      wizard_done_all: 'You\'re all set for reliable dose reminders.',
    };
    return (window.LANG && window.LANG[key]) || fallback[key] || key;
  }

  const OEM_LIST = [
    { id: 'samsung', label: 'Samsung' },
    { id: 'xiaomi', label: 'Xiaomi / Redmi' },
    { id: 'huawei', label: 'Huawei / Honor' },
    { id: 'oneplus', label: 'OnePlus' },
    { id: 'other', label: 'Other / Not sure' },
  ];

  function render() {
    const platform = detectPlatform();
    const state = loadState();
    const steps = buildSteps(platform);
    const body = document.getElementById('rw-card-body');
    if (!body) return;

    const allDone = steps.every((s) => isStepDone(s, state));

    let html = `<button class="rw-close" onclick="ReliabilityWizard.close()">&times;</button>`;
    html += `<h2>${t('wizard_title')}</h2>`;
    if (allDone) {
      html += `<p class="rw-body">✅ ${t('wizard_done_all')}</p>`;
    }

    steps.forEach((step) => {
      const done = isStepDone(step, state);
      html += `<div class="rw-step ${done ? 'done' : ''}">
        <div class="rw-step-title">
          <span>${t(step.titleKey)}</span>
          <span class="rw-badge ${done ? 'done' : ''}">${done ? '✓ Done' : 'Needed'}</span>
        </div>
        <div class="rw-body">${t(step.bodyKey)}</div>`;

      if (step.action) {
        html += `<button class="rw-btn" onclick="ReliabilityWizard.runAction('${step.id}')">Enable</button>`;
      }

      if (step.askOEM) {
        html += `<div class="rw-oem-row">`;
        OEM_LIST.forEach((oem) => {
          const selected = state.oem === oem.id ? 'selected' : '';
          html += `<span class="rw-oem-chip ${selected}" onclick="ReliabilityWizard.setOEM('${oem.id}')">${oem.label}</span>`;
        });
        html += `</div>`;
        if (state.oem && state.oem !== 'other') {
          html += `<div class="rw-body">${oemInstructions(state.oem)}</div>`;
        }
      }

      if (step.selfCheck) {
        const checked = !!state.steps[step.id];
        html += `<label class="rw-check">
          <input type="checkbox" ${checked ? 'checked' : ''}
            onchange="ReliabilityWizard.toggleSelfCheck('${step.id}', this.checked)">
          I've done this
        </label>`;
      }

      html += `</div>`;
    });

    body.innerHTML = html;
  }

  function oemInstructions(oem) {
    const map = {
      samsung: 'Also open Settings → Apps → Chrome → Battery, then separately check Settings → Device care → Battery → Background usage limits, and remove Chrome from any "sleeping/deep sleeping apps" list.',
      xiaomi: 'Open Security app → Battery → App battery saver → find Chrome → set to "No restrictions." Also enable Autostart for Chrome in the same Security app.',
      huawei: 'Open Phone Manager/Optimizer → Battery → App launch → find Chrome → switch off "Manage automatically" and manually enable Auto-launch, Secondary launch, and Run in background.',
      oneplus: 'Open Settings → Battery → Battery optimization → find Chrome → set to "Don\'t optimize."',
    };
    return map[oem] || '';
  }

  function isStepDone(step, state) {
    if (step.detectable && step.isDone) return step.isDone();
    if (step.selfCheck) return !!state.steps[step.id];
    return false;
  }

  // ---------- 6. PUBLIC API ----------

  window.ReliabilityWizard = {
    open: openReliabilityWizard,
    close: closeReliabilityWizard,
    async runAction(stepId) {
      const platform = detectPlatform();
      const steps = buildSteps(platform);
      const step = steps.find((s) => s.id === stepId);
      if (step && step.action) {
        await step.action();
        render();
      }
    },
    toggleSelfCheck(stepId, checked) {
      const state = loadState();
      state.steps[stepId] = checked;
      saveState(state);
      render();
    },
    setOEM(oemId) {
      const state = loadState();
      state.oem = oemId;
      saveState(state);
      render();
    },
  };

  function openReliabilityWizard() {
    injectStyles();
    injectMarkup();
    render();
    document.getElementById('reliability-wizard-overlay').classList.add('open');
  }

  function closeReliabilityWizard() {
    const state = loadState();
    state.dismissedAt = Date.now();
    saveState(state);
    const overlay = document.getElementById('reliability-wizard-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  // ---------- 7. AUTO-INIT ----------
// Auto-run on first page load, independent of the app's own init flow.
  document.addEventListener('DOMContentLoaded', function () {
    // Small delay so the app's own profile-loading logic finishes first.
    setTimeout(function () {
      if (typeof window.initReliabilityWizard === 'function') {
        window.initReliabilityWizard();
      }
    }, 800);
  });
  window.initReliabilityWizard = function initReliabilityWizard(opts) {
    opts = opts || {};
    const state = loadState();
    const platform = detectPlatform();
    const steps = buildSteps(platform);
    const allDone = steps.every((s) => isStepDone(s, state));

    // Auto-open once per profile if not all steps done and not dismissed today.
    const dismissedRecently =
      state.dismissedAt && Date.now() - state.dismissedAt < 1000 * 60 * 60 * 24;

    if (!allDone && !dismissedRecently && opts.autoOpen !== false) {
      openReliabilityWizard();
    }
  };
})();
