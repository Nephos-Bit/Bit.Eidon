import { createMailbox, fetchMessage, fetchMessages, isMailboxExpired, login, mailboxExpiresAt } from "../lib/mail-client.js";
import { generatePassword, generatePerson } from "../lib/password.js";
import { getMailbox, listMailboxes, saveMailbox, updateMailbox } from "../lib/storage.js";

const jobs = new Map();

function jobKey(sender) {
  return `${sender.tab?.id ?? "x"}:${sender.frameId ?? 0}`;
}

function notify(sender, payload) {
  if (!sender.tab?.id) return;
  chrome.tabs.sendMessage(sender.tab.id, payload, { frameId: sender.frameId }).catch(() => {});
}

async function setBadge(count) {
  const text = count > 0 ? String(Math.min(count, 99)) : "";
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#0A84FF" });
}

async function withToken(mailbox, run) {
  try {
    return await run(mailbox.token);
  } catch (error) {
    if (error.status !== 401) throw error;
    const token = await login(mailbox.provider, mailbox.address, mailbox.mailboxPassword);
    const updated = await updateMailbox(mailbox.id, { token });
    return run(updated.token);
  }
}

function mapMessage(message) {
  return {
    id: message.id,
    subject: message.subject || "(Ohne Betreff)",
    intro: message.intro || "",
    seen: !!message.seen,
    createdAt: message.createdAt,
    fromName: message.from?.name || "",
    fromAddress: message.from?.address || "",
    hasAttachments: !!message.hasAttachments,
  };
}

function publicMailbox(item) {
  return {
    id: item.id,
    address: item.address,
    sitePassword: item.sitePassword,
    origin: item.origin,
    createdAt: item.createdAt,
    provider: item.provider || "",
    expiresAt: mailboxExpiresAt(item),
  };
}

function mailboxView(mailbox) {
  return {
    id: mailbox.id,
    address: mailbox.address,
    sitePassword: mailbox.sitePassword,
    givenName: mailbox.givenName || "",
    familyName: mailbox.familyName || "",
    honorific: mailbox.honorific || "",
    origin: mailbox.origin,
    provider: mailbox.provider || "",
    expiresAt: mailboxExpiresAt(mailbox),
  };
}

async function handleCreate(message, sender) {
  const key = jobKey(sender);
  jobs.get(key)?.abort();
  const controller = new AbortController();
  jobs.set(key, controller);
  try {
    const created = await createMailbox(controller.signal, (percent, label) => {
      notify(sender, { type: "mailbox-progress", percent, label });
    });
    const person = generatePerson();
    const record = {
      ...created,
      sitePassword: generatePassword(16),
      givenName: person.givenName,
      familyName: person.familyName,
      honorific: person.honorific,
      birthDay: person.birthDay,
      birthMonth: person.birthMonth,
      birthYear: person.birthYear,
      origin: message.origin || "",
      pageUrl: message.pageUrl || "",
      createdAt: Date.now(),
    };
    await saveMailbox(record);
    return {
      ok: true,
      id: record.id,
      address: record.address,
      sitePassword: record.sitePassword,
      givenName: person.givenName,
      familyName: person.familyName,
      fullName: person.fullName,
      honorific: person.honorific,
    };
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: error.message || "Die Trashmail konnte nicht angelegt werden." };
  } finally {
    if (jobs.get(key) === controller) jobs.delete(key);
  }
}

async function handleAbort(_message, sender) {
  jobs.get(jobKey(sender))?.abort();
  return { ok: true };
}

async function handleOpenInbox(message) {
  const url = chrome.runtime.getURL(`src/inbox/inbox.html?id=${encodeURIComponent(message.id || "")}`);
  const tab = await chrome.tabs.create({ url, active: !!message.active });
  return { ok: true, tabId: tab.id };
}

async function handleFocusTab(message) {
  if (!message.tabId) return { ok: false };
  try {
    await chrome.tabs.update(message.tabId, { active: true });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function handleListMessages(message) {
  const mailbox = await getMailbox(message.id);
  if (!mailbox) return { ok: false, error: "Keine Mailbox" };
  const view = mailboxView(mailbox);
  if (isMailboxExpired(mailbox)) return { ok: true, ...view, expired: true, messages: [] };
  const data = await withToken(mailbox, (token) => fetchMessages(mailbox.provider, token));
  const messages = data.map(mapMessage);
  await setBadge(messages.filter((item) => !item.seen).length);
  return { ok: true, ...view, expired: false, messages };
}

async function handleGetMessage(message) {
  const mailbox = await getMailbox(message.id);
  if (!mailbox) return { ok: false, error: "Keine Mailbox" };
  const full = await withToken(mailbox, (token) => fetchMessage(mailbox.provider, token, message.messageId));
  return {
    ok: true,
    message: {
      id: full.id,
      subject: full.subject || "(Ohne Betreff)",
      intro: full.intro || "",
      text: full.text || "",
      html: full.html || "",
      createdAt: full.createdAt,
      fromName: full.from?.name || "",
      fromAddress: full.from?.address || "",
      hasAttachments: !!full.hasAttachments,
    },
  };
}

function profileFrom(item) {
  const givenName = item.givenName || "";
  const familyName = item.familyName || "";
  return {
    id: item.id,
    address: item.address,
    sitePassword: item.sitePassword,
    givenName,
    familyName,
    fullName: [givenName, familyName].filter(Boolean).join(" "),
    honorific: item.honorific || "Frau",
    birthDay: item.birthDay || "15",
    birthMonth: item.birthMonth || "03",
    birthYear: item.birthYear || "1994",
  };
}

function sameSite(left, right) {
  try {
    const host = (value) => new URL(value).hostname.replace(/^www\./, "");
    const a = host(left);
    const b = host(right);
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  } catch {
    return false;
  }
}

async function handleContinuation(message) {
  const mailboxes = await listMailboxes();
  const address = String(message.address || "").trim().toLowerCase();
  const byAddress = address ? mailboxes.find((item) => item.address.toLowerCase() === address) : null;
  if (byAddress) {
    if (isMailboxExpired(byAddress)) return { ok: false };
    return { ok: true, profile: profileFrom(byAddress) };
  }
  const recent = Date.now() - 6 * 60 * 60 * 1000;
  const bySite = mailboxes.find(
    (item) => item.createdAt > recent && !isMailboxExpired(item) && sameSite(item.origin, message.origin),
  );
  if (!bySite) return { ok: false };
  return { ok: true, profile: profileFrom(bySite) };
}

async function handleListMailboxes() {
  const mailboxes = await listMailboxes();
  return { ok: true, mailboxes: mailboxes.map(publicMailbox) };
}

async function refreshBadge() {
  const mailbox = await getMailbox();
  if (!mailbox || isMailboxExpired(mailbox)) {
    await setBadge(0);
    return;
  }
  try {
    const data = await withToken(mailbox, (token) => fetchMessages(mailbox.provider, token));
    const unread = data.filter((item) => !item.seen).length;
    await setBadge(unread);
  } catch {
    // Der Badge bleibt stehen, wenn der Dienst kurz nicht antwortet.
  }
}

function ensureAlarm() {
  chrome.alarms.create("refresh-badge", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh-badge") refreshBadge();
});

const handlers = {
  "create-mailbox": handleCreate,
  "abort-create": handleAbort,
  "open-inbox": handleOpenInbox,
  "focus-tab": handleFocusTab,
  "list-messages": handleListMessages,
  "get-message": handleGetMessage,
  "list-mailboxes": handleListMailboxes,
  "continuation-profile": handleContinuation,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || "Unbekannter Fehler" }));
  return true;
});
