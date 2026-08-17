import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

export type Locale = "en" | "zh"
export type LocalizedText = { en: string; zh: string }

type I18nValue = {
  locale: Locale
  text: (english: string, chinese: string) => string
  localized: (value: LocalizedText) => string
  switchLocale: (locale: Locale) => void
}

const STORAGE_KEY = "react-stay-canvas-example-locale"

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en"
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === "en" || saved === "zh") return saved
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale] = useState<Locale>(detectLocale)

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  }, [locale])

  const value = useMemo<I18nValue>(() => ({
    locale,
    text: (english, chinese) => locale === "zh" ? chinese : english,
    localized: (content) => content[locale],
    switchLocale: (nextLocale) => {
      if (nextLocale === locale) return
      window.localStorage.setItem(STORAGE_KEY, nextLocale)
      window.location.reload()
    },
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used inside I18nProvider")
  return value
}
