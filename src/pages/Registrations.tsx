import { useState, useMemo } from 'react';
import { Search, Filter, Download } from 'lucide-react';
import { useRegistrations, useCancellations } from '../hooks/useRegistrations';
import { useTableSchema } from '../hooks/useTableSchema';
import { useAppStore } from '../store/useAppStore';
import { DynamicTable } from '../components/DynamicTable';
import type { Registration, Cancellation, GridColumn } from '../types';
import { EditRegistrationModal } from '../components/EditRegistrationModal';
import { CancelRegistrationModal } from '../components/CancelRegistrationModal';
import { DeleteRegistrationModal } from '../components/DeleteRegistrationModal';
import { RegistrationDetailsModal } from '../components/RegistrationDetailsModal';
import { UndoCancellationModal } from '../components/UndoCancellationModal';
import { EditCancellationModal } from '../components/EditCancellationModal';
import { exportRegistrationsToExcel, exportCancellationsToExcel } from '../utils/excelExport';

export const Registrations = () => {
    const { currentYatra, user } = useAppStore();
    const [viewMode, setViewMode] = useState<'registrations' | 'cancellations'>('registrations');
    const [paymentMode, setPaymentMode] = useState<'all' | 'online' | 'cash'>('all');
    const { data: registrations = [], isLoading: isLoadingRegs } = useRegistrations();
    const { data: cancellations = [], isLoading: isLoadingCancels } = useCancellations();

    // ... filtering state ...
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [whatsappFilter, setWhatsappFilter] = useState('all');

    // Modals State
    const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

    const [selectedDelete, setSelectedDelete] = useState<Registration | Cancellation | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const [selectedCancellation, setSelectedCancellation] = useState<Cancellation | null>(null);
    const [isUndoModalOpen, setIsUndoModalOpen] = useState(false);
    const [isEditCancellationModalOpen, setIsEditCancellationModalOpen] = useState(false);

    // Filter Logic
    const filteredData = useMemo(() => {
        const sourceData = viewMode === 'registrations' ? registrations : cancellations;
        return sourceData.filter((item: any) => {
            // 1. Payment Mode Filter (Only for active registrations)
            if (viewMode === 'registrations' && paymentMode !== 'all') {
                const reg = item as Registration;
                const utr = reg.utr || reg.paymentDetails?.utrNumber || '';
                const isCash = utr.toLowerCase().includes('cash');

                if (paymentMode === 'cash' && !isCash) return false;
                if (paymentMode === 'online' && isCash) return false;
            }

            if (statusFilter !== 'all' && item.paymentStatus !== statusFilter) return false;

            if (whatsappFilter !== 'all') {
                const raw = item.joinedWhatsapp;
                // Normalize mixed legacy data (boolean true/false, string "yes"/"no", "Yes"/"No", undefined)
                const isJoined = raw === true || String(raw).toLowerCase() === 'yes';

                if (whatsappFilter === 'yes' && !isJoined) return false;
                if (whatsappFilter === 'no' && isJoined) return false;
            }

            if (!searchQuery) return true;

            const searchLower = searchQuery.toLowerCase();
            const fields = [item.name, item.phone, item.email, item.address, item.utr, item.familyId];
            const matchesField = fields.some(f => f && f.toLowerCase().includes(searchLower));
            const matchesMember = item.members?.some((m: any) => m.name.toLowerCase().includes(searchLower)) ||
                (item as Cancellation).cancelledMembers?.some((m: any) => m.name.toLowerCase().includes(searchLower));

            return matchesField || matchesMember;
        });
    }, [viewMode, registrations, cancellations, searchQuery, statusFilter, whatsappFilter, paymentMode]);

    // Columns Logic
    const baseRegColumns = useTableSchema(currentYatra, filteredData as Registration[]);

    const columns = useMemo(() => {
        let cols: GridColumn[] = [];

        if (viewMode === 'cancellations') {
            cols = [
                { key: 'name', label: 'Primary Contact', type: 'text' },
                { key: 'phone', label: 'Phone', type: 'text' },
                { key: 'refundAmount', label: 'Refund Amount', type: 'currency' },
                { key: 'refundStatus', label: 'Refund Status', type: 'status' }, // Should probably map status colors or custom render
                { key: 'refundUtr', label: 'Refund UTR', type: 'text' },
                // { key: 'cancelledMembers.length', label: 'Cancelled Members', type: 'number' } // Logic might need adjustment for nested access length
            ];
        } else {
            cols = [...baseRegColumns];
            // Inject 'Account' column before UTR (assuming UTR is last)
            if (cols.length > 0) {
                const lastCol = cols[cols.length - 1];
                if (lastCol.key === 'utr') {
                    cols.splice(cols.length - 1, 0, { key: 'account_source', label: 'Account', type: 'badge' });
                } else {
                    cols.push({ key: 'account_source', label: 'Account', type: 'badge' });
                }
            }
        }

        // Always append actions IF logged in
        if (user) {
            cols.push({ key: 'actions', label: 'Actions', type: 'actions' });
        }

        return cols;
    }, [viewMode, baseRegColumns, user]);

    const handleAction = (action: string, item: any) => {
        if (!user) return; // Guard clause

        if (viewMode === 'registrations') {
            const reg = item as Registration;
            switch (action) {
                case 'view': setSelectedReg(reg); setIsDetailsModalOpen(true); break;
                case 'edit': setSelectedReg(reg); setIsEditModalOpen(true); break;
                case 'cancel': setSelectedReg(reg); setIsCancelModalOpen(true); break;
                case 'delete': setSelectedDelete(reg); setIsDeleteModalOpen(true); break;
            }
        } else {
            const canc = item as Cancellation;
            switch (action) {
                case 'undo': setSelectedCancellation(canc); setIsUndoModalOpen(true); break;
                case 'edit': setSelectedCancellation(canc); setIsEditCancellationModalOpen(true); break;
                case 'delete': setSelectedDelete(canc); setIsDeleteModalOpen(true); break;
            }
        }
    };

    const handleExport = (data: any[]) => {
        const yatraName = currentYatra?.name?.replace(/\s+/g, '_') || 'yatra';
        const timestamp = new Date().toISOString().split('T')[0];

        if (viewMode === 'registrations') {
            exportRegistrationsToExcel(data as Registration[], {
                filename: `${yatraName}_registrations_${timestamp}`,
                sheetName: 'Registrations'
            });
        } else {
            exportCancellationsToExcel(data as Cancellation[], {
                filename: `${yatraName}_cancellations_${timestamp}`,
                sheetName: 'Cancellations'
            });
        }
    };



    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-gray-900/40 p-4 rounded-xl border border-white/5">

                {/* View Toggles */}
                <div className="flex gap-4">
                    <div className="flex rounded-lg bg-black/20 p-1 border border-white/5 h-fit">
                        <button
                            onClick={() => setViewMode('registrations')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'registrations'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            Active List
                        </button>
                        <button
                            onClick={() => setViewMode('cancellations')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'cancellations'
                                ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            Cancellations
                        </button>
                    </div>

                    {/* Payment Mode Toggles - Only show for Registrations */}
                    {viewMode === 'registrations' && (
                        <div className="flex rounded-lg bg-black/20 p-1 border border-white/5 h-fit">
                            <button
                                onClick={() => setPaymentMode('all')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${paymentMode === 'all'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setPaymentMode('online')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${paymentMode === 'online'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                Online
                            </button>
                            <button
                                onClick={() => setPaymentMode('cash')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${paymentMode === 'cash'
                                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                Cash
                            </button>
                        </div>
                    )}
                </div>



                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* ... Search ... */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 outline-none w-64 transition-all"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="pl-9 pr-8 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-300 focus:ring-2 focus:ring-purple-500/50 outline-none appearance-none cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <option value="all">All Status</option>
                            <option value="verified">Verified</option>
                            <option value="pending_verification">Pending</option>
                            <option value="partial_payment">Partial</option>
                            <option value="no_payment">No Payment</option>
                        </select>
                    </div>

                    {/* WhatsApp Filter */}
                    {viewMode === 'registrations' && (
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-green-500 font-bold bg-green-500/10 rounded-full text-[10px]">W</div>
                            <select
                                value={whatsappFilter}
                                onChange={(e) => setWhatsappFilter(e.target.value)}
                                className="pl-9 pr-8 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-300 focus:ring-2 focus:ring-purple-500/50 outline-none appearance-none cursor-pointer hover:bg-white/5 transition-colors"
                            >
                                <option value="all">WhatsApp: All</option>
                                <option value="yes">Joined</option>
                                <option value="no">Not Joined</option>
                            </select>
                        </div>
                    )}

                    <button
                        onClick={() => handleExport(filteredData)}
                        className="p-2 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded-lg transition-colors border border-green-500/30"
                        title="Export CSV"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="min-h-[400px]">
                <DynamicTable
                    columns={columns}
                    data={filteredData as any}
                    isLoading={viewMode === 'registrations' ? isLoadingRegs : isLoadingCancels}
                    onRowClick={(item) => handleAction(viewMode === 'registrations' ? 'view' : 'edit', item)}
                    onAction={(action, item) => handleAction(action, item)}
                    actionsType={viewMode}
                />
            </div>

            {/* Modals */}
            <RegistrationDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                data={selectedReg}
            />

            <EditRegistrationModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                data={selectedReg}
                onSuccess={() => setSelectedReg(null)}
            />

            <CancelRegistrationModal
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                data={selectedReg}
                onSuccess={() => setSelectedReg(null)}
            />

            <DeleteRegistrationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                data={selectedDelete}
                onSuccess={() => setSelectedDelete(null)}
                collectionName={viewMode === 'registrations' ? 'registrations' : 'cancellations'}
            />

            <UndoCancellationModal
                isOpen={isUndoModalOpen}
                onClose={() => setIsUndoModalOpen(false)}
                data={selectedCancellation}
                onSuccess={() => setSelectedCancellation(null)}
            />

            <EditCancellationModal
                isOpen={isEditCancellationModalOpen}
                onClose={() => setIsEditCancellationModalOpen(false)}
                cancellation={selectedCancellation}
            />
        </div>
    );
};
