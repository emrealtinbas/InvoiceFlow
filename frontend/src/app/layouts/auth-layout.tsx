import { Suspense } from 'react';

import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Outlet } from 'react-router-dom';

import { AppLogo } from '@/components/shared/app-logo';
import { LoadingState } from '@/components/shared/loading-state';

/** Unauthenticated shell: branded context without the authenticated sidebar. */
export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-muted/30">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>

      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
        <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div
            className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full border border-primary-foreground/10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-40 -left-32 size-[28rem] rounded-full bg-primary-foreground/5"
            aria-hidden="true"
          />

          <AppLogo variant="inverted" className="relative" />

          <div className="relative max-w-lg space-y-6">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-foreground/70 uppercase">
              Secure workspace
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-balance xl:text-4xl">
              Keep customer and invoice work in one place.
            </h2>
            <p className="text-sm leading-6 text-primary-foreground/80">
              Sign in to manage the records your account owns. InvoiceFlow uses short-lived access
              tokens and keeps them out of browser storage.
            </p>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                Owner-scoped customer and invoice data
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                Server-calculated invoice totals
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                Clear session and error states
              </li>
            </ul>
          </div>

          <div className="relative flex items-start gap-2.5 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-4 text-xs leading-5 text-primary-foreground/80">
            <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Your access token stays in memory only. Reloading the page signs you out; no token is
              written to local storage, session storage, cookies, or the URL.
            </p>
          </div>
        </aside>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-h-dvh flex-col px-4 py-8 outline-none sm:px-8"
        >
          <div className="mb-8 lg:hidden">
            <AppLogo />
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-md">
              <Suspense fallback={<LoadingState />}>
                <Outlet />
              </Suspense>
            </div>
          </div>

          <div className="mt-8 flex items-start justify-center gap-2 text-center text-[11px] leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>InvoiceFlow API v1.0.0 · Local sign-out does not revoke the stateless token.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
