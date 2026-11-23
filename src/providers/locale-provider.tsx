"use client";

import * as React from "react";
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  translate,
  translateError,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  te: (errorOrCode?: string | null, fallbackKey?: MessageKey) => string;
}

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, params) => translate(DEFAULT_LOCALE, key, params),
  te: (err, fallbackKey) => translateError(DEFAULT_LOCALE, err, fallbackKey),
});

export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = React.useState<Locale>(
    normalizeLocale(initialLocale)
  );

  React.useEffect(() => {
    setLocaleState(normalizeLocale(initialLocale));
  }, [initialLocale]);

  const setLocale = React.useCallback((next: Locale) => {
    const normalized = normalizeLocale(next);
    setLocaleState(normalized);
    if (typeof document !== "undefined") {
      document.documentElement.lang = normalized;
      document.cookie = `famora_locale=${normalized}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);

  const t = React.useCallback(
    (key: MessageKey, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale]
  );

  const te = React.useCallback(
    (errorOrCode?: string | null, fallbackKey?: MessageKey) =>
      translateError(locale, errorOrCode, fallbackKey),
    [locale]
  );

  const value = React.useMemo(
    () => ({ locale, setLocale, t, te }),
    [locale, setLocale, t, te]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return React.useContext(LocaleContext);
}
