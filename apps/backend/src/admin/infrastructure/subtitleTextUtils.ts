/**
 * Shared by every path that resolves subtitle text server-side (OpenSubtitles search/hash-match
 * import, file upload) - reported as "some subtitles show up garbled or in the wrong language."
 * Two independent problems, both handled here:
 *
 * 1. Encoding: subtitle files have no reliable way to declare their own text encoding, and older
 *    Arabic .srt rips in particular are routinely Windows-1256 (a single-byte Arabic code page),
 *    not UTF-8. `Response.text()`/a plain UTF-8 decode doesn't throw on this - it silently
 *    replaces every non-ASCII byte with U+FFFD, which renders as a string of question marks. This
 *    mirrors apps/admin/src/lib/subtitleEncoding.ts's own BOM-sniffing + fatal-UTF-8-then-fallback
 *    logic, just reading from a fetched ArrayBuffer instead of a browser File.
 * 2. Wrong content: OpenSubtitles' own metadata for a file (or a fuzzy title-search match) is
 *    occasionally just wrong - a file tagged "ar" that's actually English/some other language
 *    entirely. Nothing about the encoding is broken in that case (it decodes fine), so this needs
 *    a separate content check: does the text actually contain a meaningful proportion of Arabic
 *    script, when it's claimed to be Arabic.
 */

function decodeSubtitleBytes(bytes: Uint8Array, language: string): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // A single-byte code page decoder never itself throws - every byte value maps to *some*
    // character - so this is always a safe last resort, even if it isn't the exact original
    // encoding (isLikelyLanguageMatch below is what catches it if the guess was still wrong).
    const fallback = language.toLowerCase().startsWith('ar') ? 'windows-1256' : 'windows-1252';
    return new TextDecoder(fallback).decode(bytes);
  }
}

/** Fetches a subtitle URL and decodes it with the same encoding-detection `uploadSubtitle`'s client-side path already gets. */
export async function fetchSubtitleTextSafely(
  url: string,
  language: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return null;
    return decodeSubtitleBytes(bytes, language);
  } catch {
    return null;
  }
}

const ARABIC_RANGES = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LETTER = /\p{L}/u;

/**
 * Only ever enforced for language "ar" (see both call sites) - other languages don't get a
 * positive content check, since there's no single script to test for across "en"/"fr"/etc., and
 * Arabic-tagged-but-wrong is overwhelmingly the actual failure mode reported (OpenSubtitles'
 * "ar" results are occasionally mislabeled; its results for other languages haven't been).
 * Counts script among letter characters only - a subtitle file is mostly timestamps/indices/
 * markup, which contain no letters at all and would otherwise dilute any ratio meaninglessly.
 */
export function isLikelyLanguageMatch(text: string, language: string): boolean {
  if (!language.toLowerCase().startsWith('ar')) return true;

  let letters = 0;
  let arabicLetters = 0;
  for (const ch of text) {
    if (!LETTER.test(ch)) continue;
    letters++;
    if (ARABIC_RANGES.test(ch)) arabicLetters++;
  }
  // Too little text to judge either way (e.g. a near-empty file) - let it through; the "no
  // subtitle content resolved" path already handles genuinely empty results separately.
  if (letters < 20) return true;
  return arabicLetters / letters >= 0.3;
}
