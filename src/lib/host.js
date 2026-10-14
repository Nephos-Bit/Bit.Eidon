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

export function iconPages(origin, iconPage) {
  const pages = [];
  const push = (value) => {
    if (value && !pages.includes(value)) pages.push(value);
  };
  const variants = (value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      url.hash = "";
      url.search = "";
      const host = url.hostname.replace(/^www\./, "");
      const port = url.port ? `:${url.port}` : "";
      const bare = `${url.protocol}//${host}${port}/`;
      const withWww = `${url.protocol}//www.${host}${port}/`;
      const exact = url.toString();
      if (exact !== bare && exact !== withWww) push(exact);
      push(withWww);
      push(bare);
    } catch {
      // Ungültige Adressen liefern kein Icon.
    }
  };
  if (iconPage) variants(iconPage);
  if (origin) variants(origin);
  return pages;
}
