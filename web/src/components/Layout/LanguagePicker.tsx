import { useLanguage } from '../../context/LanguageContext';

export default function LanguagePicker() {
  const {lang, setLanguage, t} = useLanguage();
  return <select data-language-picker aria-label={t('languages.choose')} value={lang}
    onChange={event => setLanguage(event.target.value === 'en' ? 'en' : 'al')}
    className="h-9 w-[86px] shrink-0 rounded-lg border border-white/15 bg-[#0b1018] px-1 text-base text-white outline-none focus:border-emerald-400 sm:w-[98px] sm:px-2 sm:text-sm">
    <option value="al">Shqip</option>
    <option value="en">English</option>
  </select>;
}
