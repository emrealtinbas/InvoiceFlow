import { FileText, LayoutDashboard, Users, type LucideIcon } from 'lucide-react';

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Frontend phase that delivers the feature. */
  phase: string;
}

export const navigationItems: readonly NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    phase: 'Phase 7',
  },
  {
    label: 'Customers',
    href: '/customers',
    icon: Users,
    phase: 'Phase 3',
  },
  {
    label: 'Invoices',
    href: '/invoices',
    icon: FileText,
    phase: 'Phase 6',
  },
];

export function findNavigationItem(pathname: string): NavigationItem | undefined {
  return navigationItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
