import { useState } from 'react';
import { Search, TrendingUp } from 'lucide-react';
import type { Match, Market } from '../../types';
import OddsButton from './OddsButton';
import { useLanguage } from '../../context/LanguageContext';
import { useLiveFeed } from '../../api/liveFeed';
import { isMarketVisible, isOutcomeAvailable, filterDecidedOutcomes } from '../../utils/marketExpiry';
import { baseMarketName, marketGroupKey, marketLabel, dedupeOutcomes, marketCategories, matchesCategory, type MarketCategory } from '../../utils/marketPresentation';

export default function MarketPanel({ match }: { match: Match }) {
  const { t } = useLanguage();
  const { lockedMarkets } = useLiveFeed();
  const [category, setCategory] = useState<MarketCategory>('all');
  const [search, setSearch] = useState('');
  const available = (match.markets ?? []).filter(m => isMarketVisible(match, m, lockedMarkets)).map(m => ({
    ...m, outcomes: filterDecidedOutcomes(dedupeOutcomes((m.outcomes ?? []).filter(isOutcomeAvailable)), m, match),
  })).filter(m => m.outcomes.length > 0);
  const query = search.trim().toLocaleLowerCase();
  const filtered = available.filter(m => matchesCategory(m, category) && (!query || `${m.name} ${marketLabel(t, m.name)} ${m.line ?? ''}`.toLocaleLowerCase().includes(query)));
  const groups = new Map<string, Market[]>();
  filtered.forEach(m => { const key = marketGroupKey(m); groups.set(key, [...(groups.get(key) ?? []), m]); });
  for (const list of groups.values()) list.sort((a, b) => (parseFloat(a.line ?? '0') || 0) - (parseFloat(b.line ?? '0') || 0));
  return (
    <section className="market-panel space-y-4 p-3 sm:p-4 border-t border-white/5" aria-label={t('market_ui.title')}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{t('market_ui.title')}</h2>
        <span className="text-xs text-text-secondary" aria-live="polite">{filtered.length} {t('market_ui.count')}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('common.filter')}>
        {marketCategories.map(cat => (
          <button type="button" key={cat} aria-pressed={category === cat} onClick={() => setCategory(cat)} className={`filter-chip ${category === cat ? 'filter-chip-active' : ''}`}>
            {t(`market_ui.${cat}`)} <span className="ml-1 opacity-70 tabular-nums">{available.filter(m => matchesCategory(m, cat)).length}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3.5 text-text-secondary" aria-hidden="true" />
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label={t('market_ui.search')} placeholder={t('market_ui.search')} className="w-full rounded-xl border border-white/10 bg-primary/70 pl-10 pr-3 py-3 text-sm" />
      </div>
      {groups.size === 0 ? (
        <div className="ui-empty" role="status">
          <p className="font-semibold text-white">{t('market_ui.empty')}</p>
          <p className="mt-2 text-sm text-text-secondary">{t('market_ui.empty_hint')}</p>
          {(category !== 'all' || search) && <button type="button" className="filter-chip mt-4" onClick={() => { setCategory('all'); setSearch(''); }}>{t('common.reset_filters')}</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 items-start">
          {Array.from(groups.entries()).map(([key, list]) => (
            <section key={key} className="ui-card overflow-hidden">
              <h3 className="flex items-start gap-2 bg-white/[0.025] px-4 py-3 border-b border-white/5 text-sm font-semibold">
                <TrendingUp size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{marketLabel(t, baseMarketName(list[0]))}{list[0].period ? ` · ${t('market_ui.period')} ${list[0].period}` : ''}</span>
              </h3>
              <div className="divide-y divide-white/5">
                {list.map(m => (
                  <div key={m.id} className="p-3 space-y-2">
                    {m.line && <div className="text-xs font-mono text-emerald-400">{t('market_ui.line')} {m.line}</div>}
                    <div className={`grid gap-2 ${m.outcomes?.length === 3 ? 'grid-cols-3' : m.outcomes?.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {m.outcomes?.map(o => <OddsButton key={o.id} match={match} market={m} outcome={o} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
