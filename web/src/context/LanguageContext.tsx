import { createContext, useContext, useEffect } from 'react';
import al from '../i18n/al';

type Lang = 'al';

interface LanguageContextType {
  lang: Lang;
  setLanguage: (l: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({} as LanguageContextType);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    localStorage.setItem('lang', 'al');
    document.documentElement.lang = 'sq';
  }, []);

  const t = (key: string) => {
    const keys = key.split('.');
    let val: any = al;
    for (const k of keys) {
      if (!val) break;
      val = val[k];
    }
    if (val && typeof val === 'string') return val;

    return key;
  };

  return (
    <LanguageContext.Provider value={{ lang: 'al', setLanguage: () => {}, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
