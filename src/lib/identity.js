export function identityKind(record) {
  return record?.kind || "temporary";
}

export function usedAt(record) {
  return record?.lastUsedAt || record?.createdAt || 0;
}
