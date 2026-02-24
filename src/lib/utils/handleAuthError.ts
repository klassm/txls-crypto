export function handleAuthError(status: number): void {
  if (status === 401 || status === 403) {
    window.location.href = "/login";
  }
}