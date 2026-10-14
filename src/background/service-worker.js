import { createMailbox, deleteAccount, fetchMessage, fetchMessages, isMailboxExpired, login, mailboxExpiresAt } from "../lib/mail-client.js";
import { extractMailCode } from "../lib/mail-code.js";
import { iconPages, pageOrigin, sameSite } from "../lib/host.js";
import { identityKind, usedAt } from "../lib/identity.js";
import { generatePassword, generatePerson } from "../lib/password.js";
import { exportBackup, hasLock, importBackup, isUnlocked, openRecord, resetLock, sealRecord, setPassphrase, unlock } from "../lib/secrets.js";
import { getMailbox, listMailboxes, removeMailbox, saveMailbox, updateMailbox } from "../lib/storage.js";

const jobs = new Map();
const inboxTabs = new Map();
const SESSION_MAILBOX = "sessionMailboxId";
const TOKEN_KEY = "mailboxTokens";
const CONTENT_TYPES = new Set([
  "preview-profile",
  "create-mailbox",
  "abort-create",
  "continuation-profile",
  "session-profile",
  "peek-code",
  "open-inbox",
  "open-lock",
  "use-mailbox",
  "note-icon",
]);
const PAGE_TYPES = new Set([
  "list-messages",
  "get-message",
  "list-mailboxes",
  "delete-mailbox",
  "rename-mailbox",
  "export-backup",
  "import-backup",
  "set-lock",
  "unlock",
  "reset-lock",
  "lock-status",
  "open-inbox",
]);

let lockTabId = null;

function isExtensionPage(sender) {
  const url = sender?.url || "";
  return Boolean(url) && url.startsWith(chrome.runtime.getURL(""));
}

async function loadSessionMailbox() {
  try {
    const stored = await chrome.storage.session.get(SESSION_MAILBOX);
    const id = stored[SESSION_MAILBOX];
    if (!id) return null;
    const mailbox = await openRecord(await getMailbox(id));
    if (!mailbox || isMailboxExpired(mailbox)) return null;
    return mailbox;
  } catch {
    return null;
  }
}

async function rememberSessionMailbox(id) {
  try {
    await chrome.storage.session.set({ [SESSION_MAILBOX]: id });
  } catch {
    // Ohne Session-Speicher bleibt jede Seite bei einer eigenen Adresse.
  }
}

async function clearSessionMailbox(id) {
  const stored = await chrome.storage.session.get(SESSION_MAILBOX);
  if (stored[SESSION_MAILBOX] === id) await chrome.storage.session.remove(SESSION_MAILBOX);
}

function senderPage(sender) {
  try {
    return pageOrigin(sender?.url || "");
  } catch {
    return "";
  }
}

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

async function readTokens() {
  const stored = await chrome.storage.session.get(TOKEN_KEY);
  return stored[TOKEN_KEY] || {};
}

async function readToken(id) {
  const tokens = await readTokens();
  return tokens[id] || "";
}

async function writeToken(id, token) {
  const tokens = await readTokens();
  tokens[id] = token;
  await chrome.storage.session.set({ [TOKEN_KEY]: tokens });
}

async function forgetToken(id) {
  const tokens = await readTokens();
  delete tokens[id];
  await chrome.storage.session.set({ [TOKEN_KEY]: tokens });
}

async function withToken(mailbox, run) {
  let token = await readToken(mailbox.id);
  if (!token) {
    token = await login(mailbox.provider, mailbox.address, mailbox.mailboxPassword);
    await writeToken(mailbox.id, token);
  }
  try {
    return await run(token);
  } catch (error) {
    if (error.status !== 401) throw error;
    token = await login(mailbox.provider, mailbox.address, mailbox.mailboxPassword);
    await writeToken(mailbox.id, token);
    return run(token);
  }
}

async function forgetRemote(records) {
  for (const sealed of records) {
    try {
      const mailbox = await openRecord(sealed);
      if (!mailbox?.mailboxPassword || !mailbox.provider) continue;
      await withToken(mailbox, (token) => deleteAccount(mailbox.provider, token, mailbox.id));
    } catch {
      // Der lokale Eintrag ist bereits entfernt.
    }
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
    givenName: item.givenName || "",
    familyName: item.familyName || "",
    origin: item.origin,
    iconPage: item.iconPage || "",
    iconData: item.iconData || "",
    createdAt: item.createdAt,
    lastUsedAt: item.lastUsedAt || 0,
    kind: identityKind(item),
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

function personFrom(preview) {
  if (preview?.givenName && preview?.familyName && preview?.birthYear) {
    return {
      givenName: preview.givenName,
      familyName: preview.familyName,
      fullName: preview.fullName || `${preview.givenName} ${preview.familyName}`,
      honorific: preview.honorific || "Frau",
      birthDay: preview.birthDay,
      birthMonth: preview.birthMonth,
      birthYear: preview.birthYear,
    };
  }
  return generatePerson();
}

async function openLockTab() {
  if (lockTabId != null) {
    try {
      await chrome.tabs.update(lockTabId, { active: true });
      return;
    } catch {
      lockTabId = null;
    }
  }
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("src/lock/lock.html"), active: true });
  lockTabId = tab?.id ?? null;
}

async function requireUnlock({ open = true } = {}) {
  if (await isUnlocked()) return true;
  if (open) await openLockTab();
  return false;
}

function freshProfile() {
  return {
    ok: true,
    reused: false,
    hasMore: false,
    address: "",
    sitePassword: generatePassword(16),
    ...generatePerson(),
  };
}

async function matchesFor(origin, skipIds) {
  const skip = new Set(Array.isArray(skipIds) ? skipIds.map(String) : []);
  const mailboxes = await openedMailboxes();
  return mailboxes
    .filter((item) => !skip.has(String(item.id)) && !isMailboxExpired(item) && sameSite(item.origin, origin))
    .sort((left, right) => usedAt(right) - usedAt(left));
}

async function handlePreview(message, sender) {
  if (!(await requireUnlock())) return { ok: false, locked: true };
  const origin = senderPage(sender);
  if (!origin) return { ok: false };
  if (message?.fresh) return freshProfile();
  const matches = await matchesFor(origin, message?.skipIds);
  if (!matches.length) return freshProfile();
  return { ok: true, reused: true, hasMore: matches.length > 1, ...profileFrom(matches[0]) };
}

async function handleCreate(message, sender) {
  if (!(await requireUnlock())) return { ok: false, locked: true };
  const origin = senderPage(sender);
  if (!origin) return { ok: false, error: "Die Website konnte nicht geprüft werden." };
  const key = jobKey(sender);
  jobs.get(key)?.abort();
  const controller = new AbortController();
  jobs.set(key, controller);
  try {
    const created = await createMailbox(controller.signal, (percent, label) => {
      notify(sender, { type: "mailbox-progress", percent, label });
    });
    if (created.token) await writeToken(created.id, created.token);
    const person = personFrom(message.preview);
    const now = Date.now();
    const record = {
      id: created.id,
      address: created.address,
      mailboxPassword: created.mailboxPassword,
      provider: created.provider,
      sitePassword: message.preview?.sitePassword || generatePassword(16),
      givenName: person.givenName,
      familyName: person.familyName,
      honorific: person.honorific,
      birthDay: person.birthDay,
      birthMonth: person.birthMonth,
      birthYear: person.birthYear,
      origin,
      createdAt: now,
      lastUsedAt: now,
      kind: "temporary",
    };
    const evicted = await saveMailbox(await sealRecord(record));
    await rememberSessionMailbox(record.id);
    await forgetRemote(evicted);
    return { ok: true, ...profileFrom(record) };
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: error.message || "Die Adresse konnte nicht angelegt werden." };
  } finally {
    if (jobs.get(key) === controller) jobs.delete(key);
  }
}

function iconKey(value) {
  const pages = iconPages("", value);
  return pages[0] || "";
}

function iconPayload(value) {
  if (typeof value !== "string" || !value.startsWith("data:image/png;base64,")) return "";
  if (value.length > 100000) return "";
  return value;
}

async function handleNoteIcon(message, sender) {
  const page = iconKey(sender?.url || "");
  if (!page) return { ok: false };
  const icon = iconPayload(message?.icon);
  const all = await listMailboxes();
  for (const item of all) {
    if (!sameSite(item.origin, page)) continue;
    const patch = {};
    if (item.iconPage !== page) patch.iconPage = page;
    if (icon && item.iconData !== icon) patch.iconData = icon;
    if (!Object.keys(patch).length) continue;
    await updateMailbox(item.id, patch);
  }
  return { ok: true };
}

async function handleUse(message, sender) {
  if (!(await requireUnlock())) return { ok: false, locked: true };
  if (!message?.id) return { ok: false };
  const origin = senderPage(sender);
  const sealed = await getMailbox(message.id);
  if (!sealed || !origin || !sameSite(sealed.origin, origin)) return { ok: false };
  if (isMailboxExpired(sealed)) return { ok: false, error: "Das Postfach ist nicht mehr erreichbar." };
  await updateMailbox(sealed.id, { lastUsedAt: Date.now() });
  await rememberSessionMailbox(sealed.id);
  const opened = await openRecord(await getMailbox(sealed.id));
  if (!opened) return { ok: false, locked: true };
  return { ok: true, ...profileFrom(opened) };
}

async function handleAbort(_message, sender) {
  jobs.get(jobKey(sender))?.abort();
  return { ok: true };
}

async function handleOpenInbox(message) {
  if (!(await requireUnlock())) return { ok: false, locked: true };
  const id = String(message.id || "");
  const known = id ? inboxTabs.get(id) : null;
  if (known != null) {
    try {
      if (message.active) await chrome.tabs.update(known, { active: true });
      return { ok: true, tabId: known };
    } catch {
      inboxTabs.delete(id);
    }
  }
  const url = chrome.runtime.getURL(`src/inbox/inbox.html?id=${encodeURIComponent(message.id || "")}`);
  const tab = await chrome.tabs.create({ url, active: !!message.active });
  if (id && tab?.id != null) inboxTabs.set(id, tab.id);
  return { ok: true, tabId: tab.id };
}

async function handleOpenLock() {
  await openLockTab();
  return { ok: true };
}

async function handleListMessages(message) {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  const mailbox = await openRecord(await getMailbox(message.id));
  if (!mailbox) return { ok: false, error: "Keine Mailbox" };
  const view = mailboxView(mailbox);
  if (isMailboxExpired(mailbox)) return { ok: true, ...view, expired: true, messages: [] };
  const data = await withToken(mailbox, (token) => fetchMessages(mailbox.provider, token));
  const messages = data.map(mapMessage);
  await setBadge(messages.filter((item) => !item.seen).length);
  return { ok: true, ...view, expired: false, messages };
}

async function handleGetMessage(message) {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  const mailbox = await openRecord(await getMailbox(message.id));
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

async function handlePeekCode(message) {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  const mailbox = await openRecord(await getMailbox(message.id));
  if (!mailbox) return { ok: false, error: "Keine Mailbox" };
  if (isMailboxExpired(mailbox)) return { ok: true, code: "" };
  const data = await withToken(mailbox, (token) => fetchMessages(mailbox.provider, token));
  const newest = data[0];
  if (!newest) return { ok: true, code: "" };
  const introCode = extractMailCode(`${newest.subject || ""} ${newest.intro || ""}`);
  if (introCode) return { ok: true, code: introCode.replace(/\D/g, "") };
  const full = await withToken(mailbox, (token) => fetchMessage(mailbox.provider, token, newest.id));
  const code = extractMailCode(`${full?.subject || ""} ${full?.text || ""}`);
  return { ok: true, code: String(code || "").replace(/\D/g, "") };
}

async function handleSessionProfile(_message, sender) {
  if (!(await requireUnlock())) return { ok: false, locked: true };
  const mailbox = await loadSessionMailbox();
  const origin = senderPage(sender);
  if (!mailbox || !origin || !sameSite(mailbox.origin, origin)) return { ok: false };
  return { ok: true, profile: profileFrom(mailbox) };
}

async function openedMailboxes() {
  const open = [];
  for (const item of await listMailboxes()) {
    const mailbox = await openRecord(item);
    if (mailbox) open.push(mailbox);
  }
  return open;
}

async function handleContinuation(message, sender) {
  if (!(await requireUnlock())) return { ok: false, locked: true };
  const origin = senderPage(sender);
  if (!origin) return { ok: false };
  const mailboxes = await openedMailboxes();
  const address = String(message.address || "").trim().toLowerCase();
  const byAddress = address
    ? mailboxes.find((item) => item.address.toLowerCase() === address && sameSite(item.origin, origin))
    : null;
  if (byAddress) {
    if (isMailboxExpired(byAddress)) return { ok: false };
    return { ok: true, profile: profileFrom(byAddress) };
  }
  const session = await loadSessionMailbox();
  if (session && sameSite(session.origin, origin)) return { ok: true, profile: profileFrom(session) };
  const recent = Date.now() - 6 * 60 * 60 * 1000;
  const bySite = mailboxes.find(
    (item) => item.createdAt > recent && !isMailboxExpired(item) && sameSite(item.origin, origin),
  );
  if (!bySite) return { ok: false };
  return { ok: true, profile: profileFrom(bySite) };
}

async function handleListMailboxes() {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  const mailboxes = await openedMailboxes();
  await refreshBadge();
  return { ok: true, mailboxes: mailboxes.map(publicMailbox) };
}

async function handleDelete(message) {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  if (!message?.id) return { ok: false };
  if (message.remote) {
    const mailbox = await openRecord(await getMailbox(message.id));
    if (mailbox?.mailboxPassword && mailbox.provider) {
      try {
        await withToken(mailbox, (token) => deleteAccount(mailbox.provider, token, mailbox.id));
      } catch {
        // Der lokale Eintrag wird trotzdem entfernt.
      }
    }
  }
  await removeMailbox(message.id);
  await forgetToken(message.id);
  await clearSessionMailbox(message.id);
  inboxTabs.delete(String(message.id || ""));
  return { ok: true };
}

async function handleRename(message) {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  if (!message?.id) return { ok: false };
  const givenName = String(message.givenName || "").trim().slice(0, 80);
  const familyName = String(message.familyName || "").trim().slice(0, 80);
  if (!givenName || !familyName) return { ok: false, error: "Vorname und Nachname werden gebraucht." };
  const stored = await getMailbox(message.id);
  if (!stored) return { ok: false, error: "Keine Mailbox" };
  await updateMailbox(stored.id, { givenName, familyName });
  return { ok: true };
}

async function handleExport() {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  return exportBackup();
}

async function handleImport(message) {
  if (!(await requireUnlock({ open: false }))) return { ok: false, locked: true };
  const result = await importBackup(message.backup, message.passphrase);
  if (!result.ok) return result;
  if (result.evicted?.length) await forgetRemote(result.evicted);
  return { ok: true, added: result.added, dropped: result.evicted?.length || 0 };
}

function passphraseError(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 8) return "Mindestens 8 Zeichen.";
  return "";
}

async function handleSetLock(message) {
  const error = passphraseError(message.passphrase);
  if (error) return { ok: false, error };
  const created = await setPassphrase(message.passphrase);
  if (!created) return { ok: false, error: "Eine Sperre ist bereits gesetzt." };
  return { ok: true };
}

async function handleUnlock(message) {
  const error = passphraseError(message.passphrase);
  if (error) return { ok: false, error };
  const opened = await unlock(message.passphrase);
  if (!opened) return { ok: false, error: "Die Sperre stimmt nicht." };
  return { ok: true };
}

async function handleResetLock() {
  await resetLock();
  inboxTabs.clear();
  lockTabId = null;
  return { ok: true };
}

async function handleLockStatus() {
  return { ok: true, unlocked: await isUnlocked(), hasPassphrase: await hasLock() };
}

async function refreshBadge() {
  const mailbox = await openRecord(await getMailbox());
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

const handlers = {
  "preview-profile": handlePreview,
  "create-mailbox": handleCreate,
  "use-mailbox": handleUse,
  "note-icon": handleNoteIcon,
  "abort-create": handleAbort,
  "open-inbox": handleOpenInbox,
  "open-lock": handleOpenLock,
  "list-messages": handleListMessages,
  "get-message": handleGetMessage,
  "peek-code": handlePeekCode,
  "list-mailboxes": handleListMailboxes,
  "delete-mailbox": handleDelete,
  "rename-mailbox": handleRename,
  "export-backup": handleExport,
  "import-backup": handleImport,
  "continuation-profile": handleContinuation,
  "session-profile": handleSessionProfile,
  "set-lock": handleSetLock,
  unlock: handleUnlock,
  "reset-lock": handleResetLock,
  "lock-status": handleLockStatus,
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "inbox" || !isExtensionPage(port.sender || {})) return;
  const tabId = port.sender?.tab?.id;
  port.onMessage.addListener((message) => {
    if (!message?.id || tabId == null) return;
    inboxTabs.set(String(message.id), tabId);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (!sender?.url || !type) return false;
  const allowed = isExtensionPage(sender) ? PAGE_TYPES.has(type) : Boolean(sender.tab) && CONTENT_TYPES.has(type);
  if (!allowed) return false;
  const handler = handlers[type];
  if (!handler) return false;
  handler(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || "Unbekannter Fehler" }));
  return true;
});
