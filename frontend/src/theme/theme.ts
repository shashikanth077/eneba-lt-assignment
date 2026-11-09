import { createTheme } from '@mui/material/styles';

/**
 * Design tokens derived from the Eneba reference screenshots.
 * See docs/DESIGN_TOKENS.md for which values were MEASURED (pixel-sampled)
 * and which were ESTIMATED.
 */
export const tokens = {
  color: {
    // Surfaces (measured). Depth is expressed with colour steps, not shadows.
    page: '#4718ac', // page + header background
    navBar: '#341282', // category nav strip under the header
    surface: '#351183', // checkout header / panels
    surfaceInset: '#2f0f73', // rows inside a panel
    surfaceInput: '#2a0e69', // inputs inside checkout panels
    filterPanel: '#5825cc', // catalog filter sidebar
    filterInput: '#461ea3', // inputs/selects inside the filter sidebar
    chip: '#2c0e6c', // filter chips
    card: '#1f0b4f', // product card body
    footer: '#150733', // footer background
    // Brand / actions (measured)
    yellow: '#fad318', // primary CTA, checkbox, "clear all"
    blue: '#4101ff', // promo CTA ("buy cards")
    green: '#84e916', // cashback and discount text
    mint: '#63e3c1', // "cashback" corner badge
    red: '#d22252', // cart count badge
    stepActive: '#23c299',
    stepInactive: '#8670b5',
    // Text (white, footer-link and placeholder values measured)
    textPrimary: '#ffffff',
    textSecondary: '#dcd8e6',
    textMuted: '#b3aac9',
    placeholder: '#ad8fe4',
    // Estimated from the screenshots (text is anti-aliased, so not sampled cleanly)
    regionTeal: '#63e3c1',
    regionPink: '#ff6f9f',
  },
  layout: {
    containerMax: 1440, // measured: 229px -> 1669px at a 1893px viewport
    headerHeight: 108, // measured
    navBarHeight: 60, // measured
    heroHeight: 379, // measured
    searchWidth: 660, // measured
    filterWidth: 264, // measured
    cardWidth: 267, // measured
    cardGap: 24, // measured 25
    panelGap: 24, // measured
    categoryItemWidth: 126, // measured
  },
} as const;

export type Tokens = typeof tokens;

declare module '@mui/material/styles' {
  interface Theme {
    tokens: Tokens;
  }
  interface ThemeOptions {
    tokens?: Tokens;
  }
}

const FONT_STACK = '"Montserrat", "Helvetica Neue", Arial, sans-serif';
const { color: c } = tokens;

export const theme = createTheme({
  tokens,
  spacing: 8,
  shape: { borderRadius: 2 }, // Eneba is almost square-cornered (estimated 0-2px)
  palette: {
    mode: 'dark',
    primary: { main: c.yellow, contrastText: '#000000' },
    secondary: { main: c.blue, contrastText: '#ffffff' },
    success: { main: c.green, contrastText: '#000000' },
    error: { main: c.red },
    info: { main: c.mint, contrastText: '#000000' },
    background: { default: c.page, paper: c.surface },
    text: {
      primary: c.textPrimary,
      secondary: c.textSecondary,
      disabled: c.stepInactive,
    },
    divider: 'rgba(255,255,255,0.12)',
  },
  typography: {
    fontFamily: FONT_STACK,
    fontSize: 16,
    h1: { fontSize: '2.125rem', fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.25 },
    h3: { fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.3 },
    h4: { fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 },
    subtitle1: { fontSize: '1rem', fontWeight: 700 },
    subtitle2: { fontSize: '0.875rem', fontWeight: 700 },
    body1: { fontSize: '1rem', fontWeight: 500 },
    body2: { fontSize: '0.875rem', fontWeight: 500 },
    caption: { fontSize: '0.8125rem', fontWeight: 600 },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    },
    button: { fontSize: '1rem', fontWeight: 700, textTransform: 'none' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: c.page, color: c.textPrimary },
        a: { color: 'inherit' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: 'none' } }, // flat, no MUI dark overlay
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'default' },
      styleOverrides: {
        root: { backgroundColor: c.page, height: tokens.layout.headerHeight },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 2, padding: '10px 24px', minHeight: 42 },
        sizeLarge: { minHeight: 48 },
        sizeSmall: { minHeight: 32, padding: '4px 12px', fontSize: '0.875rem' },
        outlined: { borderColor: '#ffffff', color: '#ffffff' },
      },
      variants: [
        // "PIRK KORTELES"-style promo button: blue, uppercase
        {
          props: { variant: 'contained', color: 'secondary' },
          style: { textTransform: 'uppercase' },
        },
      ],
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          backgroundColor: c.filterInput,
          '& fieldset': { borderColor: 'transparent' },
          '&:hover fieldset': { borderColor: c.stepInactive },
          '&.Mui-focused fieldset': { borderColor: '#ffffff', borderWidth: 1 },
        },
        input: { fontWeight: 600, '&::placeholder': { color: c.placeholder, opacity: 1 } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, height: 36 },
        label: { paddingInline: 18 },
      },
      variants: [
        // Only the neutral chip uses the filter-chip surface; coloured chips keep their palette colour.
        {
          props: { color: 'default', variant: 'filled' },
          style: { backgroundColor: c.chip, color: '#fff' },
        },
      ],
    },
    MuiCheckbox: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: { color: c.textMuted, '&.Mui-checked': { color: c.yellow } },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: c.card,
          border: '1px solid #3c2198',
          borderRadius: 0,
        },
      },
    },
    MuiLink: {
      defaultProps: { underline: 'hover' },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: 'rgba(255,255,255,0.12)' } },
    },
  },
});

export default theme;
