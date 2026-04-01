import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, CheckSquare, Square, ToggleLeft, ToggleRight } from 'lucide-react';

export interface ExportColumn {
    key: string;
    label: string;
    group: 'registration' | 'member' | 'payment' | 'other';
}

// All possible export columns for registrations
export const ALL_REGISTRATION_EXPORT_COLUMNS: ExportColumn[] = [
    // Registration info
    { key: 'familyId', label: 'Family ID', group: 'registration' },
    { key: 'name', label: 'Primary Contact', group: 'registration' },
    { key: 'phone', label: 'Phone', group: 'registration' },
    { key: 'email', label: 'Email', group: 'registration' },
    { key: 'whatsapp', label: 'WhatsApp Number', group: 'registration' },
    { key: 'address', label: 'Address', group: 'registration' },
    // Member info
    { key: 'memberName', label: 'Member Name', group: 'member' },
    { key: 'memberPhone', label: 'Member Phone', group: 'member' },
    { key: 'memberAge', label: 'Age', group: 'member' },
    { key: 'memberGender', label: 'Gender', group: 'member' },
    { key: 'memberPackage', label: 'Package', group: 'member' },
    { key: 'memberPackagePrice', label: 'Package Price', group: 'member' },
    { key: 'memberRoomNumber', label: 'Room Number', group: 'member' },
    { key: 'memberIsTwoSharing', label: '2-Sharing', group: 'member' },
    { key: 'memberIsManagement', label: 'Management', group: 'member' },
    // Payment info
    { key: 'totalAmount', label: 'Total Amount', group: 'payment' },
    { key: 'amountPaid', label: 'Amount Paid', group: 'payment' },
    { key: 'paymentType', label: 'Payment Type', group: 'payment' },
    { key: 'utr', label: 'UTR/Transaction ID', group: 'payment' },
    { key: 'paymentStatus', label: 'Payment Status', group: 'payment' },
    { key: 'account', label: 'Assigned Account', group: 'payment' },
    // Other
    { key: 'joinedWhatsapp', label: 'Joined WhatsApp Group', group: 'other' },
    { key: 'submittedAt', label: 'Submitted At', group: 'other' },
    { key: 'remarks', label: 'Remarks', group: 'other' },
];

// All possible export columns for cancellations
export const ALL_CANCELLATION_EXPORT_COLUMNS: ExportColumn[] = [
    { key: 'originalId', label: 'Original Registration ID', group: 'registration' },
    { key: 'name', label: 'Primary Contact', group: 'registration' },
    { key: 'phone', label: 'Phone', group: 'registration' },
    { key: 'memberName', label: 'Cancelled Member Name', group: 'member' },
    { key: 'memberAge', label: 'Age', group: 'member' },
    { key: 'memberGender', label: 'Gender', group: 'member' },
    { key: 'memberPackage', label: 'Package', group: 'member' },
    { key: 'amountPaidForCancelled', label: 'Amount Paid', group: 'payment' },
    { key: 'refundAmount', label: 'Refund Amount', group: 'payment' },
    { key: 'refundStatus', label: 'Refund Status', group: 'payment' },
    { key: 'refundUtr', label: 'Refund UTR', group: 'payment' },
    { key: 'refundPercentage', label: 'Refund % Applied', group: 'payment' },
    { key: 'trainCancellationCharges', label: 'Train Charges', group: 'payment' },
    { key: 'account', label: 'Original Account', group: 'payment' },
    { key: 'cancelledAt', label: 'Cancelled At', group: 'other' },
    { key: 'remarks', label: 'Remarks', group: 'other' },
];

const GROUP_LABELS: Record<string, { label: string; color: string }> = {
    registration: { label: 'Registration Info', color: 'purple' },
    member: { label: 'Member Details', color: 'blue' },
    payment: { label: 'Payment Info', color: 'emerald' },
    other: { label: 'Other', color: 'gray' },
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onExport: (selectedColumnKeys: string[]) => void;
    mode: 'registrations' | 'cancellations';
    recordCount: number;
}

export const ExportColumnsModal = ({ isOpen, onClose, onExport, mode, recordCount }: Props) => {
    const allColumns = mode === 'registrations' ? ALL_REGISTRATION_EXPORT_COLUMNS : ALL_CANCELLATION_EXPORT_COLUMNS;

    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set(allColumns.map(c => c.key)));

    // Reset selections when modal opens
    useEffect(() => {
        if (isOpen) setSelectedKeys(new Set(allColumns.map(c => c.key)));
    }, [isOpen, mode]);

    if (!isOpen) return null;

    const toggle = (key: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleGroup = (group: string) => {
        const groupKeys = allColumns.filter(c => c.group === group).map(c => c.key);
        const allSelected = groupKeys.every(k => selectedKeys.has(k));
        setSelectedKeys(prev => {
            const next = new Set(prev);
            groupKeys.forEach(k => allSelected ? next.delete(k) : next.add(k));
            return next;
        });
    };

    const selectAll = () => setSelectedKeys(new Set(allColumns.map(c => c.key)));
    const selectNone = () => setSelectedKeys(new Set());

    const groups = ['registration', 'member', 'payment', 'other'];

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={onClose}>
            <div
                className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div>
                        <h2 className="text-lg font-bold text-white">Export to Excel</h2>
                        <p className="text-sm text-gray-400 mt-0.5">
                            {recordCount} {mode === 'registrations' ? 'registrations' : 'cancellations'} will be exported (filtered)
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 bg-black/20">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Quick:</span>
                    <button
                        onClick={selectAll}
                        className="text-xs px-3 py-1.5 rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors border border-purple-500/20 font-medium"
                    >
                        Select All
                    </button>
                    <button
                        onClick={selectNone}
                        className="text-xs px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20 font-medium"
                    >
                        Deselect All
                    </button>
                    <span className="ml-auto text-xs text-gray-500">
                        {selectedKeys.size} / {allColumns.length} selected
                    </span>
                </div>

                {/* Column groups */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ scrollbarWidth: 'thin' }}>
                    {groups.map(group => {
                        const gCols = allColumns.filter(c => c.group === group);
                        if (gCols.length === 0) return null;
                        const info = GROUP_LABELS[group];
                        const allGroupSelected = gCols.every(c => selectedKeys.has(c.key));
                        const someGroupSelected = gCols.some(c => selectedKeys.has(c.key));

                        return (
                            <div key={group}>
                                {/* Group header */}
                                <button
                                    onClick={() => toggleGroup(group)}
                                    className="flex items-center gap-2 mb-2 group/header w-full text-left"
                                >
                                    {allGroupSelected ? (
                                        <ToggleRight className={`w-5 h-5 text-${info.color}-400`} />
                                    ) : (
                                        <ToggleLeft className={`w-5 h-5 ${someGroupSelected ? `text-${info.color}-600` : 'text-gray-600'}`} />
                                    )}
                                    <span className={`text-sm font-semibold ${allGroupSelected ? `text-${info.color}-400` : 'text-gray-400'} group-hover/header:text-white transition-colors`}>
                                        {info.label}
                                    </span>
                                    <span className="text-xs text-gray-600">
                                        ({gCols.filter(c => selectedKeys.has(c.key)).length}/{gCols.length})
                                    </span>
                                </button>

                                {/* Columns grid */}
                                <div className="grid grid-cols-2 gap-1.5 ml-1">
                                    {gCols.map(col => {
                                        const isSelected = selectedKeys.has(col.key);
                                        return (
                                            <button
                                                key={col.key}
                                                onClick={() => toggle(col.key)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                                                    isSelected
                                                        ? 'bg-white/5 text-white border border-white/10'
                                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/3 border border-transparent'
                                                }`}
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
                                                ) : (
                                                    <Square className="w-4 h-4 text-gray-600 shrink-0" />
                                                )}
                                                <span className="truncate">{col.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-black/20">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onExport(Array.from(selectedKeys));
                            onClose();
                        }}
                        disabled={selectedKeys.size === 0}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/30"
                    >
                        <Download className="w-4 h-4" />
                        Export {selectedKeys.size} Columns
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
