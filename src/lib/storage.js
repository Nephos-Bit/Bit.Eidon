const KEY = "mailboxes";
const MAX = 50;

export async function listMailboxes() {
  const data = await chrome.storage.local.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}

export async function saveMailbox(mailbox) {
  const all = await listMailboxes();
  const next = [mailbox, ...all.filter((item) => item.id !== mailbox.id)];
  const kept = next.slice(0, MAX);
  const evicted = next.slice(MAX);
  await chrome.storage.local.set({ [KEY]: kept });
  return evicted;
}

export async function replaceMailboxes(mailboxes) {
  await chrome.storage.local.set({ [KEY]: mailboxes });
}

export async function appendMailboxes(records) {
  const all = await listMailboxes();
  const known = new Set(all.map((item) => item.id));
  const fresh = [];
  for (const item of records) {
    if (!item?.id || known.has(item.id)) continue;
    known.add(item.id);
    fresh.push(item);
  }
  const next = [...fresh, ...all];
  const kept = next.slice(0, MAX);
  const evicted = next.slice(MAX);
  await chrome.storage.local.set({ [KEY]: kept });
  return { added: fresh.length, evicted };
}

export async function removeMailbox(id) {
  const all = await listMailboxes();
  await chrome.storage.local.set({ [KEY]: all.filter((item) => item.id !== id) });
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
