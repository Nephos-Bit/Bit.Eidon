import { providerInfo } from "../lib/mail-client.js";
import { usedAt } from "../lib/identity.js";
import { mountLock } from "../lock/lock-form.js";

const LOGO_URL = new URL("../../icons/eidon.png", import.meta.url).href;

const app = document.querySelector("#app");
let query = "";
let notice = "";

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function hostOf(origin) {
  try {
    return new URL(origin).host.replace(/^www\./, "");
  } catch {
    return origin || "";
  }
}

function personName(item) {
  return [item.givenName, item.familyName].filter(Boolean).join(" ");
}

function lifetimeBit(item) {
  if (!item.expiresAt) return "";
  return item.expiresAt <= Date.now() ? "abgelaufen" : "läuft ab";
}

function metaLine(item) {
  return [personName(item), hostOf(item.origin), formatTime(usedAt(item)), lifetimeBit(item)].filter(Boolean).join(" · ");
}

function creditLine() {
  const credit = document.createElement("p");
  credit.className = "credit";
  const info = providerInfo("https://api.mail.tm");
  const link = document.createElement("a");
  link.href = info.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = info.name;
  credit.append("Adressen über ", link);
  return credit;
}

async function copyText(value, button) {
  await navigator.clipboard.writeText(value);
  const previous = button.textContent;
  button.textContent = "Kopiert";
  window.setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

async function openInbox(id) {
  const response = await chrome.runtime.sendMessage({ type: "open-inbox", id, active: true }).catch(() => null);
  if (response?.locked) showLock();
}

function actionButton(label, primary, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "tm-action tm-primary" : "tm-action";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function textButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-btn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function deleteMailbox(id, remote) {
  const sure = window.confirm(
    remote
      ? "Das Postfach wird beim Anbieter gelöscht, soweit er erreichbar ist. Der Eintrag in Eidon wird entfernt. Das Konto auf der Website bleibt bestehen."
      : "Nur der Eintrag in Eidon wird gelöscht. Das Postfach-Passwort ist danach weg, das Postfach beim Anbieter lässt sich nicht mehr löschen. Das Konto auf der Website bleibt bestehen.",
  );
  if (!sure) return;
  const response = await chrome.runtime.sendMessage({ type: "delete-mailbox", id, remote }).catch(() => null);
  if (response?.locked) {
    showLock();
    return;
  }
  await showMailboxes();
}

async function renameMailbox(item) {
  const givenName = window.prompt("Vorname", item.givenName || "");
  if (givenName == null) return;
  const familyName = window.prompt("Nachname", item.familyName || "");
  if (familyName == null) return;
  const response = await chrome.runtime.sendMessage({
    type: "rename-mailbox",
    id: item.id,
    givenName,
    familyName,
  }).catch(() => null);
  if (response?.locked) {
    showLock();
    return;
  }
  if (!response?.ok) {
    notice = response?.error || "Der Name konnte nicht gespeichert werden.";
    await showMailboxes();
    return;
  }
  notice = "";
  await showMailboxes();
}

function visibleMailboxes(mailboxes) {
  const needle = query.trim().toLowerCase();
  const sorted = [...mailboxes].sort((left, right) => usedAt(right) - usedAt(left));
  if (!needle) return sorted;
  return sorted.filter((item) => {
    const host = hostOf(item.origin).toLowerCase();
    return item.address.toLowerCase().includes(needle) || host.includes(needle);
  });
}

function deleteActions(item) {
  const row = document.createElement("div");
  row.className = "ops";
  row.append(
    textButton("Name", () => renameMailbox(item)),
    textButton("Lokal löschen", () => deleteMailbox(item.id, false)),
    textButton("Postfach löschen", () => deleteMailbox(item.id, true)),
  );
  return row;
}

function backupRow() {
  const row = document.createElement("div");
  row.className = "tools";
  row.append(
    textButton("Sicherung exportieren", exportBackup),
    textButton("Sicherung importieren", importBackup),
  );
  return row;
}

function noticeLine() {
  if (!notice) return null;
  const line = document.createElement("p");
  line.className = "empty";
  line.textContent = notice;
  return line;
}

async function exportBackup() {
  const response = await chrome.runtime.sendMessage({ type: "export-backup" }).catch(() => null);
  if (response?.locked) {
    showLock();
    return;
  }
  if (!response?.ok || !response.backup) {
    notice = response?.error || "Die Sicherung konnte nicht erstellt werden.";
    await showMailboxes();
    return;
  }
  const blob = new Blob([JSON.stringify(response.backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "eidon-sicherung.json";
  link.click();
  URL.revokeObjectURL(url);
  notice = "";
}

function importBackup() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      notice = "Die Datei ist keine Eidon-Sicherung.";
      await showMailboxes();
      return;
    }
    const passphrase = window.prompt("Passphrase der Sicherung");
    if (!passphrase) return;
    const response = await chrome.runtime.sendMessage({ type: "import-backup", backup, passphrase }).catch(() => null);
    if (response?.locked) {
      showLock();
      return;
    }
    if (!response?.ok) {
      notice = response?.error || "Die Sicherung konnte nicht gelesen werden.";
      await showMailboxes();
      return;
    }
    const dropped = response.dropped ? ` ${response.dropped} ältere Einträge entfernt, weil höchstens 50 gespeichert werden.` : "";
    notice = response.added ? `${response.added} Einträge ergänzt.${dropped}` : `Nichts Neues.${dropped}`;
    await showMailboxes();
  });
  input.click();
}

function render(mailboxes) {
  const focusFilter = document.activeElement?.classList.contains("filter");
  const selectionStart = focusFilter ? document.activeElement.selectionStart : null;
  app.replaceChildren();
  const noted = noticeLine();
  if (noted) app.append(noted);

  if (mailboxes.length) {
    const filter = document.createElement("input");
    filter.className = "filter";
    filter.type = "search";
    filter.placeholder = "Adresse oder Website";
    filter.value = query;
    filter.addEventListener("input", () => {
      query = filter.value;
      paintList(mailboxes);
    });
    app.append(filter);
  }

  const list = document.createElement("div");
  list.className = "list";
  app.append(list);
  paintList(mailboxes);
  app.append(backupRow(), creditLine());
  if (focusFilter) {
    const field = app.querySelector(".filter");
    field?.focus();
    if (selectionStart != null && field?.setSelectionRange) field.setSelectionRange(selectionStart, selectionStart);
  }
}

function paintList(mailboxes) {
  const list = app.querySelector(".list");
  if (!list) return;
  list.replaceChildren();
  const visible = visibleMailboxes(mailboxes);
  if (!mailboxes.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Noch keine Adresse. Auf einer Registrierung erscheint der Vorschlag.";
    list.append(empty);
    return;
  }
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Kein Treffer.";
    list.append(empty);
    return;
  }

  const [latest, ...older] = visible;
  const anchor = document.createElement("div");
  anchor.className = "tm-anchor";
  const card = document.createElement("section");
  card.className = "tm-card";
  const head = document.createElement("div");
  head.className = "tm-head";
  const icon = document.createElement("img");
  icon.className = "tm-logo";
  icon.src = LOGO_URL;
  icon.alt = "";
  const text = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "tm-title";
  title.textContent = latest.address;
  const subtitle = document.createElement("p");
  subtitle.className = "tm-subtitle";
  subtitle.textContent = metaLine(latest);
  text.append(title, subtitle);
  head.append(icon, text);
  const actions = document.createElement("div");
  actions.className = "tm-actions";
  actions.append(actionButton("Adresse kopieren", false, (event) => copyText(latest.address, event.currentTarget)));
  if (latest.sitePassword) {
    actions.append(actionButton("Passwort kopieren", true, (event) => copyText(latest.sitePassword, event.currentTarget)));
  }
  actions.append(actionButton("Name", false, () => renameMailbox(latest)));
  actions.append(actionButton("Lokal löschen", false, () => deleteMailbox(latest.id, false)));
  actions.append(actionButton("Postfach löschen", false, () => deleteMailbox(latest.id, true)));
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "tm-pill";
  pill.textContent = "Posteingang";
  pill.addEventListener("click", () => openInbox(latest.id));
  card.append(head, actions, pill);
  anchor.append(card);
  list.append(anchor);

  if (older.length) {
    const history = document.createElement("ul");
    history.className = "history";
    for (const item of older) {
      const entry = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const addr = document.createElement("span");
      addr.className = "addr";
      addr.textContent = item.address;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = metaLine(item);
      button.append(addr, meta);
      button.addEventListener("click", () => openInbox(item.id));
      entry.append(button, deleteActions(item));
      history.append(entry);
    }
    list.append(history);
  }
}

function showLock() {
  mountLock(app, { onUnlocked: () => showMailboxes() });
}

async function showMailboxes() {
  const response = await chrome.runtime.sendMessage({ type: "list-mailboxes" }).catch(() => null);
  if (!response?.ok) {
    showLock();
    return;
  }
  render(response.mailboxes || []);
}

const status = await chrome.runtime.sendMessage({ type: "lock-status" }).catch(() => null);
if (!status?.unlocked) showLock();
else await showMailboxes();
