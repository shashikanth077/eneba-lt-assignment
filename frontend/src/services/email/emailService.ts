import emailjs from '@emailjs/browser';
import apiClient from '../api/apiClient';
import { endpoints } from '../api/apiEndpoints';
import { formatCurrency } from '../../utils/formatCurrency';
import { emailConfig, type EmailConfig } from './emailConfig';
import {
  buildOrderItemsHtml,
  currentYear,
  formatOrderDate,
  isHttpUrl,
  missingValues,
  siteUrl,
} from './emailHelpers';
import type {
  AuthTemplateParams,
  EmailResult,
  OrderConfirmationEmailData,
  OrderTemplateParams,
  RegistrationEmailData,
} from './emailTypes';

/**
 * The only module that talks to EmailJS. Components and sagas call the three functions below; none of them throws, and a failed
 * e-mail never breaks signing up or paying. Only the PUBLIC key is used here (docs/ARCHITECTURE.md): anything sent from a browser
 * is public in effect, so these e-mails carry no key, no link with a secret and no payment detail.
 */

type Kind = 'registration' | 'order';

async function deliver(
  kind: Kind,
  templateId: (config: EmailConfig) => string,
  build: (config: EmailConfig) => AuthTemplateParams | OrderTemplateParams,
  required: string[],
): Promise<EmailResult> {
  const config = emailConfig();
  if (config === null) return { status: 'skipped' };
  const params: Record<string, string> = { ...build(config) };
  const missing = missingValues(
    Object.fromEntries(required.map((name) => [name, params[name] ?? ''])),
  );
  const badLinks = Object.entries(params)
    .filter(([name, value]) => name.endsWith('_url') && !isHttpUrl(value))
    .map(([name]) => name);
  missing.push(...badLinks);
  if (missing.length > 0) {
    console.warn(`EmailJS ${kind} e-mail not sent: missing or invalid ${missing.join(', ')}`);
    return { status: 'invalid', missing };
  }
  try {
    await emailjs.send(config.serviceId, templateId(config), params, {
      publicKey: config.publicKey,
    });
    return { status: 'sent' };
  } catch {
    // Not logged with the error object: it can echo the request (address, names).
    console.warn(`EmailJS could not send the ${kind} e-mail`);
    return { status: 'failed' };
  }
}

/** Welcome e-mail after sign-up: the AUTH template, call to action = the homepage. */
export function sendRegistrationEmail({ user }: RegistrationEmailData): Promise<EmailResult> {
  return deliver(
    'registration',
    (config) => config.authTemplateId,
    (config): AuthTemplateParams => ({
      to_name: user.displayName,
      to_email: user.email,
      email_subject: `Welcome to ${config.companyName} – Your account is ready!`,
      email_heading: `Welcome aboard, ${user.displayName}!`,
      email_message: `Thank you for creating an account with ${config.companyName}. We're excited to have you with us. Explore our marketplace and discover great digital products and deals.`,
      action_text: 'Explore Marketplace',
      action_url: siteUrl('/'),
      expiry_message: '',
      company_name: config.companyName,
      support_email: config.supportEmail,
      current_year: currentYear(),
    }),
    ['to_name', 'to_email', 'action_url'],
  );
}

/**
 * Verification e-mail: the SAME AUTH template, but it is sent by the SERVER. The link holds a one-time secret, so it must not pass
 * through this browser: the backend creates the token, stores only its hash and sends the message (EMAILJS_PRIVATE_KEY, docs/EMAIL.md).
 * This function asks it to send a fresh link to the signed-in user's address.
 */
export async function sendVerificationEmail(): Promise<EmailResult> {
  try {
    await apiClient.post(endpoints.resendVerification);
    return { status: 'sent' };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Order confirmation: the ORDER template. Call it only for an order the SERVER reports as paid (the caller reads that from the API,
 * never from the browser's own idea of the payment). Keys are not part of the message.
 */
export function sendOrderConfirmationEmail({
  order,
  user,
}: OrderConfirmationEmailData): Promise<EmailResult> {
  if (order.status !== 'paid')
    return Promise.resolve({ status: 'invalid', missing: ['paid status'] });
  return deliver(
    'order',
    (config) => config.orderTemplateId,
    (config): OrderTemplateParams => {
      const subtotalCents = order.items.reduce(
        (sum, item) => sum + item.unitPriceCents * item.qty,
        0,
      );
      const discountCents = Math.max(0, subtotalCents - order.totalCents);
      return {
        to_name: user.displayName,
        to_email: user.email,
        order_number: String(order.id),
        order_date: formatOrderDate(order.paidAt ?? order.createdAt),
        order_items: buildOrderItemsHtml(order),
        subtotal: formatCurrency(subtotalCents, order.currency),
        discount: formatCurrency(discountCents, order.currency),
        total_amount: formatCurrency(order.totalCents, order.currency),
        currency: order.currency.toUpperCase(),
        payment_method: 'Card (Stripe)',
        payment_status: 'Paid',
        order_status: 'Confirmed',
        company_name: config.companyName,
        support_email: config.supportEmail,
        order_details_url: siteUrl(`/orders/${order.id}`),
        current_year: currentYear(),
      };
    },
    ['to_name', 'to_email', 'order_number', 'order_items', 'total_amount', 'order_details_url'],
  );
}
