import { providerInfo } from "../lib/mail-client.js";

const LOGO_URL = new URL("../../icons/eidon.png", import.meta.url).href;

const app = document.querySelector("#app");

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
    return new URL(origin).host;
  } catch {
    return origin || "";
  }
}

function lifetimeBit(item) {
  if (!item.expiresAt) return "";
  return item.expiresAt <= Date.now() ? "abgelaufen" : "läuft ab";
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

function openInbox(id) {
  chrome.runtime.sendMessage({ type: "open-inbox", id, active: true });
}

function actionButton(label, primary, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "tm-action tm-primary" : "tm-action";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function render(mailboxes) {
  app.replaceChildren();
  if (!mailboxes.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Noch keine Trashmail. Auf einer Registrierung erscheint der Vorschlag im Formular.";
    app.append(empty, creditLine());
    return;
  }

  const [latest, ...older] = mailboxes;
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
  const bits = [hostOf(latest.origin), formatTime(latest.createdAt), lifetimeBit(latest)].filter(Boolean);
  subtitle.textContent = bits.join(" · ");
  text.append(title, subtitle);
  head.append(icon, text);
  const actions = document.createElement("div");
  actions.className = "tm-actions";
  actions.append(actionButton("Adresse kopieren", false, (event) => copyText(latest.address, event.currentTarget)));
  if (latest.sitePassword) {
    actions.append(actionButton("Passwort kopieren", true, (event) => copyText(latest.sitePassword, event.currentTarget)));
  }
  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "tm-pill";
  pill.textContent = "Posteingang";
  pill.addEventListener("click", () => openInbox(latest.id));
  card.append(head, actions, pill);
  anchor.append(card);
  app.append(anchor);

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
      meta.textContent = [hostOf(item.origin), formatTime(item.createdAt), lifetimeBit(item)].filter(Boolean).join(" · ");
      button.append(addr, meta);
      button.addEventListener("click", () => openInbox(item.id));
      entry.append(button);
      history.append(entry);
    }
    app.append(history);
  }
  app.append(creditLine());
}

const response = await chrome.runtime.sendMessage({ type: "list-mailboxes" }).catch(() => null);
render(response?.mailboxes || []);
