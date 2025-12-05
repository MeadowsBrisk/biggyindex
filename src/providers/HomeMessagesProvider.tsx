"use client";
import React, { useEffect, useState } from "react";
import { useLocale, loadHomeMessages, useMessages, useForceEnglish, type Locale } from "./IntlProvider";

/**
 * HomeMessagesProvider - Lazy loads home page messages
 * 
 * Wrap home page content with this to load and merge home-specific translations.
 * Messages are only loaded when this provider mounts, keeping non-home pages lighter.
 * Respects the forceEnglish preference from IntlProvider.
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
  const { forceEnglish } = useForceEnglish();
  const { addMessages } = useMessages();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Use English messages if forceEnglish is enabled
    const messageLocale = forceEnglish ? 'en-GB' : locale;
    loadHomeMessages(messageLocale as Locale).then((homeMessages) => {
      if (!cancelled) {
        addMessages(homeMessages);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [locale, forceEnglish, addMessages]);

  // Render children immediately - messages will populate as they load
  // The fallback mechanism in IntlProvider handles missing keys gracefully
  return <>{children}</>;
}
