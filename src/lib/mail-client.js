import { generateLocalPart, generatePassword } from "./password.js";

const MAIL_TM = "https://api.mail.tm";
const MAIL_GW = "https://api.mail.gw";
const PROVIDERS = [MAIL_TM, MAIL_GW];
const TEN_MINUTES = 10 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const PROVIDER_INFO = {
  [MAIL_TM]: {
    name: "mail.tm",
    href: "https://mail.tm",
    accountTtlMs: null,
    messageRetentionMs: SEVEN_DAYS,
  },
  [MAIL_GW]: {
    name: "mail.gw",
    href: "https://mail.gw",
    accountTtlMs: TEN_MINUTES,
    messageRetentionMs: TEN_MINUTES,
  },
};

export function providerInfo(base) {
  return PROVIDER_INFO[base] || PROVIDER_INFO[MAIL_TM];
}

export function mailboxExpiresAt(mailbox) {
  const ttl = providerInfo(mailbox?.provider).accountTtlMs;
  if (!ttl || !mailbox?.createdAt) return null;
  return mailbox.createdAt + ttl;
}

export function isMailboxExpired(mailbox, now = Date.now()) {
  const at = mailboxExpiresAt(mailbox);
  return at != null && now >= at;
}

export class MailError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "MailError";
    this.status = status;
  }
}

function combinedSignal(parent, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!parent) return timeout;
  return AbortSignal.any([parent, timeout]);
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function api(base, path, { method = "GET", token, body, signal } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      method,
      signal: combinedSignal(signal, 20000),
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text };
      }
    }
    if ((response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) && attempt === 0) {
      await delay(800, signal);
      continue;
    }
    if (!response.ok) {
      const detail =
        data?.["hydra:description"] ||
        data?.detail ||
        data?.message ||
        (response.status >= 500 ? "Der Mail-Dienst ist gerade nicht erreichbar." : response.statusText) ||
        `HTTP ${response.status}`;
      throw new MailError(String(detail), response.status);
    }
    return data;
  }
  throw new MailError("Zu viele Anfragen", 429);
}

export function membersOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.["hydra:member"])) return data["hydra:member"];
  return [];
}

async function activeDomain(base, signal) {
  const data = await api(base, "/domains", { signal });
  const members = membersOf(data);
  const domain = members.find((item) => item.isActive && !item.isPrivate) || members.find((item) => item.isActive);
  if (!domain?.domain) throw new MailError("Keine aktive Domain");
  return domain.domain;
}

async function createAccount(base, address, password, signal) {
  return api(base, "/accounts", {
    method: "POST",
    body: { address, password },
    signal,
  });
}

export async function login(base, address, password, signal) {
  const data = await api(base, "/token", {
    method: "POST",
    body: { address, password },
    signal,
  });
  if (!data?.token) throw new MailError("Kein Token erhalten");
  return data.token;
}

export async function fetchMessages(base, token, signal) {
  const data = await api(base, "/messages", { token, signal });
  return membersOf(data);
}

export async function fetchMessage(base, token, id, signal) {
  return api(base, `/messages/${id}`, { token, signal });
}

async function createOnProvider(base, signal, onProgress) {
  onProgress?.(15, "Domain wird geladen…");
  const domain = await activeDomain(base, signal);
  const mailboxPassword = generatePassword(16);
  let account = null;
  let address = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    address = `${generateLocalPart(12)}@${domain}`;
    try {
      onProgress?.(40, "Konto wird angelegt…");
      account = await createAccount(base, address, mailboxPassword, signal);
      break;
    } catch (error) {
      if (signal?.aborted || error.name === "AbortError") throw error;
      if (error.status !== 422 || attempt === 3) throw error;
    }
  }
  onProgress?.(60, "Anmeldung an der Mailbox…");
  const token = await login(base, address, mailboxPassword, signal);
  return {
    id: account?.id || crypto.randomUUID(),
    address,
    mailboxPassword,
    token,
    provider: base,
  };
}

export async function createMailbox(signal, onProgress) {
  let lastError = null;
  for (const base of PROVIDERS) {
    try {
      return await createOnProvider(base, signal, onProgress);
    } catch (error) {
      if (signal?.aborted || error.name === "AbortError") throw error;
      lastError = error;
    }
  }
  throw lastError ?? new MailError("Kein Mail-Dienst erreichbar");
}
