import { createContext, useContext, useState, useMemo } from 'react';
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
  bookTicket: () => Promise<any>;
}

const BetslipContext = createContext<BetslipContextType>({} as BetslipContextType);

export const BetslipProvider = ({ children }: { children: React.ReactNode }) => {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [stake, setStake] = useState('0');
  const [ticketType, setTicketType] = useState<'SINGLE' | 'COMBO' | 'SYSTEM'>('SINGLE');
  const [systemType, setSystemType] = useState('');

  const addSelection = (s: BetSelection) => {
    setSelections(prev => {
      // 1) Nëse outcome-i ekziston tashmë → toggle (hiqe)
      const exists = prev.some(p => p.outcomeId === s.outcomeId);
      if (exists) {
        return prev.filter(p => p.outcomeId !== s.outcomeId);
      }

      // 2) Konflikt: market i njëjti nga e njëjta ndeshje → zëvendëso vetëm atë
      //    (p.sh. "1" dhe "X" nga i njëjti 1X2, ose "Over 2.5" dhe "Under 2.5")
      const conflict = prev.find(p =>
        p.matchId === s.matchId && p.marketId === s.marketId
      );
      if (conflict) {
        return [
          ...prev.filter(p => !(p.matchId === s.matchId && p.marketId === s.marketId)),
          s,
        ];
      }

      // 3) Përndryshe → shto normalisht
      //    Lejon market-e të ndryshme nga e njëjta ndeshje (GG + Over 2.5 + 1X2)
      return [...prev, s];
    });
  };

  const removeSelection = (outcomeId: string) => {
    setSelections(prev => prev.filter(p => p.outcomeId !== outcomeId));
  };

  const clearAll = () => {
    setSelections([]);
    setStake('0');
  };

  const updateOdds = (outcomeId: string, newOdds: number) => {
    setSelections(prev => prev.map(s => s.outcomeId === outcomeId ? { ...s, odds: newOdds } : s));
  };

  const totalOdds = useMemo(() => selections.reduce((acc, s) => acc * s.odds, 1), [selections]);
  const potentialPayout = useMemo(() => (parseFloat(stake) || 0) * totalOdds, [stake, totalOdds]);

  const placeBet = async (onSuccess?: () => void) => {
    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < 1) {
      throw new Error('Shuma minimale është 1 Lëk');
    }
    
    const res = await apiClient.post('/bets/place', {
      ticketType,
      type: ticketType,
      systemType,
      stake: stakeNum,
      selections: selections.map(s => ({
        outcomeId: s.outcomeId,
        oddsAtPlacement: s.odds,
        odds: s.odds
      }))
    });
    
    if (onSuccess) onSuccess();
    return res.data;
  };

  const bookTicket = async () => {
    const stakeNum = parseFloat(stake) || 0;
    if (stakeNum < 1) {
      throw new Error('Shuma minimale është 1 Lëk');
    }
    
    const res = await apiClient.post('/bets/book', {
      ticketType,
      type: ticketType,
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
      selections, stake, setStake, ticketType, setTicketType, systemType, setSystemType,
      addSelection, removeSelection, clearAll, updateOdds,
      totalOdds, potentialPayout, placeBet, bookTicket
    }}>
      {children}
    </BetslipContext.Provider>
  );
};

export const useBetslip = () => useContext(BetslipContext);
