import Typography from '@mui/material/Typography';

/** Text-only placeholder wordmark (no Eneba artwork). Rename the brand here only. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Typography
      component="span"
      sx={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}
    >
      keymart
    </Typography>
  );
}
