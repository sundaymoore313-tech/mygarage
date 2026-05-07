function stripKnownFontNoise(input: string): string {
  return input
    // Handle glued variants first (e.g. "BroncoPersonalUse", "FontPERSONALUSEONLY").
    .replace(/forpersonaluseonly/gi, ' ')
    .replace(/personaluseonly/gi, ' ')
    .replace(/forpersonaluse/gi, ' ')
    .replace(/personaluse/gi, ' ')
    .replace(/personalonly/gi, ' ')
    // Licensing / distribution noise commonly included in free font files.
    .replace(/\b(personal\s*use\s*only|for\s*personal\s*use|personal\s*use|personal|trial|demo|free\s*for\s*personal\s*use|free)\b/gi, ' ')
    // Common trailing style tokens that are usually redundant in picker labels.
    .replace(/\b(regular|reg|book|roman|normal|medium|semi\s*bold|semibold|extra\s*bold|extrabold|ultra\s*bold|ultrabold|bold|bld|light|thin)\b$/gi, ' ')
}

export function cleanFontDisplayName(raw: string): string {
  const base = (raw || '')
    .replace(/\.[^/.]+$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const cleaned = stripKnownFontNoise(base)
    .replace(/\s+/g, ' ')
    .replace(/[\s._-]+$/g, '')
    .trim()

  // If cleaning removed everything, fall back to a basic readable version.
  if (!cleaned) return base || 'Custom Font'

  // Remove a single trailing orphan character token (e.g., "blah blah b").
  return cleaned.replace(/\s+[A-Za-z]$/g, '').trim() || cleaned
}
