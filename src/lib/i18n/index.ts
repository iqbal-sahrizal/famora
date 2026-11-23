import type { DomainId } from "@/types/domain";
import type { NavItemConfig } from "@/config/navigation";
import {
  DEFAULT_LOCALE,
  MESSAGES,
  type Locale,
  type MessageKey,
} from "./messages";

export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type Locale,
  type MessageKey,
} from "./messages";

export {
  formatLocalizedDate,
  formatLocalizedDateTime,
  formatLocalizedNumber,
  formatLocalizedRelativeTime,
  formatLocalizedTime,
  toIntlLocale,
} from "./format";

export { translateError } from "./errors";

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  let template: string = dict[key] ?? MESSAGES[DEFAULT_LOCALE][key];
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      template = template.replaceAll(`{${paramKey}}`, String(paramValue));
    }
  }
  return template;
}

export function translateDomainLabel(domainId: DomainId, locale: Locale): string {
  const key = `nav.domain.${domainId}` as MessageKey;
  return translate(locale, key);
}

export function translateNavGroup(
  group: NavItemConfig["group"],
  locale: Locale
): string {
  const key = `nav.group.${group}` as MessageKey;
  return translate(locale, key);
}
