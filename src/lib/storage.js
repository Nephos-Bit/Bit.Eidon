const KEY = "mailboxes";
const MAX = 50;

export async function listMailboxes() {
  const data = await chrome.storage.local.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}

export async function saveMailbox(mailbox) {
  const all = await listMailboxes();
  const next = [mailbox, ...all.filter((item) => item.id !== mailbox.id)].slice(0, MAX);
  await chrome.storage.local.set({ [KEY]: next });
  return mailbox;
}

export async function getMailbox(id) {
  const all = await listMailboxes();
  if (!id) return all[0] || null;
  return all.find((item) => item.id === id) || null;
}

export async function updateMailbox(id, patch) {
  const all = await listMailboxes();
  const next = all.map((item) => (item.id === id ? { ...item, ...patch } : item));
  await chrome.storage.local.set({ [KEY]: next });
  return next.find((item) => item.id === id) || null;
}
