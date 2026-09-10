import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import english from "./locales/en.json";

export type Locale = "zh" | "en";
type Preference = "system" | Locale;
type Values = Record<string, string | number>;
const translations: Record<string, string> = english;

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (base === "zh" || base === "en") return base;
  }
  return "en";
}

export function translate(message: string, locale: Locale, values: Values = {}): string {
  const text = locale === "en" && Object.hasOwn(translations, message) ? translations[message]! : message;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match);
}

export function translateError(message: string, locale: Locale): string {
  if (Object.hasOwn(translations, message)) return translate(message, locale);
  // Upstream diagnostics are not UI copy. Known API messages are translated above.
  return translate("操作失败，请稍后重试", locale);
}

function readPreference(): Preference {
  try {
    const value = localStorage.getItem("arcadelink.language");
    if (value === "zh" || value === "en") return value;
  } catch { /* Private browsing may disable storage. */ }
  return "system";
}

const I18nContext = createContext<{
  locale: Locale;
  preference: Preference;
  setPreference: (value: Preference) => void;
  t: (message: string, values?: Values) => string;
  errorText: (message: string) => string;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(readPreference);
  const [systemLocale, setSystemLocale] = useState(() => resolveLocale(navigator.languages));
  const locale = preference === "system" ? systemLocale : preference;
  useEffect(() => {
    const changed = () => setSystemLocale(resolveLocale(navigator.languages));
    window.addEventListener("languagechange", changed);
    return () => window.removeEventListener("languagechange", changed);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem("arcadelink.language", preference); } catch { /* Keep the in-memory choice. */ }
  }, [locale, preference]);
  const value = useMemo(() => ({
    locale, preference, setPreference,
    t: (message: string, values?: Values) => translate(message, locale, values),
    errorText: (message: string) => translateError(message, locale),
  }), [locale, preference]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSelect() {
  const { t, preference, setPreference } = useI18n();
  return <select aria-label={t("语言")} className="focus-ring min-h-11 min-w-0 max-w-36 rounded-xl bg-transparent px-2 text-sm"
    value={preference} onChange={event => setPreference(event.target.value as Preference)}>
    <option value="system">{t("跟随系统")}</option>
    <option value="zh">简体中文</option>
    <option value="en">English</option>
  </select>;
}
