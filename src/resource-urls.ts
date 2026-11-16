// Explicit resource URLs also work on LAN HTTP, where service workers are unavailable.
let urls: Map<string, string> | null = null;
export function resourceURL(path: string) {
  if (!urls) {
    return path;
  }
  const key = path.replace(/^\.?\/?assets\//, '').split('?')[0];
  return urls.get(key) || 'data:application/octet-stream,';
}
export function useResourceURLs(
  files: { path: string; data: Blob }[] | null,
  {
    createURL = (blob: Blob | MediaSource) => URL.createObjectURL(blob),
    revokeURL = (url: string) => URL.revokeObjectURL(url),
  } = {},
) {
  if (urls) {
    for (const url of urls.values()) {
      revokeURL(url);
    }
  }
  urls = files
    ? new Map(files.map(({ path, data }) => [path, createURL(data)]))
    : null;
}
