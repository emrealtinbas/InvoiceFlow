import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FormAlert } from '@/features/auth/components/form-alert';
import { FormField } from '@/features/auth/components/form-field';
import { PasswordField } from '@/features/auth/components/password-field';
import { describeLoginError } from '@/features/auth/lib/error-messages';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas/auth-schemas';
import { useAuth } from '@/features/auth/session/context';
import { buildRegisterPath, safeReturnPath, type SessionEndReason } from '@/features/auth/session';

const SESSION_MESSAGES: Record<SessionEndReason, { tone: 'info' | 'error'; message: string }> = {
  expired: {
    tone: 'error',
    message: 'Your session expired. Sign in again to continue.',
  },
  unauthorized: {
    tone: 'error',
    message: 'Your session is no longer valid. Sign in again to continue.',
  },
  'signed-out': {
    tone: 'info',
    message: 'You have signed out. Sign in again when you are ready.',
  },
};

export function LoginPage() {
  const { signIn, endReason } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | undefined>();
  const returnTo = safeReturnPath(searchParams.get('returnTo'));
  const registered = searchParams.get('registered') === '1';

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const sessionMessage = endReason ? SESSION_MESSAGES[endReason] : null;

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);
    setCorrelationId(undefined);
    clearErrors();

    try {
      await signIn({ email: values.email, password: values.password });
      navigate(returnTo ?? '/dashboard', { replace: true });
    } catch (error) {
      const description = describeLoginError(error);
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
          Welcome back
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Sign in to InvoiceFlow
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Use the e-mail address and password for your InvoiceFlow account.
        </p>
      </header>

      {registered ? (
        <FormAlert tone="success">
          Account created. Sign in with your new credentials to continue.
        </FormAlert>
      ) : null}

      {!registered && sessionMessage ? (
        <FormAlert tone={sessionMessage.tone}>{sessionMessage.message}</FormAlert>
      ) : null}

      {formError ? <FormAlert correlationId={correlationId}>{formError}</FormAlert> : null}

      <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}>
        <FormField
          id="login-email"
          label="E-mail address"
          type="email"
          autoComplete="email"
          registration={register('email')}
          error={errors.email?.message}
          disabled={isSubmitting}
        />

        <PasswordField
          id="login-password"
          label="Password"
          autoComplete="current-password"
          registration={register('password')}
          error={errors.password?.message}
          disabled={isSubmitting}
        />

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </form>

      <div className="space-y-4 border-t pt-5">
        <p className="text-sm text-muted-foreground">
          Need an account?{' '}
          <Link
            to={buildRegisterPath(returnTo)}
            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Create one
          </Link>
          .
        </p>

        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p>
            The access token is held in memory for this tab only. Reloading the page ends the
            session and requires signing in again.
          </p>
        </div>
      </div>
    </div>
  );
}
