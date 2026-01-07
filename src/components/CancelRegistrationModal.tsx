import { useState, useMemo } from 'react';
import { X, AlertTriangle, Calculator, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Registration } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: Registration | null;
    onSuccess: () => void;
}

export const CancelRegistrationModal = ({ isOpen, onClose, data, onSuccess }: Props) => {
    const { currentYatra } = useAppStore();
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Calculate Refund Logic
    const { refundPercentage, refundAmount } = useMemo(() => {
        if (!data || !currentYatra?.policy) return { refundPercentage: 0, refundAmount: 0 };

        const today = new Date();
        const policy = [...currentYatra.policy].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Find the matching rule: First rule where today <= rule.date
        // Policy dates usually mean "Cancel ON or BEFORE this date to get X%"
        const applicableRule = policy.find(rule => today <= new Date(rule.date));

        // If no rule matches (i.e. we are past all dates), assume 0% or fallback to last rule? 
        // Usually means 0 refund if past all deadlines.
        const pct = applicableRule ? applicableRule.refund : 0;

        // Calculate prorated amount
        // Simplification: We assume totalAmount is evenly distributed per member for now
        // OR we use specific member prices if available.
        const paid = data.paymentDetails?.amountPaid || (data as any).amountPaid || data.totalAmount || 0;

        // ... rest of memo logic

        // Return only what is needed
        // ...

        // (Skipping large chunk, let's target the TRY block specifically first? No, I must fix amountPaid first as requested by Plan)
        // I will do amountPaid fix here. The try block fix will be separate call or combined if I see context.
        // Wait, replace_file_content works on line ranges. I can't do both easily if far apart.
        // Line 39 is amountPaid. Line 87 is try block.
        // I will fix amountPaid here.

        // If cancelling specific members, we need to know their share.
        // For Puri (Flat fee), we might just divide by total members count.
        const totalMembers = data.members?.length || 1;
        const memberShare = paid / totalMembers;

        // const cancellingCount = selectedMembers.length > 0 ? selectedMembers.length : totalMembers; // Unused
        // Let's force selection for partial, or a "Cancel All" toggle. 
        // For v1, let's assume "Cancel Whole Registration" if no members selected, or build UI to select.

        // Let's go with: User MUST select members to cancel.
        const amountSubjectToRefund = memberShare * selectedMembers.length;
        const refundAmt = (amountSubjectToRefund * pct) / 100;

        return {
            refundPercentage: pct,
            refundAmount: Math.floor(refundAmt)
        };

    }, [data, currentYatra, selectedMembers]);

    if (!isOpen || !data) return null;

    const toggleMember = (name: string) => {
        if (selectedMembers.includes(name)) {
            setSelectedMembers(prev => prev.filter(m => m !== name));
        } else {
            setSelectedMembers(prev => [...prev, name]);
        }
    };

    const selectAll = () => {
        if (selectedMembers.length === data.members.length) setSelectedMembers([]);
        else setSelectedMembers(data.members.map(m => m.name));
    }

    const handleConfirmCancel = async () => {
        if (selectedMembers.length === 0) {
            alert("Please select at least one member to cancel.");
            return;
        }
        if (!currentYatra || !data.id) return;

        setIsProcessing(true);

        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const regRef = doc(db, 'registrations', data.id);
            const cancelRef = doc(collection(db, 'cancellations')); // Auto-ID

            await runTransaction(db, async (transaction) => {
                const regDoc = await transaction.get(regRef);
                if (!regDoc.exists()) throw "Document does not exist!";

                const currentData = regDoc.data() as Registration;

                // Identify members to keep and remove
                const membersToKeep = currentData.members.filter(m => !selectedMembers.includes(m.name));
                const membersToCancel = currentData.members.filter(m => selectedMembers.includes(m.name));

                if (membersToKeep.length === 0) {
                    // Full Cancellation -> Delete Registration or Mark as Cancelled?
                    // Usually we move to cancellations collection and delete original to keep 'registrations' clean
                    // OR we add a 'status: cancelled' field. 
                    // Based on legacy app, we output to 'cancellations' collection.

                    transaction.delete(regRef);
                } else {
                    // Partial Cancellation -> Update members list
                    transaction.update(regRef, {
                        members: membersToKeep,
                        // Update total amount if needed? Logic gets complex here for partial payments.
                        // For now, let's just update the members list. The financials might need manual adjustment
                        // or complex logic. Let's assume manual financial correction for partials for now.
                        updatedAt: serverTimestamp()
                    });
                }

                // Create Cancellation Record
                transaction.set(cancelRef, {
                    originalRegistrationId: data.id,
                    name: data.name, // Primary contact
                    phone: data.phone,
                    cancelledMembers: membersToCancel,
                    refundAmount: refundAmount,
                    refundStatus: 'pending',
                    cancelledAt: serverTimestamp(),
                    refundPercentageApplied: refundPercentage,
                    yatraId: currentYatra.id,
                    originalData: currentData // Save full snapshot for restoration
                });
            });

            onSuccess();
            onClose();

        } catch (error) {
            console.error("Cancellation failed:", error);
            alert("Failed to process cancellation.");
        } finally {
            setIsProcessing(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-scale-in">

                <div className="p-6 border-b border-white/5 bg-red-500/10 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> Cancel Registration
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6">

                    {/* Member Selection */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-gray-300">Select Travellers to Cancel</h3>
                            <button onClick={selectAll} className="text-xs text-purple-400 hover:text-purple-300">
                                {selectedMembers.length === data.members.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                            {data.members.map((member, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => toggleMember(member.name)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${selectedMembers.includes(member.name)
                                        ? 'bg-red-500/20 border-red-500/50 text-white'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedMembers.includes(member.name) ? 'bg-red-500 border-red-500' : 'border-gray-500'
                                        }`}>
                                        {selectedMembers.includes(member.name) && <X className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-medium">{member.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Refund Calculation */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-purple-400" /> Refund Calculation
                        </h3>

                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase">Members</span>
                                <span className="block text-lg font-bold text-white">{selectedMembers.length}</span>
                            </div>
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase">Policy Refund</span>
                                <span className="block text-lg font-bold text-yellow-400">{refundPercentage}%</span>
                            </div>
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase">Est. Amount</span>
                                <span className="block text-lg font-bold text-green-400">₹{refundAmount.toLocaleString()}</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3 text-center">
                            Based on cancellation policy for today ({new Date().toLocaleDateString()}).
                        </p>
                    </div>

                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-sm text-yellow-200">
                            <strong>Note:</strong> This action cannot be undone. cancelled members will be moved to the Cancellations list.
                        </p>
                    </div>

                </div>

                <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-gray-900/50">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">Abort</button>
                    <button
                        onClick={handleConfirmCancel}
                        disabled={isProcessing || selectedMembers.length === 0}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                        Confirm Cancellation
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
