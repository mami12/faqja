import type { Ticket } from '../../types';
import { formatOdds } from '../../utils/formatOdds';

/** Financial columns belong to one public ticket; never display a joint odd. */
export default function SystemTicketSummary({ ticket }: { ticket: Ticket }) {
  const system = ticket.system;
  if (!system) return null;
  const stakes = system.columns.map(column => column.stake);
  const min = Math.min(...stakes), max = Math.max(...stakes);
  return (
    <div className="space-y-1 border-t border-tertiary p-3 text-xs text-text-secondary">
      <div className="font-bold text-slate-200">Sistem · {system.columnCount} kolona · Një biletë</div>
      <div>Shuma për kolonë: {min.toFixed(2)}{min !== max ? `–${max.toFixed(2)}` : ''} Lëk</div>
      <div>Pagesa për kolonë fituese: {system.minColumnPayout.toFixed(2)}–{system.maxColumnPayout.toFixed(2)} Lëk</div>
      <div>Pagesa e kthyer: {(ticket.actualPayout ?? 0).toFixed(2)} Lëk · Në pritje: {system.pendingColumns} kolona</div>
      <details>
        <summary className="cursor-pointer py-1 text-slate-300">Llogaritja sipas kolonave</summary>
        {system.columns.map((column, index) => (
          <div key={column.id} className="mt-1 border-t border-tertiary/60 py-1">
            <div>#{index + 1} · {column.stake.toFixed(2)} Lëk × {formatOdds(column.totalOdds)} = {column.potentialPayout.toFixed(2)} Lëk · {column.status}</div>
            <div>{column.lines.map(line => `${line.matchName}: ${line.marketName} ${line.marketLine ?? ''} · ${line.outcomeName}`).join(' + ')}</div>
          </div>
        ))}
      </details>
    </div>
  );
}
