import type { GridColumn, Registration } from '../types';
import { cn } from '../lib/utils';
import { BadgeCheck, Clock, AlertCircle, RefreshCcw, Eye, Edit, Ban, Trash2, RotateCcw } from 'lucide-react';

interface Props {
    columns: GridColumn[];
    data: Registration[];
    isLoading: boolean;
    onRowClick?: (reg: Registration) => void;
    onAction?: (action: string, reg: Registration) => void;
    actionsType?: 'registrations' | 'cancellations';
}

const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export const DynamicTable = ({ columns, data, isLoading, onRowClick, onAction, actionsType = 'registrations' }: Props) => {

    // Helper to render cell content based on column type
    const renderCell = (row: any, col: GridColumn) => {
        const value = getNestedValue(row, col.key);

        if (col.type === 'currency') {
            return <span className="font-mono font-medium text-emerald-400">₹{(value || 0).toLocaleString('en-IN')}</span>;
        }

        if (col.type === 'status') {
            const status = (value || 'pending').toLowerCase();
            let color = 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
            let icon = <Clock className="w-3 h-3 mr-1.5" />;

            if (status.includes('verified')) { color = 'text-green-400 bg-green-400/10 border-green-400/20'; icon = <BadgeCheck className="w-3 h-3 mr-1.5" />; }
            else if (status.includes('no_payment')) { color = 'text-red-400 bg-red-400/10 border-red-400/20'; icon = <AlertCircle className="w-3 h-3 mr-1.5" />; }
            else if (status.includes('partial')) { color = 'text-orange-400 bg-orange-400/10 border-orange-400/20'; icon = <RefreshCcw className="w-3 h-3 mr-1.5" />; }

            return (
                <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize border", color)}>
                    {icon} {status.replace(/_/g, ' ')}
                </span>
            );
        }

        if (col.type === 'progress') {
            const details = row.paymentDetails;
            if (!details) return <span className="text-gray-600">-</span>;

            const total = details.totalAmount || 0;
            const paid = details.amountPaid || 0;
            const percent = total > 0 ? (paid / total) * 100 : 0;

            return (
                <div className="w-32">
                    <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-gray-300 font-medium">₹{paid.toLocaleString()}</span>
                        <span className="text-gray-500">/ ₹{total.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden border border-white/5">
                        <div className={cn("h-full transition-all duration-500", percent >= 100 ? "bg-emerald-500" : "bg-blue-500")} style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                </div>
            );
        }

        if (col.key === 'members_summary') {
            const members = row.members || [];
            const count = members.length;
            const types = members.reduce((acc: any, m: any) => {
                const type = m.packageName || 'Std';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});

            const summary = Object.entries(types).map(([t, c]) => `${c} ${t}`).join(', ');
            return (
                <div className="flex flex-col">
                    <span className="font-semibold text-white">{count} Travellers</span>
                    <span className="text-xs text-gray-500 mt-0.5">{summary}</span>
                </div>
            );
        }

        return <span className="text-gray-300 font-medium">{value?.toString() || '-'}</span>;
    };

    if (isLoading) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
                <div className="text-gray-400">Loading registrations...</div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="p-12 text-center glass-card">
                <div className="text-gray-400 text-lg">No records found matching your filters.</div>
            </div>
        );
    }

    return (
        <div className="w-full overflow-hidden rounded-lg border border-white/5 bg-black/20">
            <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs text-gray-400 uppercase bg-black/20 border-b border-white/5">
                    <tr>
                        {columns.map((col) => (
                            <th key={col.key} className="px-6 py-4 font-semibold tracking-wider">
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {data.map((row) => (
                        <tr
                            key={row.id}
                            className="hover:bg-white/5 transition-colors group"
                        >
                            {columns.map((col) => (
                                <td
                                    key={col.key}
                                    className="px-6 py-4 whitespace-nowrap"
                                    onClick={() => col.key !== 'actions' && onRowClick?.(row)}
                                >
                                    {col.key === 'actions' && onAction ? (
                                        <div className="flex items-center gap-1 justify-center">
                                            {actionsType === 'registrations' ? (
                                                <>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('view', row); }} className="p-1.5 rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors" title="View Details">
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('edit', row); }} className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 hover:text-white transition-colors" title="Edit">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('cancel', row); }} className="p-1.5 rounded-md text-orange-400 hover:bg-orange-500/10 transition-colors" title="Cancel/Refund">
                                                        <Ban className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('delete', row); }} className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 transition-colors" title="Delete Permanently">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('undo', row); }} className="p-1.5 rounded-md text-green-400 hover:bg-green-500/10 transition-colors" title="Undo Cancellation">
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('edit', row); }} className="p-1.5 rounded-md text-blue-400 hover:bg-blue-500/10 transition-colors" title="Edit Refund Details">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); onAction('delete', row); }} className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 transition-colors" title="Delete Record">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        renderCell(row, col)
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div >
    );
};
