import { createContext, useContext, useState, useMemo, useRef } from 'react';
import { BetSelection } from '../types';
import { apiClient } from '../api/client';
import { MIN_TOTAL_STAKE_CENTS, previewColumnPayouts, splitStakeCents, stakeToCents } from '../utils/betslipColumns';

interface BetslipContextType {
  selections: BetSelection[];
  stake: string;
  setStake: (s: string) => void;
  ticketType: 'SINGLE' | 'COMBO' | 'SYSTEM';
  addSelection: (s: BetSelection) => void;
  removeSelection: (outcomeId: string) => void;
  clearAll: () => void;
  updateOdds: (outcomeId: string, odds: number) => void;
  columns: BetSelection[][];
  columnsOverflow: boolean;
  columnStakes: number[];
  columnPreviews: { odds: number; stake: number; payout: number; invalid: boolean }[];
  totalOdds: number;
  potentialPayout: number;
  placeBet: (onSuccess?: () => void) => Promise<any>;
  isPlacingBet: boolean;
  bookTicket: () => Promise<any>;
}

const BetslipContext = createContext<BetslipContextType>({} as BetslipContextType);

export const BetslipProvider = ({ children }: { children: React.ReactNode }) => {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  // This is always the total debit, including when alternatives create columns.
  const [stake, setStake] = useState('100');
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const inFlightBet = useRef<Promise<any> | null>(null);
  const pendingBet = useRef<{ requestId: string; fingerprint: string } | null>(null);
  // Every chosen market is a separate line on ONE ticket, even for the same match.
  // System tickets remain a separate backend feature; never generate them implicitly.
  const columnsOverflow = selections.length > 20;
  const columns = useMemo(() => selections.length && selections.length <= 20 ? [selections] : [], [selections]);
  const effectiveTicketType = selections.length > 1 ? 'COMBO' : 'SINGLE';
  const stakeCents = stakeToCents(stake);
  const columnStakes = useMemo(() => splitStakeCents(stakeCents ?? 0, columns.length), [stakeCents, columns.length]);
  const columnPreviews = useMemo(() => previewColumnPayouts(columns, columnStakes), [columns, columnStakes]);

  const addSelection = (s: BetSelection) => {
    setSelections(previous => previous.some(p => p.outcomeId === s.outcomeId)
      ? previous.filter(p => p.outcomeId !== s.outcomeId)
      : [...previous, s]);
  };

  const removeSelection = (outcomeId: string) => {
    setSelections(previous => previous.filter(p => p.outcomeId !== outcomeId));
  };

  const clearAll = () => {
    setSelections([]);
    setStake('100');
  };

  const updateOdds = (outcomeId: string, newOdds: number) => {
    setSelections(prev => prev.map(s => s.outcomeId === outcomeId ? { ...s, odds: newOdds } : s));
  };

  const totalOdds = useMemo(() => columns.length === 1
    ? columns[0].reduce((acc, s) => acc * s.odds, 1) : 0, [columns]);
  const potentialPayout = useMemo(() => columnPreviews.reduce((sum, column) => sum + Math.round(column.payout * 100), 0) / 100, [columnPreviews]);

  const placeBet = (onSuccess?: () => void): Promise<any> => {
    // A synchronous ref prevents duplicate requests even before React re-renders.
    if (inFlightBet.current) return inFlightBet.current;

    if (!selections.length) return Promise.reject(new Error('Zgjidh të paktën një kuotë.'));
    if (stakeCents == null) return Promise.reject(new Error('Shuma duhet të ketë maksimumi 2 shifra pas presjes.'));
    if (stakeCents < MIN_TOTAL_STAKE_CENTS) return Promise.reject(new Error('Shuma minimale totale është 100 Lek'));
    if (columnsOverflow) return Promise.reject(new Error('Maksimumi 20 zgjedhje për kupon.'));
    if (columnPreviews.some(column => column.invalid)) return Promise.reject(new Error('Një kuotë ose pagesë është e pavlefshme. Rifresko zgjedhjet.'));
    const stakeNum = stakeCents / 100;

    const payload = {
      ticketType: effectiveTicketType,
      type: effectiveTicketType,
      stake: stakeNum,
      selections: selections.map(s => ({
        outcomeId: s.outcomeId,
        oddsAtPlacement: s.odds,
        odds: s.odds,
      })),
    };
    const fingerprint = JSON.stringify(payload);
    // If a response is lost, retry the SAME request ID: server will return
    // the original ticket, not charge the wallet again.
    if (!pendingBet.current || pendingBet.current.fingerprint !== fingerprint) {
      pendingBet.current = { requestId: crypto.randomUUID(), fingerprint };
    }
    const clientRequestId = pendingBet.current.requestId;
    setIsPlacingBet(true);
    const task = apiClient.post('/bets/place', { ...payload, clientRequestId });
    const settled = task
      .then(res => {
        pendingBet.current = null;
        onSuccess?.();
        return res.data;
      })
      .catch(err => {
        // Definitive server rejection permits a fresh attempt. For a network
        // failure with unknown outcome, preserve the key for safe retries.
        if (err.response && err.response.status >= 400 && err.response.status < 500) pendingBet.current = null;
        throw err;
      })
      .finally(() => {
        inFlightBet.current = null;
        setIsPlacingBet(false);
      });
    inFlightBet.current = settled;
    return settled;
  };

  const bookTicket = async () => {
    if (!selections.length) throw new Error('Zgjidh të paktën një kuotë.');
    if (columnsOverflow) throw new Error('Maksimumi 20 zgjedhje për kupon.');
    if (columnPreviews.some(column => column.invalid)) throw new Error('Një kuotë ose pagesë është e pavlefshme. Rifresko zgjedhjet.');
    if (stakeCents == null) throw new Error('Shuma duhet të ketë maksimumi 2 shifra pas presjes.');
    const stakeNum = stakeCents / 100;
    if (stakeCents < MIN_TOTAL_STAKE_CENTS) {
      throw new Error('Shuma minimale është 100 Lek');
    }
    
    const res = await apiClient.post('/bets/book', {
      ticketType: effectiveTicketType,
      type: effectiveTicketType,
      stake: stakeNum,
      selections: selections.map(s => ({
        outcomeId: s.outcomeId,
        oddsAtPlacement: s.odds,
        odds: s.odds
      }))
    });
    return res.data;
  };

  return (
    <BetslipContext.Provider value={{
      selections, columns, columnsOverflow, columnStakes, columnPreviews, stake, setStake, ticketType: effectiveTicketType,
      addSelection, removeSelection, clearAll, updateOdds,
      totalOdds, potentialPayout, placeBet, bookTicket, isPlacingBet
    }}>
      {children}
    </BetslipContext.Provider>
  );
};

export const useBetslip = () => useContext(BetslipContext);
