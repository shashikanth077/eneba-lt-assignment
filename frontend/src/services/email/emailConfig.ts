const env = import.meta.env;

export interface EmailConfig {
  serviceId: string;
  publicKey: string;
  authTemplateId: string;
  orderTemplateId: string;
  companyName: string;
  supportEmail: string;
}

/**
 * The public side of the EmailJS settings: the service id, the two template ids and the PUBLIC key (safe in a browser by design).
 * The private key exists only in the backend (EMAILJS_PRIVATE_KEY). Returns null when anything required is missing: e-mails are then
 * skipped, and the app works the same.
 */
export function emailConfig(): EmailConfig | null {
  const config = {
    serviceId: env.VITE_EMAILJS_SERVICE_ID ?? '',
    publicKey: env.VITE_EMAILJS_PUBLIC_KEY ?? '',
    authTemplateId: env.VITE_EMAILJS_AUTH_TEMPLATE_ID ?? '',
    orderTemplateId: env.VITE_EMAILJS_ORDER_TEMPLATE_ID ?? '',
    companyName: env.VITE_COMPANY_NAME || 'KEYMART',
    supportEmail: env.VITE_SUPPORT_EMAIL || 'support@keymart.example',
  };
  const required = [
    config.serviceId,
    config.publicKey,
    config.authTemplateId,
    config.orderTemplateId,
  ];
  return required.every((value) => value !== '') ? config : null;
}
