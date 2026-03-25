let basePath: string | null = null;

export function getBasePath(): string {
  if (basePath !== null) {
    return basePath;
  }

  const path = window.location.pathname;
  const ingressMatch = path.match(/^(\/api\/hassio_ingress\/[^/]+)/);
  basePath = ingressMatch ? ingressMatch[1] : "";
  return basePath;
}

export function apiUrl(path: string): string {
  const base = getBasePath();
  if (path.startsWith("/api/")) {
    return base + path;
  }
  return path;
}

export function assetUrl(path: string): string {
  const base = getBasePath();
  if (path.startsWith("/")) {
    return base + path;
  }
  return path;
}
