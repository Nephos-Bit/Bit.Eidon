const CAPTCHA =
  'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]';

const copy = {
  suggestTitle: "Trashmail verwenden?",
  suggestSignup: "Wegwerfadresse für diese Registrierung.",
  suggestLogin: "Wegwerfadresse erzeugen. Ein Login wird nicht abgesendet.",
  suggestSession: "Dieselbe Adresse aus dieser Sitzung:",
  later: "Später",
  create: "Erstellen",
  use: "Verwenden",
  runningTitle: "Adresse wird erstellt…",
  runningSubtitle: "Bitte warten, die Trashmail wird angelegt.",
  cancel: "Abbrechen",
  filling: "Felder werden ausgefüllt…",
  doneTitle: "Fertig",
  inbox: "Posteingang",
  captchaTitle: "Captcha ausstehend",
  captchaSubtitle: "Felder sind ausgefüllt. Captcha lösen, dann senden.",
  sendNow: "Jetzt senden",
  noSubmitTitle: "Felder ausgefüllt",
  noSubmitSubtitle: "Senden-Button nicht gefunden.",
  loginDoneTitle: "Adresse eingesetzt",
  loginDoneSubtitle: "Das Login wurde nicht abgesendet.",
  adapting: "Neue Felder werden ergänzt, sobald sie erscheinen.",
  invalidTitle: "Formular unvollständig",
  close: "Schließen",
  failedTitle: "Nicht erstellt",
  retry: "Erneut",
  fillFailed: "Felder konnten nicht gefüllt werden.",
};

const ICONS = {
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 7.5 12 13l8-5.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  bolt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

let mode = "idle";
let blocked = false;
let scanLock = false;
let current = null;
let toast = null;
let inboxTabId = null;
let mailboxId = null;
let scanTimer = 0;
let passwordWatch = 0;
let followWatch = 0;
let activeProfile = null;
let followStartedAt = 0;
let followPasswordTries = 0;
let lastCodePoll = 0;

function dismissKey() {
  return `dismiss:${location.origin}`;
}

function isVisible(element) {
  if (!element || element.disabled) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isEmailInput(input) {
  if (!(input instanceof HTMLInputElement)) return false;
  if (["hidden", "password", "checkbox", "radio", "submit", "button", "file"].includes(input.type)) return false;
  if (input.type === "email" || input.autocomplete === "email") return true;
  const label = [...(input.labels || [])].map((node) => node.innerText).join(" ");
  const hint = `${input.name} ${input.id} ${input.autocomplete} ${input.placeholder} ${input.getAttribute("aria-label") || ""} ${label}`.toLowerCase();
  return /e-?mail/.test(hint);
}

function buttonText(node) {
  return `${node.innerText || ""} ${node.value || ""} ${node.getAttribute("aria-label") || ""}`;
}

function nearbyButtons(email) {
  const found = [];
  let node = email.parentElement;
  for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
    for (const button of node.querySelectorAll('button, input[type="submit"], [role="button"]')) {
      if (!found.includes(button)) found.push(button);
    }
    if (pickButton(found)) break;
  }
  return found;
}

function scopeOf(input) {
  return input.form || input.closest("section, main, [role=main], [role=dialog]") || document.body;
}

function signals(scope) {
  const bits = [
    scope.getAttribute?.("aria-label") || "",
    scope.id || "",
    scope.getAttribute?.("name") || "",
    typeof scope.className === "string" ? scope.className : "",
  ];
  scope.querySelectorAll?.("h1, h2, h3, legend, button, label").forEach((node) => {
    bits.push(node.innerText || "");
  });
  return bits.join(" ").replace(/\s+/g, " ").slice(0, 2500);
}

function classify(scope, passwords, email) {
  return TrashmailForm.classifyForm({
    text: signals(scope),
    passwordCount: passwords.length,
    hasNewPassword: passwords.some((input) => (input.autocomplete || "").includes("new-password")),
    hasCurrentPassword: passwords.some((input) => (input.autocomplete || "").includes("current-password")),
    continueText: nearbyButtons(email).map(buttonText).join("\n"),
  });
}

function findCandidate() {
  for (const email of document.querySelectorAll("input")) {
    if (!isEmailInput(email) || !isVisible(email) || email.value.trim()) continue;
    const scope = scopeOf(email);
    const passwords = [...scope.querySelectorAll('input[type="password"]')].filter(isVisible);
    const kind = classify(scope, passwords, email);
    if (!kind) continue;
    const emails = [...scope.querySelectorAll("input")].filter((input) => isEmailInput(input) && isVisible(input));
    return { email, scope, kind, passwords, emails };
  }
  return null;
}

function pickButton(nodes) {
  const unique = [];
  for (const node of nodes) {
    if (unique.includes(node) || node.disabled || !isVisible(node)) continue;
    unique.push(node);
  }
  const candidates = unique.filter((node) => !TrashmailForm.isSocialLabel(buttonText(node)));
  return (
    candidates.find((node) => TrashmailForm.isSignupLabel(buttonText(node))) ||
    candidates.find((node) => TrashmailForm.isContinueLabel(buttonText(node))) ||
    candidates.find((node) => TrashmailForm.isLoginLabel(buttonText(node))) ||
    candidates.find((node) => node.type === "submit" || node.getAttribute("type") === "submit") ||
    null
  );
}

function findSubmit(email) {
  const form = email.form;
  const buttons = nearbyButtons(email);
  if (form) {
    buttons.push(...form.querySelectorAll('button, input[type="submit"], [role="button"]'));
    if (form.id) {
      buttons.push(
        ...document.querySelectorAll(
          `button[form="${CSS.escape(form.id)}"], input[form="${CSS.escape(form.id)}"]`,
        ),
      );
    }
  }
  return pickButton(buttons);
}

function hasCaptcha(email) {
  const roots = [email.form, email.form?.parentElement, scopeOf(email)].filter(Boolean);
  return roots.some((root) => root.querySelector(CAPTCHA));
}

function fieldHint(input) {
  const label = [...(input.labels || [])].map((node) => node.innerText).join(" ");
  return `${input.getAttribute("name") || ""} ${input.id || ""} ${input.getAttribute("placeholder") || ""} ${input.getAttribute("aria-label") || ""} ${label}`;
}

function fillHonorific(control, honorific) {
  if (control instanceof HTMLSelectElement) {
    const option = [...control.options].find((item) => {
      const text = `${item.text} ${item.value}`.toLowerCase();
      return text.includes(honorific.toLowerCase());
    });
    if (!option) return;
    control.value = option.value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (control.value.trim()) return;
  setValue(control, honorific);
}

function controlText(control) {
  const bits = [fieldHint(control), control.value || ""];
  const wrap = control.closest("label");
  if (wrap) bits.push(wrap.innerText);
  const sibling = control.nextElementSibling;
  if (sibling && (sibling.innerText || "").length < 80) bits.push(sibling.innerText);
  const parentText = control.parentElement?.innerText || "";
  if (parentText.length < 80) bits.push(parentText);
  return bits.join(" ");
}

function chooseOption(select, values) {
  const wanted = values.map((value) => String(value).toLowerCase());
  return [...select.options].find((option) => {
    const value = option.value.trim().toLowerCase();
    const text = option.text.trim().toLowerCase();
    return wanted.includes(value) || wanted.includes(text) || wanted.includes(String(Number(value)));
  });
}

function setControl(control, value) {
  if (control instanceof HTMLSelectElement) {
    const option = chooseOption(control, [value, String(Number(value))]);
    if (!option) return;
    control.value = option.value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (control.value.trim()) return;
  setValue(control, value);
}

function dateDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function fillMaskedDate(input, digits, formatted) {
  setValue(input, digits);
  if (dateDigits(input.value) !== digits) typeDateDigits(input, digits);
  if (dateDigits(input.value) === digits && !input.value.includes(".")) {
    setValue(input, formatted);
    if (dateDigits(input.value) !== digits) setValue(input, digits);
  }
}

function typeDateDigits(input, digits) {
  input.focus();
  setNativeValue(input, "");
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  for (const digit of digits) {
    const current = input.value;
    const slot = current.search(/[_\s]/);
    const next = slot === -1 ? `${current}${digit}` : `${current.slice(0, slot)}${digit}${current.slice(slot + 1)}`;
    setNativeValue(input, next);
    const caret = slot === -1 ? next.length : slot + 1;
    input.setSelectionRange?.(caret, caret);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: digit, inputType: "insertText" }));
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function birthHint(control) {
  return `${fieldHint(control)} ${control.getAttribute("title") || ""} ${control.getAttribute("pattern") || ""}`;
}

function fillBirth(scope, profile) {
  const day = profile.birthDay || "15";
  const month = profile.birthMonth || "03";
  const year = profile.birthYear || "1994";
  const values = {
    day,
    month,
    year,
    date: `${year}-${month}-${day}`,
    "date-de": `${day}.${month}.${year}`,
    "date-us": `${month}/${day}/${year}`,
  };
  for (const control of scope.querySelectorAll("input, select")) {
    if (!isVisible(control)) continue;
    const role = TrashmailForm.classifyBirthField({
      hint: birthHint(control),
      placeholder: control.getAttribute("placeholder") || "",
      autocomplete: control.getAttribute("autocomplete") || "",
      type: control.type || "",
    });
    if (!role) continue;
    if ((role === "date-de" || role === "date-us") && control instanceof HTMLInputElement && control.type !== "date") {
      if (control.value.trim()) continue;
      const formatted = values[role];
      fillMaskedDate(control, formatted.replace(/\D/g, ""), formatted);
      continue;
    }
    setControl(control, values[role]);
  }
}

function fillGender(scope) {
  const radios = [...scope.querySelectorAll('input[type="radio"]')].filter(isVisible);
  const choices = radios.map((radio) => ({ radio, text: controlText(radio).toLowerCase() }));
  const pick = choices.find((item) => /keine angabe|nicht angeben|divers|unspecified|prefer not/.test(item.text));
  if (!pick || pick.radio.checked) return;
  pick.radio.click();
  if (!pick.radio.checked) {
    pick.radio.checked = true;
    pick.radio.dispatchEvent(new Event("input", { bubbles: true }));
    pick.radio.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function fillTerms(scope) {
  for (const box of scope.querySelectorAll('input[type="checkbox"]')) {
    if (!isVisible(box) || box.checked) continue;
    const text = controlText(box);
    if (TrashmailForm.isMarketingLabel(text) || !TrashmailForm.isTermsLabel(text)) continue;
    box.click();
    if (!box.checked) {
      box.checked = true;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

function fillPasswords(passwords, sitePassword) {
  if (!sitePassword) return;
  for (const input of passwords) {
    if (!isVisible(input) || input.value.trim()) continue;
    if ((input.autocomplete || "").includes("current-password")) continue;
    setValue(input, sitePassword);
  }
}

function fillRegistration(found, profile) {
  found.emails?.forEach((input) => {
    if (!input.value.trim()) setValue(input, profile.address);
  });
  fillPasswords(found.passwords || [], profile.sitePassword);
  fillNames(found.scope, profile);
  fillBirth(found.scope, profile);
  fillGender(found.scope);
  fillTerms(found.scope);
}

function fillNames(scope, person) {
  if (!person?.givenName) return;
  for (const control of scope.querySelectorAll("input, select")) {
    if (!isVisible(control)) continue;
    const role = TrashmailForm.classifyNameField({
      hint: fieldHint(control),
      autocomplete: control.getAttribute("autocomplete") || "",
      tag: control.tagName.toLowerCase(),
    });
    if (!role) continue;
    if (role === "honorific") {
      fillHonorific(control, person.honorific || "Frau");
      continue;
    }
    if (!(control instanceof HTMLInputElement) || control.value.trim()) continue;
    if (role === "given") setValue(control, person.givenName);
    if (role === "family") setValue(control, person.familyName);
    if (role === "full") setValue(control, person.fullName || `${person.givenName} ${person.familyName}`);
  }
}

function setNativeValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor =
    Object.getOwnPropertyDescriptor(prototype, "value") ||
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const tracker = input._valueTracker;
  if (tracker) tracker.setValue("");
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
}

function setValue(input, value) {
  input.focus();
  setNativeValue(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function fieldLabel(input) {
  const label = input.labels?.[0]?.innerText?.replace(/\s+/g, " ").trim();
  return label || input.getAttribute("aria-label") || input.name || input.placeholder || "Feld";
}

function clickSubmit(form, button) {
  if (button) {
    button.click();
    return;
  }
  try {
    form?.requestSubmit();
  } catch {
    form?.submit();
  }
}

function submitForm(found, { force = false } = {}) {
  const button = findSubmit(found.email);
  const form = found.email.form;
  if (!button && !form) return { status: "missing" };
  if (form && !form.checkValidity()) {
    const invalid = form.querySelector(":invalid");
    form.reportValidity();
    return { status: "invalid", label: invalid ? fieldLabel(invalid) : "Feld" };
  }
  if (!force && hasCaptcha(found.email)) return { status: "captcha" };
  if (!button && !form) return { status: "missing" };
  if (!button && form) {
    clickSubmit(form, null);
    return { status: "submitted" };
  }
  if (!button) return { status: "missing" };
  clickSubmit(form, button);
  return { status: "submitted" };
}

async function ensureToast() {
  if (toast) return toast;
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const [tokens, cards] = await Promise.all([
    fetch(chrome.runtime.getURL("src/styles/tokens.css")).then((response) => response.text()),
    fetch(chrome.runtime.getURL("src/styles/cards.css")).then((response) => response.text()),
  ]);
  const style = document.createElement("style");
  style.textContent = `${tokens}\n${cards}`;
  const anchor = document.createElement("div");
  anchor.className = "tm-anchor";
  shadow.append(style, anchor);
  (document.documentElement || document.body).append(host);
  toast = { host, anchor, parts: null };
  return toast;
}

function renderCard({ icon, success = false, title, subtitle = "", progress = null, actions = [], pill = null }) {
  const anchor = toast.anchor;
  anchor.replaceChildren();
  const card = document.createElement("section");
  card.className = "tm-card";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const close = document.createElement("button");
  close.className = "tm-close";
  close.type = "button";
  close.setAttribute("aria-label", copy.close);
  close.innerHTML = ICONS.close;
  close.addEventListener("click", () => {
    onClose();
  });

  const head = document.createElement("div");
  head.className = "tm-head";
  const iconEl = document.createElement("div");
  iconEl.className = success ? "tm-icon tm-success" : "tm-icon";
  iconEl.innerHTML = icon;
  const text = document.createElement("div");
  const titleEl = document.createElement("h2");
  titleEl.className = "tm-title";
  titleEl.textContent = title;
  const subEl = document.createElement("p");
  subEl.className = "tm-subtitle";
  subEl.textContent = subtitle;
  subEl.hidden = !subtitle;
  text.append(titleEl, subEl);
  head.append(iconEl, text);
  card.append(close, head);

  let fillEl = null;
  let percentEl = null;
  if (progress != null) {
    const track = document.createElement("div");
    track.className = "tm-track";
    fillEl = document.createElement("span");
    fillEl.className = "tm-fill";
    fillEl.style.width = `${progress}%`;
    track.append(fillEl);
    percentEl = document.createElement("div");
    percentEl.className = "tm-percent";
    percentEl.textContent = `${progress}%`;
    card.append(track, percentEl);
  }

  if (actions.length) {
    const row = document.createElement("div");
    row.className = "tm-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.primary ? "tm-action tm-primary" : "tm-action";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      row.append(button);
    }
    card.append(row);
  }

  if (pill) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tm-pill";
    button.textContent = pill.label;
    button.addEventListener("click", pill.onClick);
    card.append(button);
  }

  anchor.append(card);
  toast.parts = { subEl, fillEl, percentEl };
}

function setProgress(percent, subtitle) {
  if (!toast) return;
  const parts = toast?.parts;
  if (!parts?.fillEl) {
    renderCard({
      icon: ICONS.bolt,
      title: copy.runningTitle,
      subtitle: subtitle || copy.runningSubtitle,
      progress: percent,
      actions: [{ label: copy.cancel, onClick: abortCreate }],
    });
    return;
  }
  parts.fillEl.style.width = `${percent}%`;
  parts.percentEl.textContent = `${percent}%`;
  if (subtitle) {
    parts.subEl.hidden = false;
    parts.subEl.textContent = subtitle;
  }
}

function hideToast({ block = false } = {}) {
  if (block) {
    blocked = true;
    clearInterval(followWatch);
    followWatch = 0;
    activeProfile = null;
  }
  clearInterval(passwordWatch);
  passwordWatch = 0;
  toast?.host.remove();
  toast = null;
  mode = "idle";
  current = null;
}

async function rememberDismiss() {
  blocked = true;
  try {
    await chrome.storage.session.set({ [dismissKey()]: true });
  } catch {
    // Ohne Session-Speicher gilt die Sperre nur für diese Seite.
  }
}

async function onClose() {
  if (mode === "running") {
    await abortCreate();
    return;
  }
  if (mode === "adapt") {
    hideToast({ block: true });
    return;
  }
  if (mode === "suggest") await rememberDismiss();
  hideToast({ block: true });
}

async function abortCreate() {
  await chrome.runtime.sendMessage({ type: "abort-create" });
  hideToast({ block: true });
}

async function focusInbox() {
  if (!mailboxId) return;
  if (inboxTabId) {
    const focused = await chrome.runtime.sendMessage({ type: "focus-tab", tabId: inboxTabId });
    if (focused?.ok) return;
  }
  const opened = await chrome.runtime.sendMessage({ type: "open-inbox", id: mailboxId, active: true });
  inboxTabId = opened?.tabId ?? null;
}

function showFinished({ title, subtitle, pillLabel = copy.inbox, onPill = null }) {
  if (!toast) return;
  mode = "done";
  renderCard({
    icon: ICONS.check,
    success: true,
    title,
    subtitle,
    pill: { label: pillLabel, onClick: onPill || focusInbox },
  });
  if (activeProfile) startFollow(activeProfile);
}

function forceSubmit() {
  if (!current) return;
  const result = submitForm(current, { force: true });
  if (result.status === "invalid") {
    showFinished({
      title: copy.invalidTitle,
      subtitle: `Feld prüfen: ${result.label}`,
      pillLabel: copy.sendNow,
      onPill: forceSubmit,
    });
    return;
  }
  if (result.status === "missing") {
    showFinished({
      title: copy.noSubmitTitle,
      subtitle: copy.noSubmitSubtitle,
    });
    return;
  }
  showFinished({
    title: copy.doneTitle,
    subtitle: current.email.value,
  });
}

function visibleControls() {
  return [...document.querySelectorAll("input, select, textarea")].filter((control) => isVisible(control));
}

function stopAdapt() {
  clearInterval(passwordWatch);
  passwordWatch = 0;
}

function setupPasswords(root) {
  return [...root.querySelectorAll('input[type="password"]')].filter((input) => {
    if (!isVisible(input) || input.value.trim()) return false;
    const box = input.closest("form, section, main");
    return TrashmailForm.looksLikePasswordSetup({
      hint: fieldHint(input),
      autocomplete: input.getAttribute("autocomplete") || "",
      context: (box?.innerText || "").slice(0, 800),
    });
  });
}

function codeFields(root) {
  return [...root.querySelectorAll("input")].filter(
    (input) =>
      isVisible(input) &&
      !input.value.trim() &&
      TrashmailForm.looksLikeCodeField({
        hint: fieldHint(input),
        autocomplete: input.getAttribute("autocomplete") || "",
      }),
  );
}

async function readMailCode(id) {
  const list = await chrome.runtime.sendMessage({ type: "list-messages", id });
  const newest = list?.messages?.[0];
  if (!list?.ok || !newest) return "";
  const introCode = TrashmailForm.extractMailCode(`${newest.subject || ""} ${newest.intro || ""}`);
  if (introCode) return introCode;
  const full = await chrome.runtime.sendMessage({ type: "get-message", id, messageId: newest.id });
  if (!full?.ok) return "";
  return TrashmailForm.extractMailCode(`${full.message?.subject || ""} ${full.message?.text || ""}`);
}

async function fillCodeFields(fields, id) {
  if (!fields.length || Date.now() - lastCodePoll < 4000) return false;
  lastCodePoll = Date.now();
  const code = await readMailCode(id);
  if (!code) return false;
  const slots = fields.filter((field) => field.maxLength === 1);
  if (slots.length > 1) slots.forEach((field, index) => setValue(field, code[index] || ""));
  else setValue(fields[0], code);
  return true;
}

function stopFollow() {
  clearInterval(followWatch);
  followWatch = 0;
}

function startFollow(profile) {
  activeProfile = profile;
  if (followWatch) return;
  followStartedAt = Date.now();
  followPasswordTries = 0;
  followWatch = setInterval(() => {
    followStep();
  }, 800);
}

async function followStep() {
  if (!activeProfile || !current) {
    stopFollow();
    return;
  }
  if (Date.now() - followStartedAt > 10 * 60 * 1000) {
    stopFollow();
    return;
  }
  const passwords = setupPasswords(document);
  const codes = codeFields(document);
  if (!passwords.length && !codes.length) return;
  const scope = passwords[0]?.form || codes[0]?.form || current.scope || document.body;
  current.scope = scope;
  current.kind = "signup";
  let acted = false;
  if (passwords.length && followPasswordTries < 4) {
    followPasswordTries += 1;
    current.passwords = passwords;
    fillPasswords(passwords, activeProfile.sitePassword);
    fillNames(scope, activeProfile);
    fillBirth(scope, activeProfile);
    acted = true;
  }
  if (codes.length && (await fillCodeFields(codes, activeProfile.id))) acted = true;
  if (!acted) return;
  mode = "running";
  setTimeout(() => reportSubmit(activeProfile.address), 200);
}

function hasNewRegistrationFields(controls) {
  return controls.some((control) => {
    if (control.type === "radio" || control.type === "checkbox") return true;
    if (control.type === "password") {
      return !control.value.trim() && !(control.autocomplete || "").includes("current-password");
    }
    if (!(control instanceof HTMLInputElement) || control.value.trim()) return false;
    const role = TrashmailForm.classifyNameField({
      hint: fieldHint(control),
      autocomplete: control.getAttribute("autocomplete") || "",
      tag: "input",
    });
    if (role === "given" || role === "family" || role === "full") return true;
    return Boolean(
      TrashmailForm.classifyBirthField({
        hint: birthHint(control),
        placeholder: control.getAttribute("placeholder") || "",
        autocomplete: control.getAttribute("autocomplete") || "",
        type: control.type || "",
      }),
    );
  });
}

function adaptToForm(profile, hadPasswordAtStart) {
  activeProfile = profile;
  if (current.kind === "login" && hadPasswordAtStart) {
    activeProfile = null;
    showFinished({
      title: copy.loginDoneTitle,
      subtitle: `${profile.address} — ${copy.loginDoneSubtitle}`,
    });
    return;
  }
  if ((current.passwords || []).some((input) => input.value.trim())) {
    setTimeout(() => reportSubmit(profile.address), 150);
    return;
  }

  const known = new Set(visibleControls());
  mode = "adapt";
  setProgress(80, copy.adapting);
  let advanced = false;
  const started = Date.now();
  const button = findSubmit(current.email);
  if (button && !button.disabled && TrashmailForm.isContinueLabel(buttonText(button))) {
    advanced = true;
    button.click();
  }
  stopAdapt();
  passwordWatch = setInterval(() => {
    if (mode !== "adapt" || !current) {
      stopAdapt();
      return;
    }
    const fresh = visibleControls().filter((control) => !known.has(control));
    fresh.forEach((control) => known.add(control));
    if (fresh.length && hasNewRegistrationFields(fresh)) {
      const scope = current.email?.form || current.scope || document.body;
      current.scope = scope;
      current.passwords = [...scope.querySelectorAll('input[type="password"]')].filter((input) => isVisible(input));
      current.kind = "signup";
      try {
        fillRegistration(current, profile);
      } catch {
        stopAdapt();
        showFinished({ title: copy.failedTitle, subtitle: copy.fillFailed });
        return;
      }
      stopAdapt();
      mode = "running";
      setTimeout(() => reportSubmit(profile.address), 200);
      return;
    }
    if (Date.now() - started > 12000) {
      stopAdapt();
      showFinished(
        current.kind === "login"
          ? {
              title: copy.loginDoneTitle,
              subtitle: `${profile.address} — ${copy.loginDoneSubtitle}`,
            }
          : { title: copy.doneTitle, subtitle: profile.address },
      );
    }
  }, 300);
}

async function finishCreate(response, { filling = false } = {}) {
  const opened = await chrome.runtime.sendMessage({ type: "open-inbox", id: mailboxId, active: false });
  inboxTabId = opened?.tabId ?? null;
  if (mode !== "running" || !current) return;

  const hadPasswordAtStart = (current.passwords || []).length > 0;
  try {
    if (!filling) setProgress(80, copy.filling);
    const scope = current.email?.form || current.scope || document.body;
    current.scope = scope;
    current.passwords = [...scope.querySelectorAll('input[type="password"]')].filter((input) => isVisible(input));
    if (current.kind === "login" && hadPasswordAtStart) setValue(current.email, response.address);
    else fillRegistration(current, response);
  } catch {
    showFinished({ title: copy.failedTitle, subtitle: copy.fillFailed });
    return;
  }

  adaptToForm(response, hadPasswordAtStart);
}

function reportSubmit(address) {
  if (!current || (mode !== "running" && mode !== "done")) return;
  const result = submitForm(current);
  if (result.status === "invalid") {
    showFinished({
      title: copy.invalidTitle,
      subtitle: `${address} — Feld prüfen: ${result.label}`,
      pillLabel: copy.sendNow,
      onPill: forceSubmit,
    });
    return;
  }
  if (result.status === "captcha") {
    showFinished({
      title: copy.captchaTitle,
      subtitle: `${address} — ${copy.captchaSubtitle}`,
      pillLabel: copy.sendNow,
      onPill: forceSubmit,
    });
    return;
  }
  if (result.status === "missing") {
    showFinished({
      title: copy.noSubmitTitle,
      subtitle: `${address}. ${copy.noSubmitSubtitle}`,
    });
    return;
  }
  showFinished({ title: copy.doneTitle, subtitle: address });
}

async function sessionProfile() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "session-profile" });
    return response?.ok ? response.profile : null;
  } catch {
    return null;
  }
}

async function startCreate() {
  if (!current || mode === "running") return;
  mode = "running";
  inboxTabId = null;
  try {
    await ensureToast();
  } catch {
    mode = "idle";
    return;
  }
  const profile = await sessionProfile();
  if (mode !== "running" || !current) return;
  if (profile?.address) {
    mailboxId = profile.id;
    renderCard({
      icon: ICONS.bolt,
      title: copy.filling,
      subtitle: profile.address,
      progress: 80,
      actions: [{ label: copy.cancel, onClick: abortCreate }],
    });
    await finishCreate(profile, { filling: true });
    return;
  }
  setProgress(8, copy.runningSubtitle);
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "create-mailbox",
      origin: location.origin,
      pageUrl: location.href,
    });
  } catch (error) {
    mode = "done";
    renderCard({
      icon: ICONS.mail,
      title: copy.failedTitle,
      subtitle: error.message || copy.failedTitle,
      actions: [{ label: copy.retry, primary: true, onClick: () => startCreate() }],
    });
    return;
  }
  if (mode !== "running") return;
  if (!response?.ok) {
    if (response?.aborted) {
      hideToast({ block: true });
      return;
    }
    mode = "done";
    renderCard({
      icon: ICONS.mail,
      title: copy.failedTitle,
      subtitle: response?.error || copy.failedTitle,
      actions: [{ label: copy.retry, primary: true, onClick: () => startCreate() }],
    });
    return;
  }
  mailboxId = response.id;
  await finishCreate(response);
}

async function showSuggest(found) {
  current = found;
  mode = "suggest";
  const profile = await sessionProfile();
  try {
    await ensureToast();
  } catch {
    mode = "idle";
    current = null;
    return;
  }
  const reused = Boolean(profile?.address);
  renderCard({
    icon: ICONS.mail,
    title: copy.suggestTitle,
    subtitle: reused ? `${copy.suggestSession} ${profile.address}` : found.kind === "login" ? copy.suggestLogin : copy.suggestSignup,
    actions: [
      {
        label: copy.later,
        onClick: () => {
          rememberDismiss().then(() => hideToast());
        },
      },
      { label: reused ? copy.use : copy.create, primary: true, onClick: () => startCreate() },
    ],
  });
}

async function isDismissed() {
  try {
    const data = await chrome.storage.session.get(dismissKey());
    return !!data[dismissKey()];
  } catch {
    return false;
  }
}

async function findContinuation() {
  const emails = [...document.querySelectorAll("input")].filter((input) => isEmailInput(input) && isVisible(input));
  const filled = emails.find((input) => input.value.trim());
  const passwords = [...document.querySelectorAll('input[type="password"]')].filter(isVisible);
  const anchor = filled || passwords[0];
  if (!anchor) return null;
  const scope = anchor.form || scopeOf(anchor);
  const scopePasswords = [...scope.querySelectorAll('input[type="password"]')].filter(isVisible);
  const emptyPassword = scopePasswords.some(
    (input) => !input.value.trim() && !(input.autocomplete || "").includes("current-password"),
  );
  const emptyName = [...scope.querySelectorAll("input")].some((input) => {
    if (!isVisible(input) || input.value.trim()) return false;
    const role = TrashmailForm.classifyNameField({
      hint: fieldHint(input),
      autocomplete: input.getAttribute("autocomplete") || "",
      tag: "input",
    });
    return role === "given" || role === "family" || role === "full";
  });
  if (!emptyPassword && !emptyName) return null;
  const kind = classify(scope, scopePasswords, filled || anchor);
  if (kind === "login" && !emptyName && scopePasswords.length < 2 && !scopePasswords.some((input) => {
    const box = input.closest("form, section, main");
    return TrashmailForm.looksLikePasswordSetup({
      hint: fieldHint(input),
      autocomplete: input.getAttribute("autocomplete") || "",
      context: (box?.innerText || "").slice(0, 800),
    });
  }) && !codeFields(scope).length) return null;
  const response = await chrome.runtime.sendMessage({
    type: "continuation-profile",
    address: filled?.value.trim() || "",
    origin: location.origin,
  });
  if (!response?.ok) return null;
  const address = filled?.value.trim() || "";
  if (address && address.toLowerCase() !== response.profile.address.toLowerCase()) return null;
  return {
    email: filled || anchor,
    scope,
    kind: "signup",
    passwords: scopePasswords,
    emails: emails.filter((input) => scope.contains(input)),
    profile: response.profile,
  };
}

async function continueRegistration(found) {
  blocked = true;
  current = found;
  activeProfile = found.profile;
  mode = "running";
  mailboxId = found.profile.id;
  try {
    await ensureToast();
    setProgress(80, copy.filling);
    fillRegistration(found, found.profile);
  } catch {
    showFinished({ title: copy.failedTitle, subtitle: copy.fillFailed });
    return;
  }
  const opened = await chrome.runtime.sendMessage({ type: "open-inbox", id: mailboxId, active: false });
  inboxTabId = opened?.tabId ?? null;
  await new Promise((resolve) => setTimeout(resolve, 150));
  reportSubmit(found.profile.address);
}

async function scan() {
  if (blocked || mode !== "idle" || scanLock) return;
  if (location.protocol === "chrome-extension:" || location.protocol === "moz-extension:") return;
  scanLock = true;
  try {
    const dismissed = await isDismissed();
    if (!dismissed) {
      const found = findCandidate();
      if (found) {
        await showSuggest(found);
        return;
      }
    }
    const continuation = await findContinuation();
    if (continuation) await continueRegistration(continuation);
  } finally {
    scanLock = false;
  }
}

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 350);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "mailbox-progress" && mode === "running") {
    setProgress(message.percent, message.label);
  }
});

if (document.documentElement) {
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScan);
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && mode !== "idle") onClose();
    },
    true,
  );
  scheduleScan();
}
