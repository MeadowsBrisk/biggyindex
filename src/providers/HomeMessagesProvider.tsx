"use client";
import React, { useEffect, useState } from "react";
import { useLocale, loadHomeMessages, useMessages, type Locale } from "./IntlProvider";

/**
 * HomeMessagesProvider - Lazy loads home page messages
 * 
 * Wrap home page content with this to load and merge home-specific translations.
 * Messages are only loaded when this provider mounts, keeping non-home pages lighter.
 * 
 * Usage:
 *   <HomeMessagesProvider>
 *     <HeroSection />
 *     <QuickStartSection />
 *     ...
 *   </HomeMessagesProvider>
 */
export function HomeMessagesProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const { addMessages } = useMessages();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHomeMessages(locale as Locale).then((homeMessages) => {
      if (!cancelled) {
        addMessages(homeMessages);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [locale, addMessages]);

  // Render children immediately - messages will populate as they load
  // The fallback mechanism in IntlProvider handles missing keys gracefully
  return <>{children}</>;
}
