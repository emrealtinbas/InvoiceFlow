import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/features/auth/components/form-alert';
import { FormField } from '@/features/auth/components/form-field';
import { PasswordField } from '@/features/auth/components/password-field';
import { register as registerAccount } from '@/features/auth/api/contracts';
import { describeRegistrationError } from '@/features/auth/lib/error-messages';
import {
  PASSWORD_MIN_LENGTH,
  registerSchema,
  type RegisterFormValues,
} from '@/features/auth/schemas/auth-schemas';
import { buildLoginPath, safeReturnPath } from '@/features/auth/session';
import { useApiClient } from '@/lib/api';

const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters with an uppercase letter, lowercase letter, number, and symbol.`;

export function RegisterPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get('returnTo'));
  const [formError, setFormError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | undefined>();

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: RegisterFormValues): Promise<void> {
    setFormError(null);
    setCorrelationId(undefined);
    clearErrors();

    try {
      await registerAccount(apiClient, {
        email: values.email,
        password: values.password,
      });

      // Registration never signs the user in. The success state is shown on the login page.
      navigate(buildLoginPath(returnTo, { registered: true }), { replace: true });
    } catch (error) {
      const description = describeRegistrationError(error);
      setFormError(description.message);
      setCorrelationId(description.correlationId);

      if (description.fields.email) {
        setError('email', { type: 'server', message: description.fields.email });
      }

      if (description.fields.password) {
        setError('password', { type: 'server', message: description.fields.password });
      }
    }
  }

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase">
          Get started
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Create your InvoiceFlow account
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Registration creates a standard user account. You will sign in after the account is
          created.
        </p>
      </header>

      {formError ? <FormAlert correlationId={correlationId}>{formError}</FormAlert> : null}

      <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="register-email"
          label="E-mail address"
          type="email"
          autoComplete="email"
          registration={register('email')}
          error={errors.email?.message}
          disabled={isSubmitting}
        />

        <PasswordField
          id="register-password"
          label="Password"
          autoComplete="new-password"
          registration={register('password')}
          error={errors.password?.message}
          hint={PASSWORD_HINT}
          disabled={isSubmitting}
        />

        <PasswordField
          id="register-confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          registration={register('confirmPassword')}
          error={errors.confirmPassword?.message}
          disabled={isSubmitting}
        />

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <p className="border-t pt-5 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          to={buildLoginPath(returnTo)}
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
