export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'MANAGER' | 'PLAYER';
  status: 'ACTIVE' | 'FROZEN' | 'BANNED';
  balance: number;
  currency: string;
  managerId?: string | null;
  manager?: { id: string; username: string } | null;
  _count?: { managedUsers: number };
  createdAt?: string;
}

export interface Sport {
  id: number;
  name: string;
  slug: string;
  iconName: string;
  sortOrder: number;
  isActive: boolean;
  categories?: Category[];
}

export interface Category {
  id: number;
  sportId: number;
  name: string;
  slug: string;
  countryCode?: string;
  sortOrder: number;
  tournaments?: Tournament[];
}

export interface Tournament {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface Match {
  id: string;
  tournamentId: number;
  homeTeam: string;
  awayTeam: string;
  status: 'PREMATCH' | 'LIVE' | 'ENDED' | 'CANCELLED';
  startTime: string;
  homeScore?: number;
  awayScore?: number;
  currentMinute?: number;
  isSuspended: boolean;
  isSimulated?: boolean;
  tournament?: Tournament & { category?: Category & { sport?: Sport } };
  markets?: Market[];
}

export interface Market {
  id: string;
  matchId: string;
  marketType: string;
  name: string;
  specifier?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'SETTLED';
  sortOrder: number;
  outcomes?: Outcome[];
}

export interface Outcome {
  id: string;
  marketId: string;
  name: string;
  odds: number;
  isWinner?: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'SETTLED' | 'VOID';
}

export interface BetSelection {
  outcomeId: string;
  matchId: string;
  marketId: string;
  outcomeName: string;
  marketName: string;
  matchName: string;
  odds: number;
}

export interface TicketLine {
  id: string;
  ticketId: string;
  matchId: string;
  marketId: string;
  outcomeId: string;
  outcomeName: string;
  marketName: string;
  matchName: string;
  oddsAtPlacement: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
}

export interface Ticket {
  id: string;
  userId?: string;
  bookingCode?: string;
  ticketType: 'SINGLE' | 'COMBO' | 'SYSTEM';
  systemType?: string;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'CANCELLED' | 'VOID' | 'REVERTED';
  placedAt: string;
  settledAt?: string;
  lines: TicketLine[];
  user?: { username: string };
}

export interface PitchState {
  matchId: string;
  ballX: number;
  ballY: number;
  possessionTeam: 'home' | 'away';
  eventText: string;
  homeStats: { possession: number; shots: number; shotsOnTarget: number; corners: number; yellow: number; red: number };
  awayStats: { possession: number; shots: number; shotsOnTarget: number; corners: number; yellow: number; red: number };
}

export interface MatchEvent {
  matchId: string;
  type: string;
  minute: number;
  team: 'home' | 'away';
  text: string;
}

export interface OddsDelta {
  outcomeId: string;
  newOdds: number;
  direction: 'up' | 'down';
}