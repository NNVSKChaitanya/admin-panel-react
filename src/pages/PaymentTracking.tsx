import { useState, useMemo } from 'react';
import { useRegistrations } from '../hooks/useRegistrations';
import { useAppStore } from '../store/useAppStore';
import type { Registration, Installment } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { Banknote, GripVertical, Loader2, AlertCircle, Calendar, Eye, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { RegistrationDetailsModal } from '../components/RegistrationDetailsModal';

// --- Types for the Board ---
interface PaymentItem {
    id: string; // Unique ID for Drag and Drop
    registrationId: string;
    type: 'full' | 'installment';
    index?: number; // Installment index
    name: string; // Traveller Name
    amount: number;
    status: string;
    assignedTo: 'chaitanya' | 'narayana' | 'cash' | 'unassigned';
    originalData: Registration;
    installmentData?: Installment;
}

export const PaymentTracking = () => {
    const { currentYatra } = useAppStore();
    const { data: registrations = [], isLoading } = useRegistrations();
    const [draggedItem, setDraggedItem] = useState<PaymentItem | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // For highlighting effect
    const [highlightedId, setHighlightedId] = useState<string | null>(null);

    const handleViewDetails = (reg: Registration) => {
        setSelectedRegistration(reg);
        setIsModalOpen(true);
    };

    // Normalize Data into Draggable Items
    const items = useMemo(() => {
        const list: PaymentItem[] = [];

        registrations.forEach(reg => {
            // Logic for Hampi-style (Installments)
            if (reg.paymentDetails?.installments?.length) {
                reg.paymentDetails.installments.forEach((inst, idx) => {
                    let assigned: 'chaitanya' | 'narayana' | 'cash' | 'unassigned' = 'unassigned';

                    // Check UTR for "cash" match
                    const utr = ((inst as any).utrNumber || reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
                    const isCashUTR = utr.includes('cash');

                    if (inst.assignedTo) {
                        assigned = inst.assignedTo;
                    } else if (isCashUTR && idx === 0) {
                        assigned = 'cash';
                    } else if (idx === 0) {
                        // ONLY First Installment falls back to remarks
                        if (reg.remarks?.toLowerCase().includes('chaitanya')) {
                            assigned = 'chaitanya';
                        } else if (reg.remarks?.toLowerCase().includes('narayana')) {
                            assigned = 'narayana';
                        }
                    }
                    // Subsequent installments (idx > 0) default to 'unassigned' if not explicitly set

                    list.push({
                        id: `${reg.id}_inst_${idx}`,
                        registrationId: reg.id,
                        type: 'installment',
                        index: idx,
                        name: `${reg.name} (Inst. ${idx + 1})`,
                        amount: inst.amount,
                        status: inst.status,
                        assignedTo: assigned,
                        originalData: reg,
                        installmentData: inst
                    });
                });
            }
            // Logic for Puri-style (Single Payment) or Hampi-style (Full Payment)
            else {
                let assigned: 'chaitanya' | 'narayana' | 'cash' | 'unassigned' = 'unassigned';

                // Check UTR for "cash" match
                const utr = (reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
                const isCashUTR = utr.includes('cash');

                if (reg.paymentDetails?.assignedTo) {
                    assigned = reg.paymentDetails.assignedTo;
                } else if (isCashUTR) {
                    assigned = 'cash';
                } else if (reg.remarks?.toLowerCase().includes('chaitanya')) {
                    assigned = 'chaitanya';
                } else if (reg.remarks?.toLowerCase().includes('narayana')) {
                    assigned = 'narayana';
                }

                list.push({
                    id: `${reg.id}_full`,
                    registrationId: reg.id,
                    type: 'full',
                    name: reg.name,
                    amount: reg.paymentDetails?.amountPaid || reg.totalAmount,
                    status: reg.paymentStatus,
                    assignedTo: assigned,
                    originalData: reg
                });
            }
        });
        return list;
    }, [registrations]);

    // --- Alerts Logic ---
    const alertItems = useMemo(() => {
        return items.filter(item => {
            // 1. Always show unverified First Payments / Full Payments
            if (item.type === 'full' || (item.type === 'installment' && item.index === 0)) {
                return item.status !== 'verified' && item.status !== 'paid';
            }

            // 2. Show Overdue Installments
            if (item.type === 'installment' && item.installmentData?.dueDate) {
                const dueDate = new Date(item.installmentData.dueDate);
                const today = new Date();
                // Reset time for accurate date comparison
                today.setHours(0, 0, 0, 0);

                // If not paid/verified AND due date is passed
                return (item.status !== 'verified' && item.status !== 'paid') && dueDate < today;
            }

            return false;
        });
    }, [items]);

    const scrollToItem = (itemId: string) => {
        const element = document.getElementById(itemId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedId(itemId);
            setTimeout(() => setHighlightedId(null), 2000); // Remove highlight after 2s
        }
    };

    const columns = {
        unassigned: items.filter(i => i.assignedTo === 'unassigned'),
        chaitanya: items.filter(i => i.assignedTo === 'chaitanya'),
        narayana: items.filter(i => i.assignedTo === 'narayana'),
        cash: items.filter(i => i.assignedTo === 'cash'),
    };

    const handleDragStart = (e: React.DragEvent, item: PaymentItem) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (targetColumn: 'chaitanya' | 'narayana' | 'cash' | 'unassigned') => {
        if (!draggedItem || !currentYatra) return;
        if (draggedItem.assignedTo === targetColumn) return;

        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const regRef = doc(db, 'registrations', draggedItem.registrationId);

            // Prepare Update Data
            const updates: any = {};

            if (draggedItem.type === 'installment' && typeof draggedItem.index === 'number') {
                // Updating specific installment
                const installments = [...(draggedItem.originalData.paymentDetails?.installments || [])];
                if (installments[draggedItem.index]) {
                    installments[draggedItem.index] = {
                        ...installments[draggedItem.index],
                        assignedTo: targetColumn === 'unassigned' ? null : targetColumn,
                        // If assigning to person/cash -> mark as paid/verified. If unassigning -> keep current status or move to pending? 
                        // User likely wants it verified if assigned.
                        status: targetColumn !== 'unassigned' ? 'paid' : installments[draggedItem.index].status
                    };
                    updates['paymentDetails.installments'] = installments;

                    // Recalculate amountPaid
                    const newAmountPaid = installments.reduce((acc, inst) => {
                        return (inst.status === 'paid' || (inst.status as string) === 'verified') ? acc + (inst.amount || 0) : acc;
                    }, 0);
                    updates['paymentDetails.amountPaid'] = newAmountPaid;
                }
            } else {
                // Updating main record
                updates['paymentDetails.assignedTo'] = targetColumn === 'unassigned' ? null : targetColumn;
                if (targetColumn !== 'unassigned') {
                    updates['paymentStatus'] = 'verified';
                    updates['paymentDetails.paymentStatus'] = 'verified';
                }
            }

            await updateDoc(regRef, updates);

        } catch (error) {
            console.error("Failed to update registration:", error);
            alert("Failed to update. Please try again.");
        } finally {
            setIsUpdating(false);
            setDraggedItem(null);
        }
    };

    const handleStatusUpdate = async (item: PaymentItem, newStatus: string) => {
        if (!currentYatra) return;
        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const regRef = doc(db, 'registrations', item.registrationId);
            const updates: any = {};

            if (item.type === 'installment' && typeof item.index === 'number') {
                const installments = [...(item.originalData.paymentDetails?.installments || [])];
                if (installments[item.index]) {
                    // Map 'verified' to 'paid' for installments to match existing logic if needed, 
                    // OR just use 'verified' if system supports it. 
                    // Looking at types: status: 'pending' | 'paid' | 'verification_pending';
                    // 'verified' isn't explicitly in Installment type but 'paid' is used for verified installments usually?
                    // Let's stick to 'paid' for verified installments to be safe, or just cast.
                    // Actually types say: status: 'pending' | 'paid' | 'verification_pending';
                    const statusValue = newStatus === 'verified' ? 'paid' : newStatus;

                    installments[item.index] = {
                        ...installments[item.index],
                        status: statusValue as any
                    };
                    updates['paymentDetails.installments'] = installments;

                    // Recalculate amountPaid
                    const newAmountPaid = installments.reduce((acc, inst) => {
                        return (inst.status === 'paid' || (inst.status as string) === 'verified') ? acc + (inst.amount || 0) : acc;
                    }, 0);
                    updates['paymentDetails.amountPaid'] = newAmountPaid;
                }
            } else {
                updates['paymentStatus'] = newStatus;
                updates['paymentDetails.paymentStatus'] = newStatus;
            }

            await updateDoc(regRef, updates);

        } catch (error) {
            console.error("Failed to update status:", error);
            alert("Failed to update status.");
        } finally {
            setIsUpdating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin h-10 w-10 text-purple-500" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col space-y-4 animate-fade-in">
            <div className="flex items-center justify-between px-2">
                <div>
                    <h1 className="text-2xl font-bold text-white">Payment Tracking</h1>
                    <p className="text-gray-400 text-sm">Drag payments to assign them to accounts.</p>
                </div>
                {isUpdating && <span className="text-sm text-yellow-400 animate-pulse flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Updating...</span>}
            </div>

            {/* Alerts Carousel */}
            {alertItems.length > 0 && (
                <div className="px-2">
                    <div className="flex items-center gap-2 mb-2 text-yellow-400">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-bold uppercase tracking-wider">Attention Required ({alertItems.length})</span>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
                        {alertItems.map(item => (
                            <div
                                key={`alert_${item.id}`}
                                className="min-w-[280px] bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex flex-col gap-3 snap-start hover:bg-yellow-500/15 transition-colors"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-bold text-white text-sm truncate max-w-[150px]">{item.name}</p>
                                        <p className="text-xs text-yellow-200/70">
                                            {item.type === 'full' ? 'Full Payment' : `Installment ${item.index! + 1}`}
                                        </p>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-yellow-400">₹{item.amount.toLocaleString()}</span>
                                </div>

                                {/* Status Dropdown */}
                                <select
                                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-yellow-400/50"
                                    value={item.status === 'paid' ? 'verified' : item.status}
                                    onChange={(e) => handleStatusUpdate(item, e.target.value)}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="verification_pending">Verification Pending</option>
                                    <option value="verified">Verified / Paid</option>
                                    <option value="rejected">Rejected</option>
                                </select>

                                {/* Screenshot Thumbnail (if available) */}
                                {(item.originalData.paymentDetails?.paymentProofUrl || item.originalData.paymentDetails?.installments?.[item.index || 0]?.assignedTo) && (//Simple check, real logic depends on where proof is stored
                                    // Actually for Hampi, usually proof is in main obj or specific installment not clear. 
                                    // Falling back to main Record's proof for 1st inst/full
                                    (item.type === 'full' || item.index === 0) && item.originalData.paymentDetails?.paymentProofUrl &&
                                    <div className="h-20 rounded-lg bg-black/40 overflow-hidden relative group cursor-pointer" onClick={() => handleViewDetails(item.originalData)}>
                                        <img src={item.originalData.paymentDetails.paymentProofUrl} alt="Proof" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
                                            <Eye className="w-4 h-4 text-white" />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between mt-auto">
                                    {item.installmentData?.dueDate && (
                                        <div className="flex items-center gap-1.5 text-xs text-red-400">
                                            <Calendar className="w-3 h-3" />
                                            <span>Due: {item.installmentData.dueDate}</span>
                                        </div>
                                    )}
                                    {!item.installmentData?.dueDate && <span className="text-xs text-gray-500">No Due Date</span>}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => scrollToItem(item.id)}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                            title="Locate on Board"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => handleViewDetails(item.originalData)}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                            title="View Details"
                                        >
                                            <Eye className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 overflow-hidden min-h-0">

                {/* Unassigned Column */}
                <Column
                    title="Unassigned"
                    items={columns.unassigned}
                    color="gray"
                    onDrop={() => handleDrop('unassigned')}
                    onDragOver={handleDragOver}
                    onDragStart={handleDragStart}
                    highlightedId={highlightedId}
                />

                {/* Chaitanya Column */}
                <Column
                    title="Chaitanya"
                    items={columns.chaitanya}
                    color="cyan"
                    onDrop={() => handleDrop('chaitanya')}
                    onDragOver={handleDragOver}
                    onDragStart={handleDragStart}
                    highlightedId={highlightedId}
                />

                {/* Narayana Column */}
                <Column
                    title="Narayana"
                    items={columns.narayana}
                    color="sky"
                    onDrop={() => handleDrop('narayana')}
                    onDragOver={handleDragOver}
                    onDragStart={handleDragStart}
                    highlightedId={highlightedId}
                />

                {/* Cash Column */}
                <Column
                    title="Cash / Spot"
                    items={columns.cash}
                    color="emerald"
                    onDrop={() => handleDrop('cash')}
                    onDragOver={handleDragOver}
                    onDragStart={handleDragStart}
                    highlightedId={highlightedId}
                />

            </div>

            <RegistrationDetailsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                data={selectedRegistration}
            />
        </div>
    );
};

const Column = ({ title, items, color, onDrop, onDragOver, onDragStart, highlightedId }: any) => {
    const total = items.reduce((acc: number, item: any) => acc + (item.amount || 0), 0);

    // Grouping Logic
    const groupedItems = useMemo(() => {
        const groups: Record<string, any[]> = {
            'Full Payment': [],
            '1st Installment': [],
            '2nd Installment': [],
            '3rd Installment': [],
            '4th Installment': [],
            'Other': []
        };

        items.forEach((item: any) => {
            if (item.type === 'full') {
                groups['Full Payment'].push(item);
            } else if (item.type === 'installment' && typeof item.index === 'number') {
                const idx = item.index;
                if (idx === 0) groups['1st Installment'].push(item);
                else if (idx === 1) groups['2nd Installment'].push(item);
                else if (idx === 2) groups['3rd Installment'].push(item);
                else if (idx === 3) groups['4th Installment'].push(item);
                else groups['Other'].push(item);
            } else {
                groups['Other'].push(item);
            }
        });

        // Filter out empty groups
        return Object.entries(groups).filter(([_, groupItems]) => groupItems.length > 0);
    }, [items]);

    // Color mapping
    const bgColors: any = {
        gray: 'bg-white/5 border-white/10',
        cyan: 'bg-cyan-500/5 border-cyan-500/20',
        sky: 'bg-sky-500/5 border-sky-500/20',
        emerald: 'bg-emerald-500/5 border-emerald-500/20'
    };

    const textColors: any = {
        gray: 'text-gray-400',
        cyan: 'text-cyan-400',
        sky: 'text-sky-400',
        emerald: 'text-emerald-400'
    };

    return (
        <div
            className={cn("flex flex-col rounded-xl border h-full overflow-hidden transition-colors", bgColors[color])}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <div className="p-4 border-b border-white/5 bg-black/20 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex justify-between items-center mb-1">
                    <h3 className={cn("font-bold text-lg", textColors[color])}>{title}</h3>
                    <span className="text-xs font-mono bg-black/40 px-2 py-1 rounded text-gray-400">{items.length}</span>
                </div>
                <div className="text-2xl font-bold text-white">₹{total.toLocaleString()}</div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                {items.length === 0 && (
                    <div className="h-32 flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-white/5 rounded-lg">
                        <span className="text-sm">No Items</span>
                    </div>
                )}

                {groupedItems.map(([groupTitle, groupItems]) => (
                    <div key={groupTitle} className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                            {groupTitle}
                            <div className="h-px bg-white/10 flex-1"></div>
                            <span className="text-gray-600 font-mono">{groupItems.length}</span>
                        </div>

                        <div className="space-y-2">
                            {groupItems.map((item: any) => (
                                <div
                                    key={item.id}
                                    id={item.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, item)}
                                    className={cn(
                                        "bg-gray-800/60 p-3 rounded-lg border border-white/5 hover:border-white/20 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all group duration-500",
                                        highlightedId === item.id && "ring-2 ring-yellow-400 bg-yellow-400/10 scale-[1.02]"
                                    )}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-medium text-gray-200 text-sm flex items-center gap-2">
                                                <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-gray-400" />
                                                {item.name}
                                            </p>
                                        </div>
                                        <span className={cn(
                                            "text-xs px-1.5 py-0.5 rounded border",
                                            item.status === 'verified' || item.status === 'paid'
                                                ? "bg-green-500/10 text-green-400 border-green-500/20"
                                                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                                        )}>
                                            {item.status === 'verified' || item.status === 'paid' ? 'Verified' : 'Pending'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-3 ml-5">
                                        <div className="flex items-center gap-1.5 text-gray-400 text-xs text-ellipsis overflow-hidden whitespace-nowrap max-w-[120px]" title={item.originalData.paymentDetails?.utrNumber || item.originalData.utr || (item.installmentData as any)?.utrNumber}>
                                            <Banknote className="w-3 h-3 flex-shrink-0" />
                                            <span>{(item.installmentData as any)?.utrNumber || item.originalData.paymentDetails?.utrNumber || item.originalData.utr || 'No UTR'}</span>
                                        </div>
                                        <span className="font-mono font-bold text-white">₹{item.amount.toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
