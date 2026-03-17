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
    type: 'full' | 'installment' | 'twoSharing' | 'member';
    index?: number; // Installment index or Member index
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
    const [draggedItems, setDraggedItems] = useState<PaymentItem[]>([]);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    
    // Toggle multiple member selection
    const toggleMemberSelection = (id: string) => {
        setSelectedMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
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
        const twoSharingAmount = currentYatra?.config?.twoSharingAmount || 0;

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

                    // Check if members have differing assignments specifically for this installment
                    const baseAssignedTo = assigned;
                    const memberAssignments = reg.members?.map((_, mIdx) => {
                        // For installments, we rely on a custom mapping or fallback to base
                        // Firestore doesn't inherently support m.assignedTo per installment yet, 
                        // so we check if there's an override like `inst.memberAssignments?.[mIdx]`
                        // If not, we just use the base installment assignment.
                        return (inst as any).memberAssignments?.[mIdx] !== undefined ? (inst as any).memberAssignments[mIdx] : baseAssignedTo;
                    });
                    
                    const allSame = memberAssignments?.length ? memberAssignments.every((a: any) => a === memberAssignments[0]) : true;

                    if (allSame) {
                        list.push({
                            id: `${reg.id}_inst_${idx}`,
                            registrationId: reg.id,
                            type: 'installment',
                            index: idx,
                            name: `${reg.name} (Inst. ${idx + 1})`,
                            amount: inst.amount,
                            status: inst.status,
                            assignedTo: memberAssignments?.[0] || baseAssignedTo,
                            originalData: reg,
                            installmentData: inst
                        });
                    } else {
                        // Split installment into members
                        reg.members?.forEach((m, mIdx) => {
                            let mAmount = 0;
                            if (m.packagePrice) mAmount = m.packagePrice;
                            else if (reg.members.length > 0) mAmount = inst.amount / reg.members.length;

                            list.push({
                                id: `${reg.id}_inst_${idx}_member_${mIdx}`,
                                registrationId: reg.id,
                                type: 'member',
                                index: mIdx,
                                name: `${m.name} (Inst. ${idx + 1})`,
                                amount: mAmount,
                                status: inst.status,
                                assignedTo: memberAssignments![mIdx] || baseAssignedTo,
                                originalData: reg,
                                installmentData: inst
                            });
                        });
                    }
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

                // Check if members have differing assignments
                const memberAssignments = reg.members?.map(m => m.assignedTo !== undefined ? m.assignedTo : assigned);
                const allSame = memberAssignments?.length ? memberAssignments.every(a => a === memberAssignments[0]) : true;

                if (allSame) {
                    list.push({
                        id: `${reg.id}_full`,
                        registrationId: reg.id,
                        type: 'full',                 // Kept as 'full' so the drag individually UI logic works
                        name: reg.name,
                        amount: reg.paymentDetails?.amountPaid || reg.totalAmount,
                        status: reg.paymentStatus,
                        assignedTo: memberAssignments?.[0] || assigned,
                        originalData: reg
                    });
                } else {
                    // Split into individual member cards if they have different assignments
                    reg.members?.forEach((m, idx) => {
                        let mAmount = 0;
                        if (m.packagePrice) mAmount = m.packagePrice;
                        else if (reg.members.length > 0) mAmount = (reg.paymentDetails?.amountPaid || reg.totalAmount) / reg.members.length;

                        list.push({
                            id: `${reg.id}_member_${idx}`,
                            registrationId: reg.id,
                            type: 'member',           // These are already split, so they drag as individuals
                            index: idx,
                            name: `${m.name} (${reg.name})`,
                            amount: mAmount,
                            status: reg.paymentStatus,
                            assignedTo: m.assignedTo !== undefined && m.assignedTo !== null ? m.assignedTo : assigned,
                            originalData: reg
                        });
                    });
                }
            }

            // 2-Sharing Premium: create a separate card if members have isTwoSharing
            // Works for both: Puri-style (no installments) and Hampi-style (with installments)
            const hasTwoSharingMembers = reg.members?.some(m => m.isTwoSharing);
            const existingTwoSharingInstallment = reg.paymentDetails?.installments?.find(i => i.name === '2 Sharing Premium');

            if (hasTwoSharingMembers && !existingTwoSharingInstallment) {
                // No installment entry for 2-sharing — create a standalone card
                const twoSharingCount = reg.members!.filter(m => m.isTwoSharing).length;
                const perPersonFee = twoSharingAmount || 0;
                const totalTwoSharingFee = twoSharingCount * perPersonFee;

                let twoSharingAssigned: 'chaitanya' | 'narayana' | 'cash' | 'unassigned' = 'unassigned';
                if (reg.paymentDetails?.twoSharingAssignedTo) {
                    twoSharingAssigned = reg.paymentDetails.twoSharingAssignedTo;
                }

                list.push({
                    id: `${reg.id}_2sharing`,
                    registrationId: reg.id,
                    type: 'twoSharing',
                    name: `${reg.name} (2-Sharing)`,
                    amount: totalTwoSharingFee,
                    status: twoSharingAssigned !== 'unassigned' ? 'paid' : 'pending',
                    assignedTo: twoSharingAssigned,
                    originalData: reg
                });
            }
        });
        return list;
    }, [registrations, currentYatra]);

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
                today.setHours(0, 0, 0, 0);
                if ((item.status !== 'verified' && item.status !== 'paid') && dueDate < today) return true;
            }

            // 3. Show unassigned 2-Sharing items (both standalone and installment-based)
            if (item.type === 'twoSharing') {
                return item.assignedTo === 'unassigned';
            }

            // 4. Show unassigned '2 Sharing Premium' installments
            if (item.type === 'installment' && item.installmentData?.name === '2 Sharing Premium' && item.assignedTo === 'unassigned') {
                return true;
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
        if (item.type === 'member' && selectedMemberIds.includes(item.id)) {
            // Reconstruct the selected items from the parent registrations
            // because they might not exist in the top-level `items` array yet.
            const selectedItems: PaymentItem[] = [];
            
            selectedMemberIds.forEach(id => {
                // Find if it's already a standalone member item
                const existing = items.find(i => i.id === id);
                if (existing) {
                    selectedItems.push(existing);
                } else {
                    // It must be a sub-member inside a parent card. 
                    // Parse the ID format: '{regId}_member_{mIdx}' or '{regId}_inst_{idx}_member_{mIdx}'
                    const parentRegId = id.split('_')[0];
                    const parentCard = items.find(i => i.registrationId === parentRegId && (i.type === 'full' || i.type === 'installment'));
                    
                    if (parentCard) {
                        const mIdxStr = id.split('_').pop();
                        const mIdx = mIdxStr ? parseInt(mIdxStr, 10) : 0;
                        const m = parentCard.originalData.members?.[mIdx];
                        if (m) {
                            const mAmount = m.packagePrice || (parentCard.amount / (parentCard.originalData.members?.length || 1));
                            selectedItems.push({
                                id: id,
                                registrationId: parentCard.registrationId,
                                type: 'member',
                                index: mIdx,
                                name: `${m.name} (${parentCard.originalData.name})`,
                                amount: mAmount,
                                status: parentCard.status,
                                assignedTo: parentCard.assignedTo,
                                originalData: parentCard.originalData,
                                installmentData: parentCard.installmentData
                            });
                        }
                    }
                }
            });
            setDraggedItems(selectedItems);
        } else {
            setDraggedItems([item]);
        }
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (targetColumn: 'chaitanya' | 'narayana' | 'cash' | 'unassigned') => {
        if (draggedItems.length === 0 || !currentYatra) return;

        // Filter out items that are already in the target column
        const itemsToMoveList = draggedItems.filter(item => item.assignedTo !== targetColumn);
        if (itemsToMoveList.length === 0) {
            setDraggedItems([]);
            return;
        }

        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            // Group by registrationId to optimize writes and avoid array clobbering within same doc
            const groupedByReg = itemsToMoveList.reduce((acc, item) => {
                if (!acc[item.registrationId]) acc[item.registrationId] = [];
                acc[item.registrationId].push(item);
                return acc;
            }, {} as Record<string, PaymentItem[]>);

            for (const [regId, itemsToMove] of Object.entries(groupedByReg)) {
                const baseData = itemsToMove[0].originalData;
                const regRef = doc(db, 'registrations', regId);
                const updates: any = {};
                
                const members = [...(baseData.members || [])];
                const installments = [...(baseData.paymentDetails?.installments || [])];
                let hasMemberUpdates = false;
                let hasInstallmentUpdates = false;

                itemsToMove.forEach(item => {
                    if (item.type === 'twoSharing') {
                        // Updating 2-sharing assignment
                        updates['paymentDetails.twoSharingAssignedTo'] = targetColumn === 'unassigned' ? null : targetColumn;
                    } else if (item.type === 'installment' && typeof item.index === 'number') {
                        // Updating specific installment
                        if (installments[item.index]) {
                            installments[item.index] = {
                                ...installments[item.index],
                                assignedTo: targetColumn === 'unassigned' ? null : targetColumn,
                                status: targetColumn !== 'unassigned' ? 'paid' : installments[item.index].status
                            };
                            hasInstallmentUpdates = true;
                        }
                    } else if (item.type === 'member' && typeof item.index === 'number') {
                        // Updating specific member assignment
                        // Handle installment member assignment specifically if it's an installment
                        if (item.installmentData && typeof (item.installmentData as any).index === 'undefined') {
                            // Find the actual installment index in original data
                            const instIdx = installments.findIndex(i => i.name === item.installmentData!.name);
                            if (instIdx >= 0 && installments[instIdx]) {
                                const currentInst = installments[instIdx] as any;
                                const ms = currentInst.memberAssignments || [];
                                ms[item.index] = targetColumn === 'unassigned' ? null : targetColumn;
                                installments[instIdx] = {
                                    ...installments[instIdx],
                                    memberAssignments: ms
                                } as any;
                                hasInstallmentUpdates = true;
                            }
                        } else if (members[item.index]) {
                            members[item.index] = {
                                ...members[item.index],
                                assignedTo: targetColumn === 'unassigned' ? null : targetColumn
                            };
                            hasMemberUpdates = true;
                        }
                    } else if (item.type === 'full') {
                        // Updating main record (full payment)
                        updates['paymentDetails.assignedTo'] = targetColumn === 'unassigned' ? null : targetColumn;
                        if (targetColumn !== 'unassigned') {
                            updates['paymentStatus'] = 'verified';
                            updates['paymentDetails.paymentStatus'] = 'verified';
                        }
                        
                        // Overwrite any stray member assignments cleanly
                        members.forEach(m => {
                            if (m.assignedTo !== undefined) {
                                delete m.assignedTo;
                                hasMemberUpdates = true;
                            }
                        });
                    }
                });

                if (hasInstallmentUpdates) {
                    updates['paymentDetails.installments'] = installments;
                    
                    // Recalculate amountPaid
                    const newAmountPaid = installments.reduce((acc, inst) => {
                        return (inst.status === 'paid' || (inst.status as string) === 'verified') ? acc + (inst.amount || 0) : acc;
                    }, 0);
                    updates['paymentDetails.amountPaid'] = newAmountPaid;
                }

                if (hasMemberUpdates) {
                    updates['members'] = members;

                    // Check if ALL members now have the SAME target column (re-merging split cards)
                    const fallbackAssigned = baseData.paymentDetails?.assignedTo || null;
                    const allAssignedToTarget = members.every(m => {
                        const mAssigned = m.assignedTo !== undefined ? m.assignedTo : fallbackAssigned;
                        // For unassigned, we treat null and 'unassigned' as same
                        if (targetColumn === 'unassigned') return mAssigned === null || mAssigned === 'unassigned';
                        return mAssigned === targetColumn;
                    });

                    // If unanimous, merge back to parent assignment
                    // Only apply parent overwrite logic properly if we are dealing with a standard full payment
                    // that isn't overridden by partial multi-installment system. But Puri has simple assignedTo, so it works.
                    if (allAssignedToTarget) {
                        updates['paymentDetails.assignedTo'] = targetColumn === 'unassigned' ? null : targetColumn;
                        if (targetColumn !== 'unassigned') {
                            updates['paymentStatus'] = 'verified';
                            updates['paymentDetails.paymentStatus'] = 'verified';
                        }
                        // Strip specific assignments since the parent covers them all homogeneously
                        members.forEach(m => { delete m.assignedTo; });
                    }
                }

                // Firestore doesn't accept undefined values anywhere in the document.
                // The safest, 100% foolproof way to strip all `undefined` fields deeply
                // from a plain JavaScript object is to stringify and parse it.
                // JSON.stringify automatically omits any keys where the value is undefined.
                const stripUndefined = (obj: any) => JSON.parse(JSON.stringify(obj));

                if (Object.keys(updates).length > 0) {
                    const cleanUpdates = stripUndefined(updates);
                    await updateDoc(regRef, cleanUpdates);
                }
            }

        } catch (error: any) {
            console.error("Failed to update registration:", error);
            alert(`Failed to update. ${error?.message || error} - Please try again.`);
        } finally {
            setIsUpdating(false);
            setDraggedItems([]);
            setSelectedMemberIds([]); // Clear selection after drop
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
                                            {item.type === 'full' ? 'Full Payment' : item.type === 'twoSharing' ? '2-Sharing Premium' : item.installmentData?.name === '2 Sharing Premium' ? '2-Sharing Premium' : `Installment ${item.index! + 1}`}
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
                    selectedMemberIds={selectedMemberIds}
                    toggleMemberSelection={toggleMemberSelection}
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
                    selectedMemberIds={selectedMemberIds}
                    toggleMemberSelection={toggleMemberSelection}
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
                    selectedMemberIds={selectedMemberIds}
                    toggleMemberSelection={toggleMemberSelection}
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
                    selectedMemberIds={selectedMemberIds}
                    toggleMemberSelection={toggleMemberSelection}
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

const Column = ({ title, items, color, onDrop, onDragOver, onDragStart, highlightedId, selectedMemberIds, toggleMemberSelection }: any) => {
    const total = items.reduce((acc: number, item: any) => acc + (item.amount || 0), 0);

    // Grouping Logic
    const groupedItems = useMemo(() => {
        const groups: Record<string, any[]> = {
            'Full Payment': [],
            '1st Installment': [],
            '2nd Installment': [],
            '3rd Installment': [],
            '4th Installment': [],
            '2 Sharing': [],
            'Other': []
        };

        items.forEach((item: any) => {
            if (item.type === 'twoSharing') {
                groups['2 Sharing'].push(item);
            } else if (item.type === 'installment' && item.installmentData?.name === '2 Sharing Premium') {
                // Installment-based 2-sharing goes into the 2 Sharing group
                groups['2 Sharing'].push(item);
            } else if (item.type === 'full') {
                groups['Full Payment'].push(item);
            } else if (item.type === 'installment' && typeof item.index === 'number') {
                const idx = item.index;
                if (idx === 0) groups['1st Installment'].push(item);
                else if (idx === 1) groups['2nd Installment'].push(item);
                else if (idx === 2) groups['3rd Installment'].push(item);
                else if (idx === 3) groups['4th Installment'].push(item);
                else groups['Other'].push(item);
            } else if (item.type === 'member') {
                groups['Other'].push(item);
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
                                        <div className="flex items-start gap-2">
                                            {item.type === 'member' && (
                                                <input 
                                                    type="checkbox" 
                                                    className="mt-1 flex-shrink-0 cursor-pointer rounded border-gray-600 focus:ring-emerald-500 bg-gray-700"
                                                    checked={selectedMemberIds?.includes(item.id) || false}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        toggleMemberSelection(item.id);
                                                    }}
                                                />
                                            )}
                                            <div>
                                                <p className="font-medium text-gray-200 text-sm flex items-center gap-2">
                                                    <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-gray-400" />
                                                    {item.name}
                                                </p>
                                            </div>
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
                                    
                                    {/* Members Sub-Items for Full / Multi-member entries */}
                                    {(item.type === 'full' || item.type === 'installment') && item.originalData.members && item.originalData.members.length > 1 && (
                                        <div className="mt-3 pt-2 border-t border-white/5 space-y-1.5 cursor-default" onDragStart={() => {
                                            // Make sure dragging empty areas of members list doesn't drag the parent randomly
                                        }}>
                                            <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Drag Individually:</p>
                                            {item.originalData.members.map((m: any, mIdx: number) => {
                                                const mAmount = m.packagePrice || (item.amount / item.originalData.members.length);
                                                const subItemId = item.type === 'installment' 
                                                    ? `${item.registrationId}_inst_${item.index}_member_${mIdx}`
                                                    : `${item.registrationId}_member_${mIdx}`;
                                                return (
                                                    <div
                                                        key={`sub_${mIdx}`}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.stopPropagation(); // prevent parent from being dragged
                                                            onDragStart(e, {
                                                                id: subItemId,
                                                                registrationId: item.registrationId,
                                                                type: 'member',
                                                                index: mIdx,
                                                                name: `${m.name} (${item.originalData.name})`,
                                                                amount: mAmount,
                                                                status: item.status,
                                                                assignedTo: item.assignedTo,
                                                                originalData: item.originalData,
                                                                installmentData: item.installmentData
                                                            });
                                                        }}
                                                        className="bg-black/30 hover:bg-black/50 p-2 rounded flex justify-between items-center cursor-grab active:cursor-grabbing border border-white/5 transition-colors group/sub"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="checkbox"
                                                                className="cursor-pointer rounded border-gray-600 focus:ring-emerald-500 bg-gray-700"
                                                                checked={selectedMemberIds?.includes(subItemId) || false}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleMemberSelection(subItemId);
                                                                }}
                                                            />
                                                            <GripVertical className="w-3 h-3 text-gray-600 group-hover/sub:text-gray-400" />
                                                            <span className="text-xs text-gray-300 truncate max-w-[120px]">{m.name}</span>
                                                        </div>
                                                        <span className="text-xs font-mono text-gray-400">
                                                            ₹{mAmount.toLocaleString()}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
