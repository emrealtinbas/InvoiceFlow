import { Suspense, useState } from 'react';

import { Menu, ShieldCheck, X } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';

import { LoadingState } from '@/components/shared/loading-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/session/context';

import { findNavigationItem } from '../router/navigation';
import { RouteFocusManager } from './route-focus-manager';
import { SidebarContent } from './sidebar-content';

export function AppLayout() {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const currentItem = findNavigationItem(location.pathname);
  const pageTitle = currentItem?.label ?? 'Page not found';

  return (
    <div className="min-h-dvh bg-background">
      <RouteFocusManager />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Dialog open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent
              showCloseButton={false}
              className="top-0 left-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-y-0 border-l-0 p-0 sm:max-w-72"
            >
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              <DialogDescription className="sr-only">
                Primary application navigation and account actions
              </DialogDescription>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3.5 right-3 z-10"
                  aria-label="Close navigation"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </DialogClose>
              <SidebarContent onNavigate={() => setMobileNavigationOpen(false)} />
            </DialogContent>
          </Dialog>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              InvoiceFlow Web
            </p>
            <p className="truncate text-sm font-medium text-foreground">{pageTitle}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <span
                className="hidden max-w-56 items-center gap-1.5 truncate rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex"
                title={user.email}
              >
                <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="truncate">{user.email}</span>
              </span>
            ) : null}
            <Badge variant="outline" className="hidden md:inline-flex">
              Phase 10 · Release Candidate
            </Badge>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl px-4 py-8 outline-none sm:px-6 sm:py-10 lg:px-8"
        >
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>

        <footer className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1 border-t py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>InvoiceFlow Web · Phase 10 local verification complete</p>
            <p>Frontend target: InvoiceFlow API v1.0.0</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
