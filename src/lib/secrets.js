import { appendMailboxes, listMailboxes, replaceMailboxes } from "./storage.js";

export const PBKDF2_ITERATIONS = 600000;

const LOCK_KEY = "lock";
const SESSION_SECRET = "secretKey";
const VERIFIER_TEXT = "eidon-ok";

function bytesToB64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function isCipher(value) {
  return Boolean(value && typeof value === "object" && value.v === 1 && value.iv && value.data);
}

export async function deriveAesKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { v: 1, iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) };
}

export async function decryptText(key, payload) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
    key,
    b64ToBytes(payload.data),
  );
  return new TextDecoder().decode(clear);
}

async function readLock() {
  const data = await chrome.storage.local.get(LOCK_KEY);
  return data[LOCK_KEY] || null;
}

async function sessionCryptoKey() {
  const stored = await chrome.storage.session.get(SESSION_SECRET);
  const raw = stored[SESSION_SECRET];
  if (!raw) return null;
  return crypto.subtle.importKey("raw", b64ToBytes(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function storeSessionKey(key) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  await chrome.storage.session.set({ [SESSION_SECRET]: bytesToB64(raw) });
}

export async function hasLock() {
  const lock = await readLock();
  return Boolean(lock?.verifier && lock?.salt);
}

export async function isUnlocked() {
  const stored = await chrome.storage.session.get(SESSION_SECRET);
  return Boolean(stored[SESSION_SECRET]);
}

async function migrateMailboxes(key) {
  const all = await listMailboxes();
  const next = [];
  for (const item of all) {
    const copy = { ...item };
    delete copy.token;
    delete copy.pageUrl;
    if (typeof copy.sitePassword === "string" && copy.sitePassword) {
      copy.sitePassword = await encryptText(key, copy.sitePassword);
    }
    if (typeof copy.mailboxPassword === "string" && copy.mailboxPassword) {
      copy.mailboxPassword = await encryptText(key, copy.mailboxPassword);
    }
    next.push(copy);
  }
  await replaceMailboxes(next);
}

export async function setPassphrase(passphrase) {
  if (await hasLock()) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const verifier = await encryptText(key, VERIFIER_TEXT);
  await chrome.storage.local.set({
    [LOCK_KEY]: { salt: bytesToB64(salt), iterations: PBKDF2_ITERATIONS, verifier },
  });
  await storeSessionKey(key);
  await migrateMailboxes(key);
  return true;
}

export async function unlock(passphrase) {
  const lock = await readLock();
  if (!lock?.salt || !lock.verifier) return false;
  const key = await deriveAesKey(passphrase, b64ToBytes(lock.salt), lock.iterations || PBKDF2_ITERATIONS);
  try {
    const text = await decryptText(key, lock.verifier);
    if (text !== VERIFIER_TEXT) return false;
  } catch {
    return false;
  }
  await storeSessionKey(key);
  return true;
}

export async function resetLock() {
  await chrome.storage.local.remove([LOCK_KEY, "mailboxes"]);
  await chrome.storage.session.remove([SESSION_SECRET, "mailboxTokens", "sessionMailboxId"]);
}

function stripRecord(record) {
  const next = { ...record };
  delete next.token;
  delete next.pageUrl;
  return next;
}

function hasPlainPassword(record) {
  return [record?.sitePassword, record?.mailboxPassword].some((value) => typeof value === "string" && value);
}

async function decryptFields(key, record) {
  if (!record) return null;
  const next = stripRecord(record);
  if (isCipher(next.sitePassword)) next.sitePassword = await decryptText(key, next.sitePassword);
  if (isCipher(next.mailboxPassword)) next.mailboxPassword = await decryptText(key, next.mailboxPassword);
  return next;
}

async function encryptFields(key, record) {
  const next = stripRecord(record);
  if (typeof next.sitePassword === "string" && next.sitePassword) {
    next.sitePassword = await encryptText(key, next.sitePassword);
  }
  if (typeof next.mailboxPassword === "string" && next.mailboxPassword) {
    next.mailboxPassword = await encryptText(key, next.mailboxPassword);
  }
  return next;
}

function lockMaterial(lock) {
  return {
    salt: lock.salt,
    iterations: lock.iterations || PBKDF2_ITERATIONS,
    verifier: lock.verifier,
  };
}

function sameLock(left, right) {
  return left.salt === right.salt && left.iterations === right.iterations;
}

export async function openRecord(record) {
  const key = await sessionCryptoKey();
  if (!key) return null;
  return decryptFields(key, record);
}

export async function sealRecord(record) {
  const key = await sessionCryptoKey();
  if (!key) throw new Error("locked");
  return encryptFields(key, record);
}

export async function exportBackup() {
  const lock = await readLock();
  if (!lock?.salt || !lock.verifier) return { ok: false, error: "Lege zuerst eine Sperre an." };
  let rows = await listMailboxes();
  if (rows.some(hasPlainPassword)) {
    const key = await sessionCryptoKey();
    if (!key) return { ok: false, error: "Entsperre Eidon, damit die Passwörter verschlüsselt exportiert werden." };
    rows = [];
    for (const item of await listMailboxes()) rows.push(await encryptFields(key, item));
    await replaceMailboxes(rows);
  }
  return {
    ok: true,
    backup: {
      v: 1,
      lock: lockMaterial(lock),
      mailboxes: rows.map(stripRecord),
    },
  };
}

export async function importBackup(file, passphrase) {
  if (typeof passphrase !== "string" || !passphrase) return { ok: false, error: "Die Sperre stimmt nicht." };
  const stated = file?.lock;
  const rows = Array.isArray(file?.mailboxes) ? file.mailboxes : null;
  if (!stated?.salt || !stated?.verifier || !rows) return { ok: false, error: "Die Datei ist keine Eidon-Sicherung." };
  const fileLock = lockMaterial(stated);
  let fileKey;
  try {
    fileKey = await deriveAesKey(passphrase, b64ToBytes(fileLock.salt), fileLock.iterations);
    const text = await decryptText(fileKey, fileLock.verifier);
    if (text !== VERIFIER_TEXT) return { ok: false, error: "Die Sperre stimmt nicht." };
  } catch {
    return { ok: false, error: "Die Sperre stimmt nicht." };
  }
  const local = await readLock();
  if (!local?.salt || !local?.verifier) return { ok: false, error: "Lege zuerst eine Sperre an." };
  const localLock = lockMaterial(local);
  const matching = sameLock(localLock, fileLock);
  const session = await sessionCryptoKey();
  if (!matching && !session) {
    return { ok: false, error: "Entsperre Eidon, damit die Einträge neu verschlüsselt werden können." };
  }
  const existing = new Set((await listMailboxes()).map((item) => item.id));
  const incoming = rows.filter((item) => item?.id && !existing.has(item.id));
  const prepared = [];
  try {
    for (const item of incoming) {
      if (matching) prepared.push(await encryptFields(fileKey, item));
      else prepared.push(await encryptFields(session, await decryptFields(fileKey, item)));
    }
  } catch {
    return { ok: false, error: "Die Sicherung lässt sich nicht lesen." };
  }
  if (!prepared.length) return { ok: true, added: 0, evicted: [] };
  const stored = await appendMailboxes(prepared);
  return { ok: true, added: stored.added, evicted: stored.evicted };
}
