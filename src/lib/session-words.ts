/**
 * Words that name structured efforts. One list for the parser and the page:
 * route-intent.ts declines a prompt with these that it cannot turn into a
 * session (never a plain ride that silently drops the efforts), and
 * Generate asks "OK to repeat your efforts on the same stretch?" for them.
 * Client-safe.
 */
export const EFFORT_WORDS =
  /\d\s*(?:[x×]|by)\s*\d|\binterval|\bthreshold\b|\bftp\b|\btempo\b|\bvo2|sweet\s*spot|\banaerobic\b|\bsprints?\b|\bzone\s*[3-7]\b|\bz[3-7]\b|\brepeats\b|\bover[\s-]?unders?\b|(?<!\bno\s+(?:\w+\s+)?)\befforts\b|\bhard\s+session\b/i;

export function mentionsEfforts(text: string): boolean {
  return EFFORT_WORDS.test(text);
}

/** One test effort (an FTP or ramp test, a time trial): nothing to repeat. */
const SINGLE_TEST = /\b(?:ftp|ramp|cp)\s*-?\s*test\b|\btime[\s-]*trial\b/i;
/** …unless the rider also asks for reps ("FTP test, then 3x5 min"). */
const REPS = /\d\s*(?:[x×]|by)\s*\d|\brepeats\b|\bintervals\b|\befforts\b/i;

/**
 * Generate asks the repeat question: the prompt describes efforts, and more
 * than one of them.
 */
export function asksRepeatEfforts(text: string): boolean {
  if (!mentionsEfforts(text)) return false;
  return !SINGLE_TEST.test(text) || REPS.test(text);
}
