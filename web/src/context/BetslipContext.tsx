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
  const effectiveTicketType = selections.length > 1 ? 'COMBO' : ticketType;
  const chooseTicketType = (type: 'SINGLE' | 'COMBO' | 'SYSTEM') => {
    setTicketType(selections.length > 1 ? 'COMBO' : type);
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

  const totalOdds = useMemo(() => selections.reduce((acc, s) => acc * s.odds, 1), [selections]);
  const potentialPayout = useMemo(() => (parseFloat(stake) || 0) * totalOdds, [stake, totalOdds]);

  const placeBet = (onSuccess?: () => void): Promise<any> => {
    // A synchronous ref prevents duplicate requests even before React re-renders.
    if (inFlightBet.current) return inFlightBet.current;

    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < 1) return Promise.reject(new Error('Shuma minimale është 1 Lëk'));

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
    const fingerprint = JSON.stringify(payload);
    // If a response is lost, retry the SAME request ID: server will return
    // the original ticket, not charge the wallet again.
    if (!pendingBet.current || pendingBet.current.fingerprint !== fingerprint) {
      pendingBet.current = { requestId: crypto.randomUUID(), fingerprint };
    }
    const clientRequestId = pendingBet.current.requestId;
    setIsPlacingBet(true);
    const task = apiClient.post('/bets/place', { ...payload, clientRequestId })
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
    inFlightBet.current = task;
    return task;
  };

  const bookTicket = async () => {
    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < 1) {
      throw new Error('Shuma minimale është 1 Lëk');
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
      selections, stake, setStake, ticketType: effectiveTicketType, setTicketType: chooseTicketType, systemType, setSystemType,
      addSelection, removeSelection, clearAll, updateOdds,
      totalOdds, potentialPayout, placeBet, bookTicket, isPlacingBet
    }}>
      {children}
    </BetslipContext.Provider>
  );
};

export const useBetslip = () => useContext(BetslipContext);
