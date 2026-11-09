/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_EMAILJS_SERVICE_ID?: string;
  readonly VITE_EMAILJS_PUBLIC_KEY?: string;
  readonly VITE_EMAILJS_WELCOME_TEMPLATE_ID?: string;
  readonly VITE_EMAILJS_ORDER_TEMPLATE_ID?: string;
}
