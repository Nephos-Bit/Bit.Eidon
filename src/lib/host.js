function siteHost(value) {
  return new URL(value).hostname.replace(/^www\./, "");
}

export function sameHost(left, right) {
  try {
    return siteHost(left) === siteHost(right);
  } catch {
    return false;
  }
}

export function pageOrigin(value) {
  const url = new URL(value);
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${siteHost(value)}${port}`;
}

export function sameSite(left, right) {
  try {
    return pageOrigin(left) === pageOrigin(right);
  } catch {
    return false;
  }
}
