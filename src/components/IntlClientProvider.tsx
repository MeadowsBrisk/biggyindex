"use client";

import {
  type IntlError,
  IntlErrorCode,
  NextIntlClientProvider,
} from "next-intl";
import type { ReactNode } from "react";
import type { ClientMessages } from "@/i18n/client-messages";

/**
 * Thin 'use client' wrapper around NextIntlClientProvider.
 *
 * Why a wrapper: onError / getMessageFallback are functions and cannot be
 * passed across the Server→Client serialization boundary from the layout.
 * Defining them inside this client module is the documented next-intl pattern.
 *
 * It also installs a DEV-ONLY guard so that a missing message (e.g. a client
 * component using a namespace that isn't in CLIENT_NAMESPACES) fails LOUDLY in
 * development instead of silently rendering a raw key. Production keeps the
 * stock next-intl behavior (return the key) so a stray miss never blanks a
 * page for real users.
 */
const isDev = process.env.NODE_ENV === "development";

function onError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    if (isDev) {
      // Loud, actionable: almost always a namespace missing from
      // CLIENT_NAMESPACES in src/i18n/client-messages.ts.
      console.error(
        `[i18n] MISSING client message — did you add a useTranslations() ` +
          `namespace without listing it in CLIENT_NAMESPACES ` +
          `(src/i18n/client-messages.ts)?\n${error.message}`,
      );
    }
    // In production: swallow (stock next-intl also only console.errors).
    return;
  }
  // Non-missing errors (bad ICU, etc.) — surface via console in all envs.
  console.error(error);
}

function getMessageFallback(info: {
  error: IntlError;
  key: string;
  namespace?: string;
}) {
  const path = [info.namespace, info.key].filter(Boolean).join(".");
  // Visible sentinel in dev so a regression is obvious in the UI, not a
  // plausible-looking key. Stock behavior (the key path) in production.
  return isDev ? `⚠️MISSING(${path})` : path;
}

export function IntlClientProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: ClientMessages;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      // Must be passed EXPLICITLY: automatic server-config inheritance only
      // works when NextIntlClientProvider is rendered directly from a Server
      // Component — this wrapper is a client module, so without it client
      // components (e.g. loading.tsx) hit ENVIRONMENT_FALLBACK, which is a
      // FATAL error during `next build` prerendering. Keep in sync with the
      // timeZone in src/i18n/request.ts.
      timeZone="UTC"
      onError={onError}
      getMessageFallback={getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}
