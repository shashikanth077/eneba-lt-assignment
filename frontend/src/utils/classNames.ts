/** Joins class names, skipping the falsy ones: classNames(styles.card, active && styles.active). */
export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
