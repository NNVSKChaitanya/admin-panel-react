import { useState, useMemo } from 'react';
import { X, AlertTriangle, Calculator, Loader2, Train } from 'lucide-react';
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

// Helper: YYYY-MM-DD of today (local)
const todayString = () => new Date().toISOString().split('T')[0];

export const CancelRegistrationModal = ({ isOpen, onClose, data, onSuccess }: Props) => {
    const { currentYatra } = useAppStore();
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Cancellation date — defaults to today, can be overridden
    const [cancellationDate, setCancellationDate] = useState<string>(todayString());

    // Train ticket cancellation charges
    const [trainCharges, setTrainCharges] = useState<string>('0');

    // Remarks
    const [remarks, setRemarks] = useState('');

    // Calculate Refund Logic based on chosen cancellation date
    const { refundPercentage, grossRefundAmount, netRefundAmount, amountPaidForCancelled } = useMemo(() => {
        if (!data) return { refundPercentage: 0, grossRefundAmount: 0, netRefundAmount: 0, amountPaidForCancelled: 0 };

        const cancelDate = new Date(cancellationDate + 'T00:00:00');
        let pct = 0;

        if (currentYatra?.policy && currentYatra.policy.length > 0) {
            const policy = [...currentYatra.policy].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            // First rule where cancellation date <= rule.date
            const applicableRule = policy.find(rule => cancelDate <= new Date(rule.date + 'T23:59:59'));
            pct = applicableRule ? applicableRule.refund : 0;
        }

        const paid = data.paymentDetails?.amountPaid || (data as any).amountPaid || data.totalAmount || 0;
        const totalMembers = data.members?.length || 1;
        const memberShare = paid / totalMembers;
        const proratedPaid = Math.round(memberShare * selectedMembers.length);
        const gross = Math.floor((proratedPaid * pct) / 100);

        const trainDeduction = parseFloat(trainCharges) || 0;
        const net = Math.max(0, gross - trainDeduction);

        return { refundPercentage: pct, grossRefundAmount: gross, netRefundAmount: net, amountPaidForCancelled: proratedPaid };
    }, [data, currentYatra, selectedMembers, cancellationDate, trainCharges]);

    if (!isOpen || !data) return null;

    const toggleMember = (name: string) => {
        setSelectedMembers(prev =>
            prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
        );
    };

    const selectAll = () => {
        if (selectedMembers.length === data.members.length) setSelectedMembers([]);
        else setSelectedMembers(data.members.map(m => m.name));
    };

    const handleConfirmCancel = async () => {
        if (selectedMembers.length === 0) {
            alert('Please select at least one member to cancel.');
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

            const trainDeduction = parseFloat(trainCharges) || 0;
            const isFullCancellation = selectedMembers.length === data.members.length;

            await runTransaction(db, async (transaction) => {
                const regDoc = await transaction.get(regRef);
                if (!regDoc.exists()) throw 'Document does not exist!';

                const currentData = regDoc.data() as Registration;

                const membersToKeep = currentData.members.filter(m => !selectedMembers.includes(m.name));
                const membersToCancel = currentData.members.filter(m => selectedMembers.includes(m.name));

                // --- Financial adjustment: subtract refund from amountPaid ---
                const currentPaymentDetails = currentData.paymentDetails;
                const currentAmountPaid: number =
                    currentPaymentDetails?.amountPaid ?? (currentData as any).amountPaid ?? currentData.totalAmount ?? 0;
                const newAmountPaid = Math.max(0, currentAmountPaid - netRefundAmount);

                // Build the updated paymentDetails, keeping all existing fields
                const updatedPaymentDetails = currentPaymentDetails
                    ? { ...currentPaymentDetails, amountPaid: newAmountPaid }
                    : undefined;

                if (isFullCancellation) {
                    // Soft-delete: keep doc for financial history but mark as cancelled
                    const softDeleteUpdate: Record<string, any> = {
                        status: 'cancelled',
                        members: [],
                        updatedAt: serverTimestamp(),
                    };
                    if (updatedPaymentDetails) {
                        softDeleteUpdate.paymentDetails = updatedPaymentDetails;
                    } else {
                        // Simple yatra with top-level amountPaid
                        softDeleteUpdate.amountPaid = newAmountPaid;
                        softDeleteUpdate.totalAmount = newAmountPaid;
                    }
                    transaction.update(regRef, softDeleteUpdate);
                } else {
                    // Partial: update members list + reduce amountPaid
                    const partialUpdate: Record<string, any> = {
                        members: membersToKeep,
                        updatedAt: serverTimestamp(),
                    };
                    if (updatedPaymentDetails) {
                        partialUpdate.paymentDetails = updatedPaymentDetails;
                    } else {
                        partialUpdate.amountPaid = newAmountPaid;
                        partialUpdate.totalAmount = newAmountPaid;
                    }
                    transaction.update(regRef, partialUpdate);
                }

                // Create Cancellation Record
                transaction.set(cancelRef, {
                    originalRegistrationId: data.id,
                    name: data.name,
                    phone: data.phone,
                    cancelledMembers: membersToCancel,
                    amountPaidForCancelled,          // prorated amount for cancelled members
                    refundAmount: netRefundAmount,
                    refundStatus: 'pending',
                    cancelledAt: serverTimestamp(),
                    cancellationDate,               // user-specified date
                    refundPercentageApplied: refundPercentage,
                    trainCancellationCharges: trainDeduction,
                    remarks: remarks.trim() || null,
                    yatraId: currentYatra.id,
                    originalData: currentData
                });
            });

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Cancellation failed:', error);
            alert('Failed to process cancellation.');
        } finally {
            setIsProcessing(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-scale-in max-h-[92vh]">

                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-red-500/10 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-xl font-bold text-red-400 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> Cancel Registration
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">

                    {/* Cancellation Date */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                            Cancellation Date
                            <span className="ml-2 text-xs font-normal text-gray-500">(used for refund policy calculation)</span>
                        </label>
                        <input
                            type="date"
                            value={cancellationDate}
                            onChange={e => setCancellationDate(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none"
                        />
                    </div>

                    {/* Member Selection */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-gray-300">Select Travellers to Cancel</h3>
                            <button onClick={selectAll} className="text-xs text-purple-400 hover:text-purple-300">
                                {selectedMembers.length === data.members.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
                            {data.members.map((member, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => toggleMember(member.name)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 ${selectedMembers.includes(member.name)
                                        ? 'bg-red-500/20 border-red-500/50 text-white'
                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selectedMembers.includes(member.name) ? 'bg-red-500 border-red-500' : 'border-gray-500'}`}>
                                        {selectedMembers.includes(member.name) && <X className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-medium truncate">{member.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Train Ticket Cancellation Charges */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                            <Train className="w-4 h-4" /> Train Ticket Cancellation Charges
                        </h3>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                            <input
                                type="number"
                                min="0"
                                value={trainCharges}
                                onChange={e => setTrainCharges(e.target.value)}
                                placeholder="0"
                                className="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none"
                            />
                        </div>
                        <p className="text-xs text-amber-400/60 mt-1.5">These charges will be deducted from the calculated refund amount.</p>
                    </div>

                    {/* Refund Calculation */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-purple-400" /> Refund Calculation
                        </h3>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Members</span>
                                <span className="block text-lg font-bold text-white">{selectedMembers.length}</span>
                            </div>
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Policy Refund</span>
                                <span className="block text-lg font-bold text-yellow-400">{refundPercentage}%</span>
                            </div>
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Gross Refund</span>
                                <span className="block text-lg font-bold text-blue-400">₹{grossRefundAmount.toLocaleString()}</span>
                            </div>
                            <div className="p-2 rounded bg-black/20">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Net Refund</span>
                                <span className="block text-lg font-bold text-green-400">₹{netRefundAmount.toLocaleString()}</span>
                            </div>
                        </div>

                        {(parseFloat(trainCharges) || 0) > 0 && (
                            <p className="text-xs text-amber-400 mt-3 text-center">
                                Train charges of ₹{(parseFloat(trainCharges) || 0).toLocaleString()} deducted from gross refund.
                            </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2 text-center">
                            Based on cancellation policy for {new Date(cancellationDate + 'T12:00:00').toLocaleDateString()}.
                        </p>
                    </div>

                    {/* Remarks */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-300 mb-1.5">Remarks (optional)</label>
                        <textarea
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            rows={2}
                            placeholder="Add any notes about this cancellation..."
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 outline-none placeholder:text-gray-600 resize-none"
                        />
                    </div>

                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <p className="text-sm text-yellow-200">
                            <strong>Note:</strong> This action cannot be easily undone. Cancelled members will be moved to the Cancellations list.
                        </p>
                    </div>

                </div>

                <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-gray-900/50 flex-shrink-0">
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
