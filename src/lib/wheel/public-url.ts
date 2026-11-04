/** Set to the published application's HTTPS start-page URL after publication. */
export const PUBLIC_TOOL_URL: string = "";

/** Never allow session paths, credentials, query parameters or hash keys into PDFs. */
export function publicToolUrl(value = PUBLIC_TOOL_URL): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin + "/";
  } catch {
    return null;
  }
}