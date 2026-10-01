import { useLanguage } from '../../context/LanguageContext';

export default function BookingModal({ code, onClose }: { code: string, onClose: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-secondary p-8 rounded-lg max-w-sm w-full text-center border border-tertiary shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">{t('betslip.booking_code')}</h2>
        <p className="text-text-secondary text-sm mb-6">Present this code at any terminal to print your ticket.</p>
        
        <div className="bg-primary py-4 rounded text-3xl font-black text-accent-yellow tracking-widest mb-6">
          {code}
        </div>

        <button 
          onClick={() => { navigator.clipboard.writeText(code); alert('Copied!'); }}
          className="w-full bg-tertiary hover:bg-gray-600 text-white font-bold py-2 rounded mb-3"
        >
          Copy Code
        </button>
        <button 
          onClick={onClose}
          className="w-full border border-text-secondary text-text-secondary hover:text-white hover:border-white font-bold py-2 rounded"
        >
          Close
        </button>
      </div>
    </div>
  );
}
