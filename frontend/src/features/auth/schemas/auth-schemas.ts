import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 320;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your e-mail address.')
  .max(EMAIL_MAX_LENGTH, `E-mail must be ${EMAIL_MAX_LENGTH} characters or fewer.`)
  .pipe(z.email('Enter a valid e-mail address.'));

/** Login accepts whatever password the account already has, within transport limits. */
export const loginPasswordSchema = z
  .string()
  .min(1, 'Enter your password.')
  .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`);

/** Mirrors ASP.NET Core Identity password rules configured by the API. */
export const registrationPasswordSchema = z
  .string()
  .min(1, 'Choose a password.')
  .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`)
  .superRefine((password, context) => {
    if (password.length === 0) {
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      context.addIssue({
        code: 'custom',
        message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      });
    }

    if (!/[A-Z]/.test(password)) {
      context.addIssue({ code: 'custom', message: 'Include an uppercase letter.' });
    }

    if (!/[a-z]/.test(password)) {
      context.addIssue({ code: 'custom', message: 'Include a lowercase letter.' });
    }

    if (!/[0-9]/.test(password)) {
      context.addIssue({ code: 'custom', message: 'Include a number.' });
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      context.addIssue({ code: 'custom', message: 'Include a symbol.' });
    }
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: registrationPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
