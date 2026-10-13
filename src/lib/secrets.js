import { listMailboxes, replaceMailboxes } from "./storage.js";

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

export async function openRecord(record) {
  if (!record) return null;
  const key = await sessionCryptoKey();
  if (!key) return null;
  const next = { ...record };
  delete next.token;
  delete next.pageUrl;
  if (isCipher(next.sitePassword)) next.sitePassword = await decryptText(key, next.sitePassword);
  if (isCipher(next.mailboxPassword)) next.mailboxPassword = await decryptText(key, next.mailboxPassword);
  return next;
}

export async function sealRecord(record) {
  const key = await sessionCryptoKey();
  if (!key) throw new Error("locked");
  const next = { ...record };
  delete next.token;
  delete next.pageUrl;
  if (typeof next.sitePassword === "string" && next.sitePassword) {
    next.sitePassword = await encryptText(key, next.sitePassword);
  }
  if (typeof next.mailboxPassword === "string" && next.mailboxPassword) {
    next.mailboxPassword = await encryptText(key, next.mailboxPassword);
  }
  return next;
}
