import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useEffect, useState } from 'react';
import { tokens } from '../../theme/theme';

const MASK = '•••••-•••••-•••••';
type CopyState = 'idle' | 'copied' | 'failed';

/**
 * One game key, hidden until the buyer asks for it (so it is not on screen for a bystander or in a screenshot of the page), with a
 * button that copies it. The key lives only in this component's props: it is not written to storage, the URL or the logs.
 */
export function KeyReveal({ value, label }: { value: string; label: string }) {
  const [shown, setShown] = useState(false);
  const [copy, setCopy] = useState<CopyState>('idle');

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopy('copied');
    } catch {
      // No clipboard permission (or an insecure page): the key is selectable text, so it can still be copied by hand.
      setCopy('failed');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
      <Box
        component="code"
        aria-label={shown ? `${label}: ${value}` : `${label}: hidden`}
        sx={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '1.0625rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          bgcolor: tokens.color.surfaceInput,
          px: 1.5,
          py: 1,
          userSelect: shown ? 'all' : 'none',
          minWidth: 200,
        }}
      >
        {shown ? value : MASK}
      </Box>
      <Button
        variant="outlined"
        size="small"
        startIcon={shown ? <VisibilityOffIcon /> : <VisibilityIcon />}
        aria-pressed={shown}
        onClick={() => setShown((current) => !current)}
      >
        {shown ? 'Hide key' : 'Reveal key'}
      </Button>
      {shown && (
        <Button
          variant="contained"
          size="small"
          startIcon={copy === 'copied' ? <CheckIcon /> : <ContentCopyIcon />}
          onClick={() => void copyKey()}
        >
          {copy === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      )}
      <Box
        role="status"
        aria-live="polite"
        sx={{ fontSize: '0.8125rem', color: copy === 'failed' ? 'error.main' : 'text.secondary' }}
      >
        {copy === 'copied' && 'Key copied to the clipboard'}
        {copy === 'failed' && 'Could not copy automatically. Select the key and copy it.'}
      </Box>
    </Box>
  );
}
