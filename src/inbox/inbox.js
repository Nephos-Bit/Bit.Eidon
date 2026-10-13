import { providerInfo } from "../lib/mail-client.js";
import { extractLinks, messageBody, srcdoc } from "../lib/sanitize.js";

const LOGO_URL = new URL("../../icons/eidon.png", import.meta.url).href;

const LINK_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07.07l1.77-1.77a5 5 0 0 0-7.07-7.07L10.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.07-.07L5.16 12.7a5 5 0 0 0 7.07 7.07L13.5 18.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const MAIL_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 7.5 12 13l8-5.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

let linkMenuAbort = null;

const params = new URLSearchParams(location.search);
let mailboxId = params.get("id") || "";
const account = document.querySelector("#account");
const list = document.querySelector("#list");
const reading = document.querySelector("#reading");
const credits = document.querySelector("#credits");

let selectedId = "";
let bodyLoadedFor = "";
let expired = false;
let pollTimer = 0;

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatListTime(value) {
  const date = asDate(value);
  if (!date) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("de-DE", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit" }).format(date);
}

function formatFullTime(value) {
  const date = asDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fromLine(message) {
  if (message.fromName && message.fromAddress) return `${message.fromName}`;
  return message.fromAddress || message.fromName || "Unbekannt";
}

function symbol(name) {
  const glyph = document.createElement("span");
  glyph.className = "ms";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = name;
  return glyph;
}

function iconButton(label, name, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(symbol(name));
  button.addEventListener("click", () => onClick(button));
  return button;
}

async function copyText(value, button) {
  await navigator.clipboard.writeText(value);
  const glyph = button.querySelector(".ms");
  const previous = glyph.textContent;
  const previousLabel = button.getAttribute("aria-label");
  glyph.textContent = "check";
  button.classList.add("is-copied");
  button.title = "Kopiert";
  button.setAttribute("aria-label", "Kopiert");
  window.setTimeout(() => {
    glyph.textContent = previous;
    button.classList.remove("is-copied");
    button.title = previousLabel;
    button.setAttribute("aria-label", previousLabel);
  }, 1200);
}

function copyButton(label, value) {
  return iconButton(label, "content_copy", (button) => copyText(value, button));
}

function remainingText(expiresAt) {
  const left = expiresAt - Date.now();
  if (left <= 0) return "Abgelaufen.";
  const minutes = Math.max(1, Math.ceil(left / 60000));
  return minutes === 1 ? "Läuft in 1 Minute ab." : `Läuft in ${minutes} Minuten ab.`;
}

function linkLabel(link) {
  const text = (link.text || "").replace(/\s+/g, " ").trim();
  const raw = !text || text === link.href || /^https?:\/\//i.test(text);
  if (!raw) return text;
  try {
    return new URL(link.href).host.replace(/^www\./, "");
  } catch {
    return text || link.href;
  }
}

function linkMenu(links) {
  linkMenuAbort?.abort();
  linkMenuAbort = new AbortController();
  const signal = linkMenuAbort.signal;
  const wrap = document.createElement("div");
  wrap.className = "header-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "header-icon";
  button.title = "Weiterleitungen";
  button.setAttribute("aria-label", "Weiterleitungen");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML = LINK_ICON;
  const pop = document.createElement("div");
  pop.className = "link-pop";
  pop.hidden = true;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Weiterleitungen");
  const heading = document.createElement("p");
  heading.className = "link-pop-title";
  heading.textContent = "Weiterleitungen";
  const menu = document.createElement("div");
  menu.className = "link-pop-list";
  for (const link of links) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "link-pop-item";
    const name = document.createElement("span");
    name.className = "link-pop-name";
    name.textContent = linkLabel(link);
    const url = document.createElement("span");
    url.className = "link-pop-url";
    url.textContent = link.href;
    item.append(name, url);
    item.addEventListener("click", () => {
      window.open(link.href, "_blank", "noopener");
      close();
    });
    menu.append(item);
  }
  pop.append(heading, menu);

  function close() {
    pop.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = pop.hidden;
    pop.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener(
    "click",
    (event) => {
      if (!pop.hidden && !wrap.contains(event.target)) close();
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") close();
    },
    { signal },
  );
  wrap.append(button, pop);
  return wrap;
}

function providerLink(base) {
  const info = providerInfo(base);
  const link = document.createElement("a");
  link.href = info.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = info.name;
  return link;
}

function labelLine(text, action) {
  const line = document.createElement("div");
  line.className = "label-line";
  const title = document.createElement("span");
  title.textContent = text;
  line.append(title);
  if (action) line.append(action);
  return line;
}

function fact(label, value, action) {
  const row = document.createElement("div");
  row.className = "fact";
  const term = document.createElement("dt");
  term.append(labelLine(label, action));
  const detail = document.createElement("dd");
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function symbolCredit() {
  const credit = document.createElement("p");
  credit.className = "credit";
  const symbols = document.createElement("a");
  symbols.href = "https://fonts.google.com/icons";
  symbols.target = "_blank";
  symbols.rel = "noopener noreferrer";
  symbols.textContent = "Material Symbols";
  const license = document.createElement("a");
  license.href = chrome.runtime.getURL("src/fonts/LICENSE.txt");
  license.target = "_blank";
  license.rel = "noopener noreferrer";
  license.textContent = "Apache-Lizenz 2.0";
  credit.append("Symbole: ", symbols, " von Google, ", license);
  return credit;
}

function renderAccount(data) {
  account.replaceChildren();
  document.title = data.address ? `${data.address} · Posteingang` : "Posteingang";
  const identity = document.createElement("div");
  identity.className = "identity";
  const mark = document.createElement("img");
  mark.className = "mark";
  mark.src = LOGO_URL;
  mark.alt = "";
  const brand = document.createElement("p");
  brand.className = "brand";
  brand.textContent = "EIDON";
  identity.append(mark, brand);
  const name = [data.givenName, data.familyName].filter(Boolean).join(" ");
  const facts = document.createElement("dl");
  facts.className = "facts";
  if (name) facts.append(fact("Name", name, copyButton("Name kopieren", name)));
  if (data.address) facts.append(fact("Mail", data.address, copyButton("Mail kopieren", data.address)));
  if (data.sitePassword) facts.append(fact("Passwort", data.sitePassword, copyButton("Passwort kopieren", data.sitePassword)));
  account.append(identity);
  if (facts.childElementCount) account.append(facts);
  const info = providerInfo(data.provider);
  const days = Math.round(info.messageRetentionMs / 86400000);
  const retention = document.createElement("p");
  retention.className = "retention";
  retention.textContent = data.expiresAt ? remainingText(data.expiresAt) : `Nachrichten bleiben ${days} Tage gespeichert.`;
  const credit = document.createElement("p");
  credit.className = "credit";
  credit.append("Postfach über ", providerLink(data.provider));
  const sources = document.createElement("div");
  sources.className = "credits";
  sources.append(credit, symbolCredit());
  credits.replaceChildren(retention, sources);
}

function listHeading(messages) {
  const count = messages.length;
  if (!count) return "Nachrichten";
  const total = count === 1 ? "1 Nachricht" : `${count} Nachrichten`;
  const unread = messages.filter((message) => !message.seen).length;
  if (!unread) return total;
  const unreadLabel = unread === 1 ? "1 Ungelesen" : `${unread} Ungelesen`;
  return `${total} · ${unreadLabel}`;
}

function listHeader(text) {
  const head = document.createElement("div");
  head.className = "list-head";
  head.append(
    labelLine(text, iconButton("Aktualisieren", "refresh", () => tick(true))),
  );
  return head;
}

function renderList(messages) {
  list.replaceChildren();
  list.append(listHeader(listHeading(messages)));
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "Noch keine Nachricht.";
    list.append(empty);
    return;
  }
  for (const message of messages) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row";
    button.dataset.id = message.id;
    if (!message.seen) button.classList.add("unread");
    if (message.id === selectedId) {
      button.classList.add("selected");
      button.setAttribute("aria-current", "true");
    }
    const top = document.createElement("div");
    top.className = "row-top";
    const fromWrap = document.createElement("span");
    fromWrap.className = "from-wrap";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    const from = document.createElement("span");
    from.className = "from";
    from.textContent = fromLine(message);
    fromWrap.append(dot, from);
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = formatListTime(message.createdAt);
    top.append(fromWrap, time);
    const subject = document.createElement("div");
    subject.className = "subject";
    subject.textContent = message.subject;
    const intro = document.createElement("p");
    intro.className = "intro";
    intro.textContent = message.intro;
    button.append(top, subject, intro);
    button.addEventListener("click", () => openMessage(message.id));
    list.append(button);
  }
}

function emptyState(title, copy) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  const mark = document.createElement("div");
  mark.className = "empty-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.innerHTML = MAIL_ICON;
  const heading = document.createElement("p");
  heading.className = "empty-title";
  heading.textContent = title;
  wrap.append(mark, heading);
  if (copy) {
    const text = document.createElement("p");
    text.className = "empty-copy";
    text.textContent = copy;
    wrap.append(text);
  }
  return wrap;
}

function showStatus(title, copy) {
  reading.replaceChildren(emptyState(title, copy));
}

function markSelected() {
  for (const row of list.querySelectorAll(".row")) {
    const selected = row.dataset.id === selectedId;
    row.classList.toggle("selected", selected);
    if (selected) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
  }
}

async function openMessage(id) {
  if (selectedId !== id) bodyLoadedFor = "";
  selectedId = id;
  markSelected();
  const data = await chrome.runtime.sendMessage({
    type: "get-message",
    id: mailboxId,
    messageId: id,
  });
  if (selectedId !== id) return;
  if (!data?.ok) {
    showStatus("Nicht geladen", data?.error || "Nachricht konnte nicht geladen werden.");
    return;
  }
  const message = data.message;
  const html = messageBody(message);
  const links = extractLinks(html);
  reading.replaceChildren();
  const head = document.createElement("header");
  head.className = "reading-head";
  const titleRow = document.createElement("div");
  titleRow.className = "reading-top";
  const title = document.createElement("h1");
  title.textContent = message.subject;
  titleRow.append(title);
  if (links.length) titleRow.append(linkMenu(links));
  const meta = document.createElement("p");
  meta.className = "reading-meta";
  const sender = document.createElement("span");
  sender.className = "reading-from";
  sender.textContent = fromLine(message);
  meta.append(sender);
  if (message.fromName && message.fromAddress) {
    const address = document.createElement("span");
    address.className = "reading-addr";
    address.textContent = message.fromAddress;
    meta.append(address);
  }
  const time = document.createElement("span");
  time.className = "reading-time";
  time.textContent = formatFullTime(message.createdAt);
  meta.append(time);
  head.append(titleRow, meta);
  reading.append(head);
  if (message.hasAttachments) {
    const note = document.createElement("p");
    note.className = "notice";
    note.textContent = "Diese Nachricht hat Anhänge. Angezeigt wird der Nachrichtentext.";
    reading.append(note);
  }
  const pane = document.createElement("div");
  pane.className = "pane";
  const frame = document.createElement("iframe");
  frame.className = "frame";
  frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
  frame.referrerPolicy = "no-referrer";
  frame.srcdoc = srcdoc(html);
  pane.append(frame);
  reading.append(pane);
  bodyLoadedFor = id;
}

async function refreshMessages(forceBody) {
  const data = await chrome.runtime.sendMessage({ type: "list-messages", id: mailboxId });
  if (!data?.ok) {
    showStatus("Nicht erreichbar", data?.error || "Posteingang nicht erreichbar.");
    return;
  }
  if (data.id) mailboxId = data.id;
  renderAccount(data);
  if (data.expired) {
    expired = true;
    stopPolling();
    list.replaceChildren();
    const note = document.createElement("p");
    note.className = "list-empty";
    note.textContent = "Keine Nachrichten mehr verfügbar.";
    list.append(listHeader("Nachrichten"), note);
    const info = providerInfo(data.provider);
    const minutes = Math.round(info.accountTtlMs / 60000);
    showStatus("Postfach abgelaufen", `${info.name} löscht Adresse und Nachrichten nach ${minutes} Minuten.`);
    return;
  }
  renderList(data.messages);
  if (!data.messages.length) {
    if (!selectedId) showStatus("Noch keine Nachricht", "Diese Ansicht prüft alle 8 Sekunden erneut.");
    return;
  }
  const nextId = data.messages.some((item) => item.id === selectedId) ? selectedId : data.messages[0].id;
  if (forceBody || nextId !== bodyLoadedFor) await openMessage(nextId);
  else renderList(data.messages);
}

async function tick(force) {
  try {
    await refreshMessages(force);
  } catch (error) {
    showStatus("Nicht erreichbar", error.message || "Posteingang nicht erreichbar.");
  }
}

function stopPolling() {
  if (!pollTimer) return;
  window.clearInterval(pollTimer);
  pollTimer = 0;
}

function startPolling() {
  if (pollTimer || expired) return;
  pollTimer = window.setInterval(() => {
    if (!document.hidden && !expired) tick(false);
  }, 8000);
}

await tick(false);
startPolling();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !expired) tick(false);
});
