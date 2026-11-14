import { LogOut, ShieldCheck } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { AppLogo } from '@/components/shared/app-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/session/context';
import { useEnvironment } from '@/lib/config/environment-context';
import { cn } from '@/lib/utils/cn';

import { navigationItems } from '../router/navigation';

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { apiBaseUrl } = useEnvironment();
  const { user, expiresAt, signOut } = useAuth();
  const navigate = useNavigate();

  const expiryLabel =
    expiresAt === null
      ? null
      : new Intl.DateTimeFormat(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }).format(expiresAt);

  function handleSignOut(): void {
    signOut();
    onNavigate?.();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b px-5">
        <NavLink
          to="/dashboard"
          onClick={onNavigate}
          className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label="InvoiceFlow dashboard"
        >
          <AppLogo />
        </NavLink>
      </div>

      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-6 overflow-y-auto p-3">
        <div>
          <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Workspace
          </p>
          <ul className="space-y-1">
            {navigationItems.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      isActive
                        ? 'bg-primary/8 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          'size-4 shrink-0',
                          isActive
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                      {isActive ? (
                        <span
                          className="ml-auto size-1.5 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto space-y-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2.5">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden="true"
              >
                {user?.email.slice(0, 1).toUpperCase() ?? '?'}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground" title={user?.email}>
                  {user?.email ?? 'Signed in'}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  {user?.roles.join(', ') || 'Authenticated'}
                </p>
              </div>
            </div>

            {expiryLabel ? (
              <p className="mt-2.5 text-[11px] leading-4 text-muted-foreground">
                Local session ends around {expiryLabel}. Sign in again when it expires.
              </p>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={handleSignOut}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Target API
              </span>
              <Badge variant="outline">v1.0.0</Badge>
            </div>
            <p className="mt-2 truncate font-mono text-[11px] text-foreground" title={apiBaseUrl}>
              {apiBaseUrl}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Configured target — not a live connection check.
            </p>
          </div>

          <p className="px-1 text-[11px] leading-5 text-muted-foreground">
            Phase 10 verifies same-origin delivery, persistence, and full-stack browser tests.
          </p>
        </div>
      </nav>
    </div>
  );
}
