import type { OrderDetail, User } from '../../types/api.types';

/**
 * The variables of the two EmailJS templates (docs/EMAIL.md). One interface per template: the AUTH template is shared by the welcome
 * and the verification e-mail, the ORDER template stands alone. Every value is a string, because EmailJS substitutes text.
 * There is deliberately NO field for a game key, a card detail or a password.
 */
export interface AuthTemplateParams {
  to_name: string;
  to_email: string;
  email_subject: string;
  email_heading: string;
  email_message: string;
  action_text: string;
  action_url: string;
  /** Empty string = the template hides the expiry line. */
  expiry_message: string;
  company_name: string;
  support_email: string;
  current_year: string;
}

export interface OrderTemplateParams {
  to_name: string;
  to_email: string;
  order_number: string;
  order_date: string;
  /** HTML table rows. Built only by buildOrderItemsHtml, which escapes every value. Rendered with {{{order_items}}}. */
  order_items: string;
  subtotal: string;
  discount: string;
  total_amount: string;
  currency: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  company_name: string;
  support_email: string;
  order_details_url: string;
  current_year: string;
}

/** What the callers pass in. */
export interface RegistrationEmailData {
  user: Pick<User, 'email' | 'displayName'>;
}

export interface OrderConfirmationEmailData {
  order: OrderDetail;
  user: Pick<User, 'email' | 'displayName'>;
}

/**
 * sent     EmailJS accepted the message
 * skipped  EmailJS is not configured (the app works the same)
 * invalid  a required value was missing or malformed: nothing was sent
 * failed   EmailJS or the network refused
 */
export type EmailResult =
  | { status: 'sent' }
  | { status: 'skipped' }
  | { status: 'invalid'; missing: string[] }
  | { status: 'failed' };
