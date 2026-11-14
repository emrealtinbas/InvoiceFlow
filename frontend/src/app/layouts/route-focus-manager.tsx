import { useEffect, useRef } from 'react';

import { useLocation } from 'react-router-dom';

/** Moves keyboard and screen-reader context to the main region after client-side navigation. */
export function RouteFocusManager() {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('#main-content')?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
