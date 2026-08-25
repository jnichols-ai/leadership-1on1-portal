/**
 * Prompt display labels.
 *
 * Deliberately separate from lib/programs.ts: that module imports every
 * program JSON, and SessionForm is a client component. Importing promptLabel
 * from there shipped the entire program registry to the browser.
 */
const PROMPT_LABELS: Record<string, string> = {
  probe: 'Probe',
  coachable_moment: 'The Coachable Moment',
  share_your_experience: 'Share Your Experience',
  your_role: 'Your Role',
};

export function promptLabel(type: string): string {
  return PROMPT_LABELS[type] ?? 'Prompt';
}
