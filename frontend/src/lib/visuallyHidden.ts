/** Hidden on screen but read by screen readers (page headings, table captions, button labels that are only an icon). */
export const visuallyHidden = {
  position: 'absolute',
  width: '1px', // strings on purpose: in MUI's sx a bare number <= 1 means a percentage, so `width: 1` would be 100%
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
