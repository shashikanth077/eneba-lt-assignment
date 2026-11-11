# E-mail (EmailJS): two templates

Exactly **two** EmailJS templates, one service:

| Template | Id variable | Used for | Sent by |
|---|---|---|---|
| **AUTH** (`docs/email-templates/auth.html`) | `EMAILJS_AUTH_TEMPLATE_ID` | welcome e-mail **and** e-mail verification (same HTML, different variables) | welcome: the browser; verification: the **API** |
| **ORDER** (`docs/email-templates/order.html`) | `EMAILJS_ORDER_TEMPLATE_ID` | order confirmation | the browser, only for an order the server reports as paid |

Previews (rendered by `scripts/render_email_templates.cjs`): `docs/email-templates/previews/*-desktop.png` and `*-mobile.png`. Example payloads:
`docs/email-templates/examples/{registration,verification,order-confirmation}.json`.

## Who sends what, and why

- **Verification must not be sent from the browser.** The link carries a one-time secret. If the browser built or received it, whoever types
  *someone else's* address into the sign-up form could verify it themselves. So the **API** creates the token (256 random bits), stores only
  its SHA-256 (`email_verifications`), and sends the e-mail through EmailJS's REST API with the **private** key. The browser's
  `sendVerificationEmail()` only asks the API to send a fresh link (`POST /api/auth/resend-verification`, limited to 5 per hour per account).
- Link: `<APP_URL>/verify-email?token=...`. Valid 24 h (`EMAIL_VERIFICATION_TTL_HOURS`), single use, a new link replaces the old ones.
  Outside local development `APP_URL` must be `https://` or nothing is sent. Unknown, expired and used tokens get the same answer.
- **Welcome e-mail** and **order confirmation** contain nothing secret, so they are sent with the public key from the browser, as before.
- The order e-mail is triggered only after `GET /api/orders/{id}` says `paid` (the webhook has verified the payment); the browser's own idea of
  the payment is never used. No game key, card detail or password is in any e-mail; the order e-mail's note says keys are in the account.

## Code

```
frontend/src/services/email/
  emailConfig.ts    reads VITE_EMAILJS_* (public values only); null = not configured, e-mails are skipped
  emailTypes.ts     AuthTemplateParams, OrderTemplateParams, EmailResult
  emailHelpers.ts   escapeHtml, buildOrderItemsHtml (escapes every value), missing-value and URL checks
  emailService.ts   sendRegistrationEmail, sendVerificationEmail, sendOrderConfirmationEmail (none throws; returns sent | skipped | invalid | failed)
backend/src/Mail/ + src/Services/EmailVerificationService.php   token, hash, expiry, EmailJS REST call
```

Components never call EmailJS. Sagas call the service. Errors are logged without the address or the payload.

## Configure EmailJS (dashboard)

1. **Email Services**: add a service (Gmail or another). Its id is `EMAILJS_SERVICE_ID`.
2. **Email Templates** > Create > **AUTH**: switch the editor to **Code editor**, paste `docs/email-templates/auth.html`. Settings:
   *Subject* `{{email_subject}}`, *To email* `{{to_email}}`, *From name* `{{company_name}}`. Save; its id is `EMAILJS_AUTH_TEMPLATE_ID`.
3. Create **ORDER** the same way with `docs/email-templates/order.html`. *Subject* `Order Confirmation #{{order_number}} – {{company_name}}`,
   *To email* `{{to_email}}`. Its id is `EMAILJS_ORDER_TEMPLATE_ID`.
4. **Account > General**: copy the **Public key** (`EMAILJS_PUBLIC_KEY`). **Account > Security**: enable *Allow EmailJS API for non-browser
   applications* and copy the **Private key** (`EMAILJS_PRIVATE_KEY`, backend only).
5. Put the values in the two env files (never commit them):

| `backend/.env` (or root `.env` for Docker) | `frontend/.env` |
|---|---|
| `EMAILJS_SERVICE_ID`, `EMAILJS_AUTH_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `MAIL_COMPANY_NAME`, `SUPPORT_EMAIL`, `EMAIL_VERIFICATION_TTL_HOURS` | `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_EMAILJS_AUTH_TEMPLATE_ID`, `VITE_EMAILJS_ORDER_TEMPLATE_ID`, `VITE_COMPANY_NAME`, `VITE_SUPPORT_EMAIL` |

   (Renamed in P19: `VITE_EMAILJS_WELCOME_TEMPLATE_ID` is now `VITE_EMAILJS_AUTH_TEMPLATE_ID`.)
6. In the template editor use **Test It** with `docs/email-templates/examples/*.json`.

Template syntax used: `{{x}}` (escaped), `{{{order_items}}}` (raw HTML: the app builds and escapes those rows), and `{{#expiry_message}}...{{/expiry_message}}`
(shown only when the value is not empty). **Not verified against a live EmailJS account** (none was available while building): confirm the
expiry box disappears for the welcome e-mail and that the order rows render as a table, using Test It.

## Variables

AUTH: `to_name to_email email_subject email_heading email_message action_text action_url expiry_message company_name support_email current_year`.
ORDER: `to_name to_email order_number order_date order_items subtotal discount total_amount currency payment_method payment_status order_status company_name support_email order_details_url current_year`.
`subtotal` is the sum of the lines, `total_amount` what the server charged, `discount` their difference (this shop has no coupons, so it is
normally 0). All amounts are formatted by the app.

## Demo accounts

Created by `php bin/setup.php` (the seeder; safe to repeat, never overwrites an existing account). Both are already verified.

| Email | Password |
|---|---|
| `demo.buyer@keymart.test` | `Demo-Buyer-2027` |
| `demo.shopper@keymart.test` | `Demo-Shopper-2027` |

They are public on purpose (they hold no money and no real keys). Do not seed them into a real production database.
Each has a realistic history (paid orders with delivered keys, created once by the seeder, not repeated on re-runs): *demo.buyer* two orders, *demo.shopper* one. Both can use **My account** (edit profile) and **My orders**. **Change password is refused for them** (`403 demo_account`), because the accounts are shared and the first visitor would lock everybody else out; register an own account to try it.

## Decisions and limits

- **Verification is not enforced.** Unverified buyers can still shop and pay; the layout shows a banner with "Send a new link". Blocking checkout
  would be one check in `CheckoutService`; it was left out to keep the existing flows and the e2e test unchanged. Existing accounts start unverified.
- **The order e-mail's HTML rows are built in the browser** (escaped), not by the backend, because the browser sends it. Sending order
  confirmations from the webhook handler is the stronger design (no dependence on the buyer's browser staying open) but it touches the payment
  transaction code; recorded as a follow-up.
- **Plain-text fallback:** EmailJS sends one HTML body and offers no separate text part. What is provided instead: a hidden preheader, a visible
  fallback link under every button, and no content that exists only as an image.
- **No images:** the logo is the existing text wordmark, so nothing is blocked by "load images" settings and there are no assets to host.
- Outlook (Windows) ignores rounded corners; the buttons stay rectangular there but remain readable and clickable.
- The REST mailer has no automated test (it would call the real service); the token logic is covered by `backend/tests/EmailVerificationTest.php` with a recording mailer.

## Test checklist

Send each of the three e-mails (registration, verification, order confirmation) to every client below.

- [ ] Gmail (web): renders at 600 px, button is violet and rounded, link fallback visible, no clipped footer.
- [ ] Gmail (Android / iOS app): single column, no horizontal scroll, text readable without zoom.
- [ ] Outlook (desktop, Windows): table layout intact, button clickable, fonts fall back to Arial.
- [ ] Outlook.com / Outlook mobile.
- [ ] Apple Mail (macOS and iOS), including dark mode: the container stays light (`color-scheme: light only`).
- [ ] Welcome e-mail shows **no** expiry box; verification e-mail shows "expires in 24 hours".
- [ ] The inbox preview line shows the message, not "View in browser" text.
- [ ] Product name `<b>x</b>` appears as text, not bold (escaping).
- [ ] Order e-mail: totals align on the right; no key anywhere; "View My Orders" opens the right order after sign-in.
- [ ] Verification link: opens `/verify-email`, works once, second use shows the "invalid, expired or used" message; expired link refused.
- [ ] Spam folder: not there after the first test (verify the sending domain's SPF/DKIM in the mail provider).

## "The recipients address is empty" (checked in P35)

The code passes the signed-in account's own address in every request (`to_email`, plus the aliases `email` and `user_email`), for the welcome e-mail,
the verification e-mail (API, REST) and the order confirmation. An address that is empty or malformed is refused **before** calling EmailJS
(`email.invalid` in the browser, `mail.verification.invalid_recipient` on the API) and is never logged. If EmailJS itself still answers
"The recipients address is empty", the dashboard template is the cause: open the template, **Settings tab**, and make *To email* exactly
`{{to_email}}` (a literal address or a different variable name leaves it empty). Do this for BOTH templates.
