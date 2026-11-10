# Visual comparison with the reference (P17)

**What was compared.** The reference is the screen recording of eneba.com/lt that came with the task (1920 x 826 frames, sampled every 4 s: home, cart popover,
register, product, store, "added to cart" dialog, cart). The live site cannot be opened from the development sandbox (the network proxy refuses `www.eneba.com`),
so the recording is the only reference. Ours were captured with `frontend/e2e/screens.e2e.cjs` at **1920 px (desktop)** and **390 px (phone)**.

| Folder | Content |
|---|---|
| `reference/` | the recording's frames used here (`ref-001` home, `ref-007` cards, `ref-013` product, `ref-014` store, `ref-006` register, `ref-016` cart, ...) |
| `before/` | our screens before this task (commit `28c0e2c`, P16), 7 screens x desktop and phone |
| `after/` | the same screens after the fixes |
| `compare/before/`, `compare/after/` | reference (left) next to ours (right), desktop, one image per screen |
| `compare/mobile-before.jpg`, `compare/mobile-after.jpg` | our phone screens side by side (home, store, product, cart) |

Rebuild: `python3 scripts/compare_screens.py docs/screens/after docs/screens/compare/after` (needs Pillow).

**Limits, stated plainly.**
- **No phone reference.** The recording is a desktop browser (it only shows the phone navigation drawer). The phone screens were checked against the desktop reference's patterns and the checks in docs/DESIGN_TOKENS.md, not against eneba.com on a phone.
- **Colours from the recording are not used.** H.264 video shifts colours (page background measures `#3c06a2`-`#410bab` in the video vs the token `#4718ac` taken from lossless screenshots; yellow `#f4d820` vs `#fad318`). The tokens stay as the colour source of truth; the recording was used for **layout, sizes, type and anatomy**.
- The recording is of the real site with real catalogue art; ours uses generated placeholder covers, so images differ by design.

## Differences found, and what was done

### Header
| | Reference | Before | After |
|---|---|---|---|
| Header height | 128 px | 104 px | **128 px** (`$layout-header-height`) |
| Search box | 660 x 75 px, 1 px white border, 20 px bold placeholder | 760 x 56 px, 16 px | **660 x 76 px**, 18 px/700 (`$layout-search-*`, `$font-size-search`) |
| Account area | user icon + plain text "Log in \| Register" | yellow "Sign in" link + filled yellow "Register" button | **icon + "Sign in \| Register" text links** |
| Logo | mark + wordmark, ~48 px | text, 32 px | text wordmark 40 px (no Eneba artwork is copied) |
| Locale switch, wishlist heart | present | absent | **not built**: no feature behind them (region/currency, wishlist); faking controls was rejected |

### Category bar
| | Reference | Before | After |
|---|---|---|---|
| Height | 64 px | 60 px | **64 px** (`$layout-nav-height`) |
| Type | 17 px / 600, no underline | 16 px, yellow underline on the current item | **17 px / 600** (`$font-size-nav`); hover and current item turn yellow, no underline |
| Hamburger "Categories" | present | grid icon | grid icon (kept) |

### Home
| | Reference | Before | After |
|---|---|---|---|
| Hero | full-bleed, touches the category bar, main slide + 3 promo tiles | boxed in the 1392 px column, 40 px gap under the bar | **full-bleed** (`full-bleed` mixin), touches the bar, text lines up with the container (`container-inset`); the promo tiles are catalogue content, not built |
| Container | content column 1440 px | 1392 px (padding inside the max width) | **1440 px** content column (padding sits outside `$layout-container-max`) |
| Shortcut icon strip, "Recommended" info icon | present | absent | not built (data-driven content that would need a new backend block) |
| Rail cards | 267 px wide | 230 px | **267 px** |

### Product card (home, store, search)
| | Reference | Before | After |
|---|---|---|---|
| Platform strip | translucent bar over the cover's bottom edge, centred | solid bar below the cover | **overlay on the cover, centred**, 32 px |
| Title | 15 px / 700, two lines | 14 px, one line | **15 px / 700, two lines** (`$font-size-card-title`), full title as tooltip |
| Region label | teal for Global, pink otherwise, 14 px/700 uppercase | teal for everything, 13 px | **teal for Global, pink otherwise** (`--color-region-pink`), 14 px |
| From / price | 14 px "From" line, 22 px price | 13 px / 22 px | `$font-size-card-meta` / `$font-size-card-price` |
| Cashback badge and line, wishlist heart, hover "Add to cart" + "View offers" | present | absent | **not built**: this shop has no cashback or wishlist; the hover buttons would shift the grid row (the card is one link) |

### Store
| | Reference | Before | After |
|---|---|---|---|
| Results header | "Results found: N" left, sort right, one row above the grid | big toolbar with search and sort, count under it | **count left, sort right** on one row above the grid; search + Filters button above |
| Filter groups | thin separators, 18 px bold titles, outlined square checkboxes, counts right | no separators, 16 px titles, native accent-colour boxes | **separators, 18 px titles, outlined square checkboxes with a yellow check** (token colours) |
| Collapsible groups (chevrons) | yes | no | not built (groups are short; every group stays visible) |

### Product page
| | Reference | Before | After |
|---|---|---|---|
| Breadcrumbs | Store > Categories > ... | none | **Store > Platform > Game** |
| Purchase panel | right-hand panel: price, buy button, "+N offers from" | none (offers table only) | **buy box**: lowest price, "Add to cart" for the cheapest offer, "N offers from", delivery note |
| Rating stars, denomination tiles, PayPal button, "Safe checkout" box | present | absent | not built (no product ratings or denominations in the API; no PayPal) |

### Sign-in / register
| | Reference | Before | After |
|---|---|---|---|
| Page | darkest purple, huge headline left, form panel right | form card on the normal page | **dark page (`--color-auth-page`), 96 px headline, panel at the right** |
| Inputs | dark filled fields | lighter filled | **darker fill** (`--input-bg` on the panel) |
| Social sign-in buttons | Google / Facebook / Apple | absent | not built (no OAuth) |

### Cart and checkout
| | Reference | Before | After |
|---|---|---|---|
| Header | reduced: wordmark + 3-step progress (Cart / Payment / Get your product) | full header | **reduced `CheckoutHeader`** with the progress line; compact footer |
| Content width | narrow centred column with panels | full width | **960 px column** (`$layout-checkout-max`), panels on the surface colour |
| Line items | thumbnail, "Sold by", title, stepper, price | no thumbnail | **thumbnail** (the generated cover) beside each line, also in the order summary |
| Total | 28 px / 800 | 20 px | **28 px** (`$font-size-total`) |
| "Added to cart" dialog and mini-cart popover | modal / popover | toast | **not built**: the non-blocking toast was kept on purpose (no focus trap interrupting browsing) |
| E-mail field, service fee, cashback | present | absent | not built (the account e-mail is used; no fees) |

## How the fixes were made (tokens, not one-off CSS)
- **New tokens** in `frontend/src/styles/variables.scss`, mirrored as CSS custom properties in `global.scss`: header/nav/search/checkout dimensions, the type scale (`nav`, `search`, `card-title`, `card-meta`, `card-price`, `section-title`, `total`), a spacing scale, `auth-page`, `region-pink`, `step-active/inactive`, `--page-pad-y`, `--input-bg`.
- **New mixins** in `mixins.scss`: `full-bleed` and `container-inset` (a full-width section whose content still lines up with the container).
- Components read these tokens; no pixel value was added in a component that exists elsewhere as a token.
- Measured after the change (DOM, 1920 px): header 128, nav 64, search 660 x 76 (18 px), nav links 17 px, hero 1920 wide with 0 gap to the bar, card 267 wide, card title 15 px two lines, content column starts at x = 240 (centred 1440).

## Found along the way
- **Real bug (not visual parity):** the product page was wider than a phone screen (scroll width 673 px at 390). The grid had no `minmax(0, 1fr)` column, and the offers table's visually-hidden header text, being absolutely positioned, escaped its scroll container. Fixed (both), and the phone screenshots show the page at 390 px.
- The stepper's inactive labels failed the contrast check (axe) until they used the muted text colour; axe-core now reports **no violations** on all ten pages tested, including the new checkout header.
