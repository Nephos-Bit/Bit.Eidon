export function sameHost(left, right) {
  try {
    const host = (value) => new URL(value).hostname.replace(/^www\./, "");
    return host(left) === host(right);
  } catch {
    return false;
  }
}
