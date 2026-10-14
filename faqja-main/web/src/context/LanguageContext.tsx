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
    document.documentElement.lang = lang === 'al' ? 'sq' : lang;
  }, [lang]);

  const lookup = (dict: any, key: string): string | undefined => {
    if (!dict || typeof dict !== 'object') return undefined;
    const exact = Object.keys(dict).find(k => k.toLowerCase() === key.toLowerCase());
    if (exact && typeof dict[exact] === 'string') return dict[exact];
    const dot = key.indexOf('.');
    if (dot < 0) return undefined;
    return lookup(dict[key.slice(0, dot)], key.slice(dot + 1));
  };
  const t = (key: string): string => lookup(dicts[lang], key) ?? lookup(dicts.al, key) ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLanguage: setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);