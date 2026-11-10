import { z } from 'zod';

/**
 * Client-side rules for the sign-in and sign-up forms. They save a round trip and say what is wrong early: the server validates
 * everything again and is the authority (its messages are shown too).
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128; // the server's limit: also keeps a hash from becoming a denial-of-service lever

// Deliberately simple: one @, something on both sides, a dot in the domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .refine(
    (value) => value.length <= 254 && EMAIL.test(value),
    'Enter a valid email address, like name@example.com',
  );

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Enter at least 2 characters')
    .max(50, 'Use at most 50 characters'),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
