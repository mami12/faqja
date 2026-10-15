import { createContext, useContext, useState, useMemo, useRef } from 'react';
import { BetSelection } from '../types';
import { apiClient } from '../api/client';

interface BetslipContextType {
  selections: BetSelection[];
  stake: string;
  setStake: (s: string) => void;
  ticketType: 'SINGLE' | 'COMBO' | 'SYSTEM';
  setTicketType: (t: 'SINGLE' | 'COMBO' | 'SYSTEM') => void;
  systemType: string;
  setSystemType: (s: string) => void;
  addSelection: (s: BetSelection) => void;
  removeSelection: (outcomeId: string) => void;
  clearAll: () => void;
  updateOdds: (outcomeId: string, odds: number) => void;
  columns: BetSelection[][];
  totalOdds: number;
  potentialPayout: number;
  placeBet: (onSuccess?: () => void) => Promise<any>;
  isPlacingBet: boolean;
  bookTicket: () => Promise<any>;
}

const BetslipContext = createContext<BetslipContextType>({} as BetslipContextType);

export const BetslipProvider = ({ children }: { children: React.ReactNode }) => {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [stake, setStake] = useState('0');
  const [ticketType, setTicketType] = useState<'SINGLE' | 'COMBO' | 'SYSTEM'>('SINGLE');
  const [systemType, setSystemType] = useState('');
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const inFlightBet = useRef<Promise<any> | null>(null);
  const pendingBet = useRef<{ requestId: string; fingerprint: string } | null>(null);
  // Cartesian product: at most one pick per match in each ordinary column.
  // For 1X2 + BTTS in the same match this produces two single tickets.
  const columns = useMemo(() => {
    const groups: BetSelection[][] = [];
    for (const selection of selections) {
      const group = groups.find(g => g[0].matchId === selection.matchId);
      if (group) group.push(selection);
      else groups.push([selection]);
    }
    return groups.reduce<BetSelection[][]>((acc, group) =>
      acc.flatMap(col => group.map(pick => [...col, pick])), [[]]);
  }, [selections]);
  const split = columns.length > 1;
  const effectiveTicketType = split
    ? (columns[0]?.length > 1 ? 'COMBO' : 'SINGLE')
    : selections.length > 1 ? 'COMBO' : ticketType;
  const chooseTicketType = (type: 'SINGLE' | 'COMBO' | 'SYSTEM') => {
    setTicketType(split ? effectiveTicketType : selections.length > 1 ? 'COMBO' : type);
  };

  const addSelection = (s: BetSelection) => {
    const exists = selections.some(p => p.outcomeId === s.outcomeId);
    let next: BetSelection[];
    if (exists) {
      next = selections.filter(p => p.outcomeId !== s.outcomeId);
    } else {
      const conflict = selections.some(p => p.matchId === s.matchId && p.marketId === s.marketId);
      next = conflict
        ? [...selections.filter(p => !(p.matchId === s.matchId && p.marketId === s.marketId)), s]
        : [...selections, s];
    }
    setSelections(next);
    setTicketType(next.length > 1 ? 'COMBO' : 'SINGLE');
    setSystemType('');
  };

  const removeSelection = (outcomeId: string) => {
    const next = selections.filter(p => p.outcomeId !== outcomeId);
    setSelections(next);
    setTicketType(next.length > 1 ? 'COMBO' : 'SINGLE');
    setSystemType('');
  };

  const clearAll = () => {
    setSelections([]);
    setStake('0');
    setTicketType('SINGLE');
    setSystemType('');
  };

  const updateOdds = (outcomeId: string, newOdds: number) => {
    setSelections(prev => prev.map(s => s.outcomeId === outcomeId ? { ...s, odds: newOdds } : s));
  };

  const totalOdds = useMemo(() => columns.length === 1
    ? columns[0].reduce((acc, s) => acc * s.odds, 1) : 0, [columns]);
  const potentialPayout = useMemo(() => (parseFloat(stake) || 0) *
    columns.reduce((sum, col) => sum + col.reduce((product, s) => product * s.odds, 1), 0), [stake, columns]);

  const placeBet = (onSuccess?: () => void): Promise<any> => {
    // A synchronous ref prevents duplicate requests even before React re-renders.
    if (inFlightBet.current) return inFlightBet.current;

    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < 100) return Promise.reject(new Error('Shuma minimale për kolonë është 100 Lek'));
    if (columns.length > 24) return Promise.reject(new Error('Maksimumi 24 kolona për kupon.'));

    const payload = {
      ticketType: effectiveTicketType,
      type: effectiveTicketType,
      systemType,
      stake: stakeNum,
      selections: selections.map(s => ({
        outcomeId: s.outcomeId,
        oddsAtPlacement: s.odds,
        odds: s.odds,
      })),
    };
    const columnPayload = split ? {
      stake: stakeNum,
      columns: columns.map(col => col.map(s => ({ outcomeId: s.outcomeId, oddsAtPlacement: s.odds }))),
    } : null;
    const fingerprint = JSON.stringify(columnPayload ?? payload);
    // If a response is lost, retry the SAME request ID: server will return
    // the original ticket, not charge the wallet again.
    if (!pendingBet.current || pendingBet.current.fingerprint !== fingerprint) {
      pendingBet.current = { requestId: crypto.randomUUID(), fingerprint };
    }
    const clientRequestId = pendingBet.current.requestId;
    setIsPlacingBet(true);
    const task = split
      ? apiClient.post('/bets/place-columns', { ...columnPayload, clientRequestId })
      : apiClient.post('/bets/place', { ...payload, clientRequestId });
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
    const stakeNum = parseFloat(stake) || 0;
    if (split) throw new Error('Prenotimi i shumë kolonave nuk është ende i disponueshëm.');
    if (stakeNum < 100) {
      throw new Error('Shuma minimale është 100 Lek');
    }
    
    const res = await apiClient.post('/bets/book', {
      ticketType: effectiveTicketType,
      type: effectiveTicketType,
      systemType,
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
      selections, columns, stake, setStake, ticketType: effectiveTicketType, setTicketType: chooseTicketType, systemType, setSystemType,
      addSelection, removeSelection, clearAll, updateOdds,
      totalOdds, potentialPayout, placeBet, bookTicket, isPlacingBet
    }}>
      {children}
    </BetslipContext.Provider>
  );
};

export const useBetslip = () => useContext(BetslipContext);
