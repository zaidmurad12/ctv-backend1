// Browsers' native <track kind="subtitles"> only ever parses WebVTT, never SRT - feeding it an
// .srt file just renders no cues at all, with no error. This is the minimal SRT->VTT conversion
// needed for that: a "WEBVTT" header, and comma decimal separators in timestamps swapped for the
// dots WebVTT requires (the only structural difference that actually matters for basic cue
// text - both formats share the same numbered-block/arrow-timestamp layout otherwise).
export function srtToVtt(input: string): string {
  const body = input
    .replace(/\r+/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body}`;
}

export function isVtt(format: string, content: string): boolean {
  return format.toLowerCase() === 'vtt' || content.trimStart().startsWith('WEBVTT');
}
