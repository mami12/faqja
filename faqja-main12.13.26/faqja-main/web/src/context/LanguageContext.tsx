import { createContext, useContext, useState, useEffect } from 'react';
import al from '../i18n/al';
import en from '../i18n/en';
import de from '../i18n/de';
import fr from '../i18n/fr';

type Lang = 'al' | 'en' | 'de' | 'fr';

const dicts: Record<Lang, any> = { al, en, de, fr };

interface LanguageContextType {
  lang: Lang;
  setLanguage: (l: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('lang') as Lang | null;
    return saved && dicts[saved] ? saved : 'al';
  });

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = (key: string) => {
    const keys = key.split('.');
    let val: any = dicts[lang];
    for (const k of keys) {
      if (!val) break;
      val = val[k];
    }
    if (val && typeof val === 'string') return val;

    // Fallback to Albanian if key missing in selected language
    let fallback: any = dicts.al;
    for (const k of keys) {
      if (!fallback) break;
      fallback = fallback[k];
    }
    return fallback && typeof fallback === 'string' ? fallback : key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLanguage: setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);