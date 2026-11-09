/**
 * Client-side checks for the sign-in and sign-up forms. They only save a round trip and say what is wrong early: the server
 * validates everything again and is the authority (its messages are shown too).
 */
export type FieldErrors = Partial<Record<'displayName' | 'email' | 'password', string>>;

// Deliberately simple: one @, something on both sides, a dot in the domain. The server's check decides the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200; // argon2 would take more, but a limit keeps a hash from becoming a denial-of-service lever

export const validateEmail = (email: string): string | undefined => {
  const value = email.trim();
  if (value === '') return 'Enter your email address';
  if (value.length > 254 || !EMAIL.test(value))
    return 'Enter a valid email address, like name@example.com';
  return undefined;
};

export const validateDisplayName = (name: string): string | undefined => {
  const length = name.trim().length;
  if (length < 2) return 'Enter at least 2 characters';
  if (length > 50) return 'Use at most 50 characters';
  return undefined;
};

export function validateLogin(values: { email: string; password: string }): FieldErrors {
  return compact({
    email: validateEmail(values.email),
    password: values.password === '' ? 'Enter your password' : undefined,
  });
}

export function validateRegister(values: {
  displayName: string;
  email: string;
  password: string;
}): FieldErrors {
  return compact({
    displayName: validateDisplayName(values.displayName),
    email: validateEmail(values.email),
    password:
      values.password.length < PASSWORD_MIN
        ? `Use at least ${PASSWORD_MIN} characters`
        : values.password.length > PASSWORD_MAX
          ? `Use at most ${PASSWORD_MAX} characters`
          : undefined,
  });
}

function compact(errors: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message !== undefined));
}
