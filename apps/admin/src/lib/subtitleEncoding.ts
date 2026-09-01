// Subtitle files have no reliable way to declare their own text encoding, and older Arabic .srt
// rips in particular are routinely saved as Windows-1256 (a single-byte Arabic code page), not
// UTF-8. `File.text()` always decodes as UTF-8 per spec - feeding it Windows-1256 bytes doesn't
// throw, it just silently replaces every non-ASCII byte with U+FFFD, which renders as a string of
// question marks (reported as "subtitles I uploaded show up as question marks"). This reads the
// raw bytes instead and picks a real decoding for them.
export async function readSubtitleFileAsText(file: File, language: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  // A real BOM is an unambiguous, explicit encoding declaration - trust it outright.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  // No BOM - most subtitle files in the wild don't have one. `fatal: true` makes the decoder
  // throw on a genuinely invalid UTF-8 byte sequence instead of silently swapping it for U+FFFD,
  // which is what actually lets this tell "this is UTF-8" apart from "this just happens to
  // decode without crashing" (Windows-1256 bytes very often do the latter).
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Windows-1256 for Arabic (by far the most common legacy encoding for Arabic subtitle rips);
    // Windows-1252 otherwise (the equivalent default for Latin-script subtitles). A single-byte
    // code page decoder never itself throws - every byte value maps to *some* character - so this
    // is always a safe last resort, even if it isn't the exact original encoding.
    const fallback = language.toLowerCase().startsWith('ar') ? 'windows-1256' : 'windows-1252';
    return new TextDecoder(fallback).decode(bytes);
  }
}
