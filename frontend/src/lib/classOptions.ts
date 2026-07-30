// Shared class list for every class-picker in the app: grades 1–12, each
// with sections A–D. Free-text class fields elsewhere in the app still
// accept anything (the `class` column is plain text — see backend
// migrations/001), but every new/updated form uses this list so "class
// 1–12" is genuinely selectable everywhere, not just accepted as text.
export const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
export const SECTIONS = ["A", "B", "C", "D"];

export const CLASS_OPTIONS: string[] = GRADES.flatMap((g) => SECTIONS.map((s) => `${g}${s}`));

export function gradeLabel(cls: string): string {
  const match = cls.match(/^(\d+)([A-Za-z]*)$/);
  if (!match) return cls;
  const [, grade, section] = match;
  return `Class ${grade}${section ? ` - ${section}` : ""}`;
}
