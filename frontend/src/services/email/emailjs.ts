import emailjs from '@emailjs/browser';
import type { OrderDetail, User } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatCurrency';

/**
 * EmailJS runs in the browser with a PUBLIC key (docs/ARCHITECTURE.md): anything sent through it is public in effect, so these emails
 * carry only what is safe to expose: a greeting, an order number, item names and the total. NEVER a game key, a link with a secret
 * or a password. `ReceiptParams` has no field that could hold a key, and `buildReceiptParams` copies fields one by one instead of
 * spreading the order, so a key cannot slip in by accident.
 */
const env = import.meta.env;

interface Config {
  serviceId: string;
  publicKey: string;
  welcomeTemplateId: string;
  orderTemplateId: string;
}

/** null when EmailJS is not configured: emails are then simply skipped (the app works the same, the screen confirmations remain). */
export function emailConfig(): Config | null {
  const config = {
    serviceId: env.VITE_EMAILJS_SERVICE_ID ?? '',
    publicKey: env.VITE_EMAILJS_PUBLIC_KEY ?? '',
    welcomeTemplateId: env.VITE_EMAILJS_WELCOME_TEMPLATE_ID ?? '',
    orderTemplateId: env.VITE_EMAILJS_ORDER_TEMPLATE_ID ?? '',
  };
  return Object.values(config).every((value) => value !== '') ? config : null;
}

export interface WelcomeParams {
  to_email: string;
  to_name: string;
}

export interface ReceiptParams {
  to_email: string;
  to_name: string;
  order_id: string;
  /** One line per item: "2 x Game name (Seller) - 12.34 EUR". */
  order_items: string;
  order_total: string;
}

export const buildWelcomeParams = (user: User): WelcomeParams => ({
  to_email: user.email,
  to_name: user.displayName,
});

export function buildReceiptParams(order: OrderDetail, user: User): ReceiptParams {
  return {
    to_email: user.email,
    to_name: user.displayName,
    order_id: String(order.id),
    order_items: order.items
      .map(
        (item) =>
          `${item.qty} x ${item.productName} (${item.sellerName}) - ${formatCurrency(item.unitPriceCents * item.qty, order.currency)}`,
      )
      .join('\n'),
    order_total: formatCurrency(order.totalCents, order.currency),
  };
}

async function send(
  templateId: (config: Config) => string,
  params: WelcomeParams | ReceiptParams,
): Promise<boolean> {
  const config = emailConfig();
  if (config === null) return false;
  try {
    await emailjs.send(
      config.serviceId,
      templateId(config),
      { ...params },
      { publicKey: config.publicKey },
    );
    return true;
  } catch (error) {
    // An email that does not go out must never break signing up or paying: log it and carry on.
    console.warn('EmailJS could not send the email', error);
    return false;
  }
}

export const sendWelcomeEmail = (user: User) =>
  send((config) => config.welcomeTemplateId, buildWelcomeParams(user));

export const sendOrderReceipt = (order: OrderDetail, user: User) =>
  send((config) => config.orderTemplateId, buildReceiptParams(order, user));
