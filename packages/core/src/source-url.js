/**
 * Where church recordings actually live, and how to turn a share link into
 * something a downloader can fetch.
 *
 * YouTube is deliberately absent. It refuses server downloads by design and
 * nothing here tries to get around that.
 */

export const SUPPORTED_SOURCES = [
  'Google Drive', 'Dropbox', 'OneDrive or SharePoint', 'Vimeo',
  'a direct link to a video or audio file',
];

const host = url => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

export function isYoutube(url) {
  return ['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'].includes(host(url));
}

/**
 * A share link is a web page; the downloader needs the file behind it.
 * Returns the URL to actually fetch, plus what we think it is.
 */
export function normalizeSourceUrl(raw) {
  const url = String(raw || '').trim();
  const h = host(url);
  if (!h) return { url, kind: 'unknown', ok: false, reason: 'That does not look like a web address.' };
  if (isYoutube(url)) {
    return { url, kind: 'youtube', ok: false,
      reason: 'YouTube does not allow servers to download its videos. Upload the recording, or use Drive, Dropbox, OneDrive or Vimeo.' };
  }

  // Google Drive: /file/d/<id>/view, or ?id=<id>
  if (h === 'drive.google.com' || h === 'docs.google.com') {
    const id = url.match(/\/file\/d\/([\w-]{10,})/)?.[1] ?? new URL(url).searchParams.get('id');
    if (!id) return { url, kind: 'gdrive', ok: false, reason: 'That Google Drive link has no file in it. Use the link for the file itself, not a folder.' };
    return { url: `https://drive.google.com/uc?export=download&id=${id}`, kind: 'gdrive', ok: true,
      note: 'Make sure the file is shared as "Anyone with the link".' };
  }

  // Dropbox hands you a preview page unless you ask for the raw file.
  if (h === 'dropbox.com' || h.endsWith('.dropbox.com')) {
    const u = new URL(url);
    u.searchParams.set('dl', '1');
    return { url: u.toString(), kind: 'dropbox', ok: true };
  }

  // OneDrive and SharePoint behave the same way.
  if (h === '1drv.ms' || h.endsWith('sharepoint.com') || h === 'onedrive.live.com') {
    const u = new URL(url);
    u.searchParams.set('download', '1');
    return { url: u.toString(), kind: 'onedrive', ok: true };
  }

  if (h === 'vimeo.com' || h.endsWith('.vimeo.com')) return { url, kind: 'vimeo', ok: true };

  return { url, kind: 'direct', ok: true };
}

/**
 * Is the link actually reachable, before we queue five minutes of work?
 *
 * Deliberately lenient: Drive and Dropbox answer with HTML for their own
 * interstitials and the downloader handles those fine, so only a clear
 * failure — unreachable, missing, forbidden — is treated as a problem.
 */
export async function checkSourceUrl(url, { timeoutMs = 8000 } = {}) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    // Plenty of file hosts do not answer HEAD; fall back to the first byte.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    }
    if (res.status === 404) return { ok: false, reason: 'That link gives a "not found". Check it is the right link and still shared.' };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'That link is private. Share it as "anyone with the link" and try again.' };
    if (res.status >= 500) return { ok: false, reason: `The site hosting that file returned an error (${res.status}). Try again shortly.` };
    return { ok: true, contentType: res.headers.get('content-type') ?? null, size: Number(res.headers.get('content-length')) || null };
  } catch (err) {
    return { ok: false, reason: `Could not reach that link (${err.name === 'TimeoutError' ? 'timed out' : err.message}).` };
  }
}
