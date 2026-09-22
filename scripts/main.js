const MODULE_ID = "lipatos-player-features-lock";
const TOOLTIP_TEXT = "Только ГМ может активировать";
const LOCK_CLASS = "lipatos-gm-only-feature-control";
const LEVEL_EDIT_MODULE_ID = "lipatos-player-level-edit";
const LEGACY_LEVEL_EDIT_MODULE_ID = "aindor-player-level-edit";

const FEATURE_TAB_NAMES = new Set([
  "features",
  "feature",
  "traits",
  "trait",
  "special-features",
  "specialFeatures",
  "character-features",
  "characterFeatures"
]);

const CONTROL_SELECTOR = [
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[contenteditable='true']",
  "dnd5e-checkbox",
  "[role='checkbox']",
  "[aria-checked]"
].join(",");

let tooltip;
let observer;

function isPlayer() {
  return game?.user && !game.user.isGM;
}

function getActorFromRoot(root) {
  const actorId = root?.dataset?.lipatosActorId;
  return actorId ? game.actors?.get(actorId) : null;
}

function isLevelEditAllowed(control, root) {
  if (!(control instanceof HTMLSelectElement)) return false;

  const actor = getActorFromRoot(root);
  if (!actor) return false;

  const enabled = actor.getFlag?.(LEVEL_EDIT_MODULE_ID, "enabled") === true
    || actor.getFlag?.(LEGACY_LEVEL_EDIT_MODULE_ID, "enabled") === true;
  if (!enabled) return false;

  const itemRow = control.closest("[data-item-id]");
  const itemId = itemRow?.dataset?.itemId;
  if (!itemId) return false;

  const item = actor.items?.get(itemId);
  return item?.type === "class";
}

function unlockControl(control) {
  if (!(control instanceof HTMLElement)) return;

  control.classList.remove(LOCK_CLASS);
  delete control.dataset.lipatosGmOnly;
  control.removeAttribute("aria-disabled");

  if (control.getAttribute("title") === TOOLTIP_TEXT) {
    control.removeAttribute("title");
  }

  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.readOnly = false;
  }
}

function asElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.element instanceof HTMLElement) return html.element;
  return null;
}

function markCharacterSheet(app, html) {
  if (!isPlayer()) return;
  const actor = app?.actor ?? app?.document;
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") return;

  const root = asElement(html) ?? app?.element;
  const el = root instanceof HTMLElement ? root : root?.[0];
  if (!(el instanceof HTMLElement)) return;

  el.dataset.lipatosCharacterSheet = "true";
  el.dataset.lipatosActorId = actor.id;
  lockFeatureControls(el);
}

function isFeatureTabValue(value) {
  if (!value) return false;
  return FEATURE_TAB_NAMES.has(value) || /feature|trait/i.test(value);
}

function isInsideFeatures(control, root) {
  for (let el = control; el && el !== root; el = el.parentElement) {
    const tab = el.dataset?.tab;
    if (isFeatureTabValue(tab)) return true;

    const part = el.dataset?.applicationPart;
    if (part && /feature|trait/i.test(part)) return true;

    const cls = typeof el.className === "string" ? el.className : "";
    if (/\b(features?|traits?)\b/i.test(cls)) return true;
  }

  const activeFeatureNav = root.querySelector(
    '[data-tab="features"].active, [data-tab="feature"].active, [data-tab="traits"].active, [data-tab="trait"].active, [data-tab="features"][aria-selected="true"], [data-tab="traits"][aria-selected="true"]'
  );
  if (!activeFeatureNav) return false;

  const activePanel = control.closest(".tab.active, [data-tab].active, [role='tabpanel']");
  if (!activePanel) return false;

  if (control.closest("header, .sheet-header, .sidebar, .actor-header")) return false;
  return true;
}

function findCharacterRoot(control) {
  const marked = control.closest('[data-lipatos-character-sheet="true"]');
  if (marked) return marked;

  const candidate = control.closest(
    ".dnd5e2.sheet.actor.character, .dnd5e.sheet.actor.character, .sheet.actor.character, .application.actor.character"
  );
  return candidate ?? null;
}

function lockControl(control) {
  if (!(control instanceof HTMLElement) || control.classList.contains(LOCK_CLASS)) return;

  control.classList.add(LOCK_CLASS);
  control.dataset.lipatosGmOnly = "true";
  control.setAttribute("aria-disabled", "true");
  control.setAttribute("title", TOOLTIP_TEXT);

  if (control instanceof HTMLInputElement) {
    control.dataset.lipatosOriginalValue = control.value;
    control.dataset.lipatosOriginalChecked = String(control.checked);
    if (!["checkbox", "radio", "button", "submit", "reset", "file"].includes(control.type)) {
      control.readOnly = true;
    }
  } else if (control instanceof HTMLTextAreaElement) {
    control.dataset.lipatosOriginalValue = control.value;
    control.readOnly = true;
  } else if (control instanceof HTMLSelectElement) {
    control.dataset.lipatosOriginalValue = control.value;
  } else if (control.isContentEditable) {
    control.dataset.lipatosOriginalContenteditable = "true";
    control.setAttribute("contenteditable", "false");
  } else {
    if (control.hasAttribute("aria-checked")) {
      control.dataset.lipatosOriginalAriaChecked = control.getAttribute("aria-checked") ?? "false";
    }
    if (control.hasAttribute("checked")) {
      control.dataset.lipatosOriginalCheckedAttr = "true";
    } else {
      control.dataset.lipatosOriginalCheckedAttr = "false";
    }
    control.setAttribute("tabindex", "-1");
  }
}

function lockFeatureControls(root = document) {
  if (!isPlayer()) return;

  const controls = root.matches?.(CONTROL_SELECTOR)
    ? [root]
    : Array.from(root.querySelectorAll?.(CONTROL_SELECTOR) ?? []);

  for (const control of controls) {
    const sheetRoot = findCharacterRoot(control)
      ?? (root.dataset?.lipatosCharacterSheet === "true" ? root : null);
    if (!sheetRoot) continue;
    if (!isInsideFeatures(control, sheetRoot)) continue;

    if (isLevelEditAllowed(control, sheetRoot)) {
      unlockControl(control);
      continue;
    }

    lockControl(control);
  }
}

function isLockedControl(target) {
  if (!isPlayer()) return false;
  const control = target?.closest?.(CONTROL_SELECTOR);
  if (!control) return false;

  const root = findCharacterRoot(control);
  if (!root || !isInsideFeatures(control, root)) return false;

  if (isLevelEditAllowed(control, root)) {
    unlockControl(control);
    return false;
  }

  if (control.classList.contains(LOCK_CLASS)) return true;

  lockControl(control);
  return true;
}

function restoreVisualValue(control) {
  if (control instanceof HTMLInputElement) {
    if (["checkbox", "radio"].includes(control.type)) {
      control.checked = control.dataset.lipatosOriginalChecked === "true";
    } else if (control.dataset.lipatosOriginalValue !== undefined) {
      control.value = control.dataset.lipatosOriginalValue;
    }
  } else if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
    if (control.dataset.lipatosOriginalValue !== undefined) control.value = control.dataset.lipatosOriginalValue;
  } else {
    if (control.dataset.lipatosOriginalAriaChecked !== undefined) {
      control.setAttribute("aria-checked", control.dataset.lipatosOriginalAriaChecked);
    }
    if (control.dataset.lipatosOriginalCheckedAttr === "true") control.setAttribute("checked", "");
    else if (control.dataset.lipatosOriginalCheckedAttr === "false") control.removeAttribute("checked");
  }
}

function blockEvent(event) {
  if (!isLockedControl(event.target)) return;

  const control = event.target.closest(CONTROL_SELECTOR);
  if (!control) return;

  if (["mouseover", "mouseenter", "mousemove", "mouseout", "mouseleave"].includes(event.type)) return;

  const harmlessKeys = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "Escape"]);
  if (event.type === "keydown" && harmlessKeys.has(event.key)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  restoreVisualValue(control);
}

function ensureTooltip() {
  if (tooltip?.isConnected) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = `${MODULE_ID}-tooltip`;
  tooltip.textContent = TOOLTIP_TEXT;
  document.body.appendChild(tooltip);
  return tooltip;
}

function showTooltip(event) {
  if (!isLockedControl(event.target)) return;
  const tip = ensureTooltip();
  tip.classList.add("visible");
  moveTooltip(event);
}

function moveTooltip(event) {
  if (!tooltip?.classList.contains("visible")) return;
  const gap = 14;
  const pad = 8;
  let left = event.clientX + gap;
  let top = event.clientY + gap;

  const rect = tooltip.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - pad) left = event.clientX - rect.width - gap;
  if (top + rect.height > window.innerHeight - pad) top = event.clientY - rect.height - gap;

  tooltip.style.left = `${Math.max(pad, left)}px`;
  tooltip.style.top = `${Math.max(pad, top)}px`;
}

function hideTooltip(event) {
  if (!tooltip) return;
  const next = event.relatedTarget;
  if (next?.closest?.(`.${LOCK_CLASS}`)) return;
  tooltip.classList.remove("visible");
}

Hooks.once("ready", () => {
  if (!isPlayer()) return;

  Hooks.on("renderActorSheet", markCharacterSheet);
  Hooks.on("renderActorSheetV2", markCharacterSheet);
  Hooks.on("renderApplicationV2", (app, html) => markCharacterSheet(app, html));

  const blockedEvents = [
    "pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick",
    "touchstart", "touchend", "change", "input", "beforeinput",
    "keydown", "keypress", "keyup", "paste", "drop", "wheel"
  ];
  for (const type of blockedEvents) document.addEventListener(type, blockEvent, true);

  document.addEventListener("mouseover", showTooltip, true);
  document.addEventListener("mousemove", moveTooltip, true);
  document.addEventListener("mouseout", hideTooltip, true);

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) lockFeatureControls(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  lockFeatureControls(document);
});

Hooks.on("updateActor", (actor, changes) => {
  if (!isPlayer() || actor?.type !== "character" || !actor?.isOwner) return;

  const changed =
    foundry.utils.hasProperty(changes, `flags.${LEVEL_EDIT_MODULE_ID}.enabled`)
    || foundry.utils.hasProperty(changes, `flags.${LEVEL_EDIT_MODULE_ID}`)
    || foundry.utils.hasProperty(changes, `flags.${LEGACY_LEVEL_EDIT_MODULE_ID}.enabled`)
    || foundry.utils.hasProperty(changes, `flags.${LEGACY_LEVEL_EDIT_MODULE_ID}`);

  if (!changed) return;

  for (const root of document.querySelectorAll(
    `[data-lipatos-character-sheet="true"][data-lipatos-actor-id="${actor.id}"]`
  )) {
    lockFeatureControls(root);
  }
});
