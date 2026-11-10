/**
 * Renders the two EmailJS templates with the example payloads and saves screenshots (desktop 700 px, phone 375 px) to
 * docs/email-templates/previews/. A tiny stand-in for EmailJS's Mustache: {{x}} escaped, {{{x}}} raw, {{#x}}...{{/x}} shown when x is not empty.
 * This is a layout preview, not a replacement for sending a real test mail (docs/EMAIL.md, checklist).
 *   cd frontend && NODE_PATH=$(npm root -g) node ../scripts/render_email_templates.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.resolve(__dirname, '../docs/email-templates');
const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function render(template, vars) {
  return template
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name, inner) => (vars[name] ? inner : ''))
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, name) => String(vars[name] ?? ''))
    .replace(/\{\{(\w+)\}\}/g, (_, name) => escape(vars[name] ?? ''));
}

const previews = [
  ['auth.html', 'registration', 'registration'],
  ['auth.html', 'verification', 'verification'],
  ['order.html', 'order-confirmation', 'order-confirmation'],
];

(async () => {
  fs.mkdirSync(path.join(DIR, 'previews'), { recursive: true });
  const browser = await chromium.launch();
  for (const [file, example, name] of previews) {
    const vars = JSON.parse(fs.readFileSync(path.join(DIR, 'examples', `${example}.json`), 'utf8'));
    const html = render(fs.readFileSync(path.join(DIR, file), 'utf8'), vars);
    for (const [label, width] of [['desktop', 700], ['mobile', 375]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(html);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: path.join(DIR, 'previews', `${name}-${label}.png`), fullPage: true });
      console.log(`${name} ${label}: horizontal overflow ${overflow}px`);
      await page.close();
    }
  }
  await browser.close();
})();
