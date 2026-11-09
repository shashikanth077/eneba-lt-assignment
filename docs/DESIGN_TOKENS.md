# Design tokens (Eneba style)

Source: the 5 screenshots you attached (homepage top, product cards, footer, catalog with filters, cart),
taken from eneba.com/lt at a ~1893 px wide viewport. Code mirror: `frontend/src/theme/theme.ts`.

**How values were obtained.** *Measured* = pixel-sampled / edge-detected from the screenshots with a script
(colours are exact to about +-1 because the images are compressed). *Estimated* = judged by eye, or
a free substitute because the original asset is not in the screenshots. I could not open the live site from
this environment, so nothing is from the site's CSS; **verify estimated rows in browser dev tools** before
final polish.

The reference is **dark / purple**, so the MUI theme is `mode: 'dark'`. Depth is created with colour steps;
**no box shadows are visible anywhere**.

## 1. Colour

| Token | Hex | Used for | Basis |
|---|---|---|---|
| `page` | `#4718ac` | page + header background | Measured |
| `navBar` | `#341282` | category nav strip (60 px) | Measured |
| `surface` | `#351183` | checkout header, cart/summary panels | Measured |
| `surfaceInset` | `#2f0f73` | cart item row inside a panel | Measured |
| `surfaceInput` | `#2a0e69` | text inputs in checkout panels | Measured |
| `filterPanel` | `#5825cc` | filter sidebar (lighter than page) | Measured |
| `filterInput` | `#461ea3` | inputs/selects in filter sidebar | Measured |
| `chip` | `#2c0e6c` | filter chips ("Rūšis (1)") | Measured |
| `card` | `#1f0b4f` | product card body | Measured |
| `footer` | `#150733` | footer background | Measured |
| `yellow` | `#fad318` | primary CTA, checked checkbox, "clear all" link | Measured |
| `blue` | `#4101ff` | promo CTA on banners | Measured |
| `green` | `#84e916` | cashback ("5% grįžta") + discount % | Measured |
| `mint` | `#63e3c1` | "cashback" corner badge on card cover | Measured |
| `red` | `#d22252` | cart count bubble | Measured |
| `stepActive` / `stepInactive` | `#23c299` / `#8670b5` | checkout stepper | Measured |
| `textPrimary` | `#ffffff` | headings, prices | Measured |
| `textSecondary` | `#dcd8e6` | footer links | Measured |
| `textMuted` | `#b3aac9` | footer placeholder / helper text | Measured |
| `placeholder` | `#ad8fe4` | search placeholder | Measured (one sample) |
| `regionTeal` / `regionPink` | `#63e3c1` / `#ff6f9f` | region label on card (e.g. "VISAS PASAULIS" / "JAV") | **Estimated** (text too thin to sample; teal reuses the badge colour) |
| card border | `#3c2198` | 1 px card outline | Measured (outer pixel; image art overlaps) |

MUI mapping: `primary` = yellow (black text), `secondary` = blue (white text), `success` = green,
`info` = mint, `error` = red, `background.default` = page, `background.paper` = surface.

## 2. Typography
- **Family:** `Montserrat` (+ Helvetica/Arial fallback). **Estimated.** The original is a geometric sans
  that looks like a Gotham/Gilroy relative and is licensed; Montserrat is the closest free Google font.
  Load weights 500/600/700/800. **Decision: keep Montserrat.**
- Weights: headings/prices 700-800, body 500-600, **nearly everything is bold-ish**. Estimated.
- Scale (all **estimated** from glyph heights): H1 34 px/700 (page title "El. pinigų…"), section heading
  34 px (e.g. "Rekomenduojama tau"; we use h2 28 px for blocks), H3 22, H4 18 (nav links, header text),
  body 16, body2 14 (card title, footer links, category labels), caption 13 (card meta, cashback), price 22/800.
- Buttons: 16 px/700, **no uppercase** except the blue promo CTA (uppercase). Estimated.

## 3. Spacing and layout
- Spacing base **8 px** (MUI `spacing: 8`). Estimated; gaps measured at 24-25 px fit a 3 x 8 grid.
- Container max width **1440 px**, centred (229 -> 1669 px at 1893 px viewport). Measured.
- Header **108 px** + category nav **60 px**; checkout header 110 px. Measured.
- Search input **660 x 68 px**, 1 px white-ish border, sharp corners. Measured.
- Filter sidebar **264 px** wide, gap to results **24 px**. Measured.
- Product card **267 px** wide, gap **24 px**, 5 per row at 1440. Measured.
- Hero banner **379 px** tall, full-bleed: one wide main slide + 3 narrow promo tiles (~190 px each). Measured.
- Category shortcut strip: items **126 px** apart, 40 px icon + 14 px bold label. Measured.

## 4. Radius and elevation
- Radius: cards/panels **0-2 px**, buttons/inputs **2 px**, chips **pill (18 px)**, checkbox **2 px**. Estimated
  (corners are visually almost square; chips look fully rounded).
- Elevation: **none**. Use the surface colour ladder: `page` -> `surface` -> `surfaceInset`; `filterPanel` and
  `card` are one-off surfaces. No `box-shadow`; MUI `Paper` has `elevation=0` and `backgroundImage: none`
  so MUI's dark-mode overlay does not tint panels. Measured (absence) / estimated (radius).

## 5. Structure

**Header** (108 px, `page` bg): left wordmark -> centred-left search (660 px) -> locale ("Lietuvių | AED") ->
heart/wishlist -> cart (with red count bubble) -> "Sign in | Register". Below it a **nav strip** (60 px,
`navBar` bg): hamburger "Categories" + text links (cheap games, software, gift cards, top-ups, promos).
**Checkout header** is reduced: wordmark + 3-step stepper (Cart / Payment / Receive item) + locale; no search.

**Footer** (`footer` bg `#150733`): 7 columns (About, Buying, Help, Community, Business, Follow us, app store
badges) -> reviews row (rating stars) -> newsletter input + white "Subscribe" button -> locale selector bottom-right.
White 15 px links at `textSecondary`.

**Hero:** wide promotional image slide with a text headline and a blue uppercase CTA, plus three vertical
promo tiles on the right. In our app the images come from the `banners` table (see ARCHITECTURE.md).

**Category strip:** horizontally scrollable row of icon + label shortcuts, with chevrons at both ends.

## 6. Component anatomy

**Product card** (267 px wide, `card` bg, 1 px border, square). Top to bottom:
1. Cover image, portrait ratio about 267 x 337 (cover art fills it).
2. Overlay badge bottom-left of the cover: **mint "cashback" tag** (`+` icon + label, 32 px high).
3. **Platform strip** (about 27 px, dark bar, icon + platform name, e.g. "PSN", "Xbox Live").
4. Body (padding about 16 px): title (14 px/700, single line, ellipsis) -> region label (13 px/700 uppercase,
   teal or pink) -> price row: "From" (13 px) + struck-through original price + discount `-9%` in green ->
   **price 22 px/800** with info icon -> cashback line `5% cashback` in green 13 px/700.
5. Optional yellow footer button (seen on a Roblox card: "view/add to cart" style).

**Buttons:** primary = yellow `#fad318`, black text, 42 px high (full-width in summary panel, 354 x 42);
secondary/promo = blue `#4101ff` uppercase; outline = 1 px white border, transparent; text link = yellow.
**Chips:** `chip` bg, white 600 text, 36 px high, pill, trailing chevron; "Clear all" is a yellow text button.
**Inputs:** `filterInput`/`surfaceInput` fill, no visible border (white 1 px on focus), 48 px high, bold
placeholder `#ad8fe4`. Search and newsletter inputs are the exception: transparent fill + 1 px white border.
**Select:** same as input with trailing chevron. **Checkbox:** 24 px square, 2 px radius, unchecked = light
outline, checked = yellow fill with dark tick. **Price range:** two inputs separated by "-".
**Discount badge:** inline `-9%` text in `green` next to a struck-through price (not a filled badge).
**Cashback badge:** mint filled tag on the cover, black text. **Cart bubble:** 16 px red circle, white number.
**Stepper:** numbered circles (active `#23c299`, inactive `#8670b5`) joined by 1 px lines.
**Panels:** `surface` bg, 24 px padding, title 18 px/700; inner rows use `surfaceInset`.

## 7. Placeholder wordmark and assets
No Eneba logo, artwork or icons are copied. The wordmark is **text only** (**decided:** "KEYMART", 800 weight,
white, lowercase optional) rendered by a `<Logo />` component so it can be renamed in one place. Product
covers, banners and platform logos are seeded as generated placeholder images/gradients; icons come from
`@mui/icons-material`.

## 8. Component inventory (build list)

Layout: `AppHeader`, `CategoryNav`, `Logo`, `SearchBar` (+ `SuggestDropdown`), `LocaleSwitch` (static EUR),
`CartButton` (+ badge), `UserMenu`, `AppFooter`, `PageContainer` (1440 max), `CheckoutHeader` + `Stepper`.
Home: `HeroBanner` (main + 3 tiles), `CategoryStrip`, `ProductCarousel` (block with title + info icon).
Catalog: `FilterSidebar` (price range, select, checkbox group with counts), `FilterChips`, `SortSelect`,
`ResultCount`, `ProductGrid`, `Pagination`.
Shared: `ProductCard` (+ `PlatformStrip`, `CashbackBadge`, `PriceBlock`, `DiscountText`), `Button` variants,
`Chip`, `TextField`, `Select`, `Checkbox`, `Panel`, `Skeletons`, `EmptyState`, `ErrorState`, `Toast`.
Product page: `ProductGallery`, `ProductInfo`, `OfferList` / `OfferRow` (seller, price, buy), `RegionBadge`.
Cart/checkout: `CartPanel`, `CartLine` (qty +/-, remove), `OrderSummary`, `StripePaymentForm`, `OrderKeyCard` (reveal/copy key).
Account: `LoginForm`, `RegisterForm`, `OrdersList`, `OrderDetail`.

## 9. Measured vs estimated summary
**Measured:** all surface/brand colours in section 1 (except the two region text colours), container width, header and nav
heights, search size, filter width, card width and gaps, hero height, category spacing, card anatomy order.
**Estimated:** font family and every font size/weight, border radii, chip pill shape, spacing base, card
padding, platform-strip height, region text colours, responsive breakpoints (not in the screenshots;
default MUI breakpoints are assumed), hover/focus states, icon set.
