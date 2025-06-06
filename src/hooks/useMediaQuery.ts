'use client';

import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  // Check if window is defined to prevent errors during server-side rendering (SSR)
  const isSsr = typeof window === 'undefined';

  const [matches, setMatches] = useState(() => {
    if (isSsr) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (isSsr) return;

    const mediaQueryList = window.matchMedia(query);

    // Define the listener function
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set the initial state correctly
    setMatches(mediaQueryList.matches);

    // Add the event listener for changes
    mediaQueryList.addEventListener('change', listener);

    // Cleanup function to remove the listener on unmount
    return () => {
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query, isSsr]); // Effect only re-runs if the query or SSR status changes

  return matches;
}