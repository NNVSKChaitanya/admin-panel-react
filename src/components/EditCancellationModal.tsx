import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, User, Calculator, Train, CalendarDays } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, updateDoc, runTransaction } from 'firebase/firestore';
import type { Cancellation } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    cancellation: Cancellation | null;
}

const todayString = () => new Date().toISOString().split('T')[0];

/** Convert a Firestore Timestamp / Date / string to YYYY-MM-DD */
const toDateString = (val: any): string => {
    if (!val) return todayString();
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    if (val?.toDate) return val.toDate().toISOString().split('T')[0];
    if (val instanceof Date) return val.toISOString().split('T')[0];
    return todayString();
};

export const EditCancellationModal = ({ isOpen, onClose, cancellation }: Props) => {
    const { currentYatra } = useAppStore();
    const [isSaving, setIsSaving] = useState(false);

    // Editable fields
    const [refundStatus, setRefundStatus] = useState<string>('pending');
    const [refundUtr, setRefundUtr] = useState('');
    const [cancellationDate, setCancellationDate] = useState<string>(todayString());
    const [trainCharges, setTrainCharges] = useState<string>('0');
    const [amountPaidForCancelled, setAmountPaidForCancelled] = useState<string>('');
    const [manualRefundAmount, setManualRefundAmount] = useState<string>('');
    const [manualRefundPercent, setManualRefundPercent] = useState<string>('');
    const [useManualAmount, setUseManualAmount] = useState(false);
    const [remarks, setRemarks] = useState('');

    useEffect(() => {
        if (cancellation) {
            setRefundStatus(cancellation.refundStatus || 'pending');
            setRefundUtr(cancellation.refundUtr || '');
            setCancellationDate(
                cancellation.cancellationDate || toDateString(cancellation.cancelledAt)
            );
            setTrainCharges(String(cancellation.trainCancellationCharges ?? 0));
            // Populate amountPaidForCancelled: prefer stored field, fallback to prorating from originalData
            let paidForCancelled = 0;
            if (typeof cancellation.amountPaidForCancelled === 'number') {
                paidForCancelled = cancellation.amountPaidForCancelled;
                setAmountPaidForCancelled(String(cancellation.amountPaidForCancelled));
            } else {
                const orig = cancellation.originalData;
                const totalPaid = orig?.paymentDetails?.amountPaid ?? (orig as any)?.amountPaid ?? orig?.totalAmount ?? 0;
                const totalMembers = orig?.members?.length || cancellation.cancelledMembers?.length || 1;
                const cancelledCount = cancellation.cancelledMembers?.length || 1;
                const prorated = Math.round((totalPaid / totalMembers) * cancelledCount);
                paidForCancelled = prorated;
                setAmountPaidForCancelled(prorated > 0 ? String(prorated) : '');
            }
            setManualRefundAmount(String(cancellation.refundAmount ?? ''));
            setManualRefundPercent(String(cancellation.refundPercentageApplied ?? ''));
            setRemarks(cancellation.remarks || '');

            // Auto-detect if a manual override was previously applied:
            // Recalculate what the policy-based refund would be and compare with stored refundAmount.
            // If they differ, the user must have manually overridden it previously — preserve their override.
            const savedRefund = cancellation.refundAmount ?? 0;
            const savedPct = cancellation.refundPercentageApplied;
            const trainDed = cancellation.trainCancellationCharges ?? 0;
            const cancelDateStr = cancellation.cancellationDate || toDateString(cancellation.cancelledAt);
            const cancelDate = new Date(cancelDateStr + 'T00:00:00');
            let policyPct = 0;
            if (currentYatra?.policy && currentYatra.policy.length > 0) {
                const policy = [...currentYatra.policy].sort(
                    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                const rule = policy.find(r => cancelDate <= new Date(r.date + 'T23:59:59'));
                policyPct = rule ? rule.refund : 0;
            }
            const policyGross = Math.floor((paidForCancelled * policyPct) / 100);
            const policyNet = Math.max(0, policyGross - trainDed);

            // Enable manual override if saved values differ from policy calculation
            const wasManuallyOverridden = (
                (typeof savedPct === 'number' && savedPct !== policyPct) ||
                (typeof savedRefund === 'number' && savedRefund !== policyNet)
            );
            setUseManualAmount(!!wasManuallyOverridden);
        }
    }, [cancellation, currentYatra]);

    // Recalculate based on policy + chosen date
    const { policyPercentage, calculatedGross, calculatedNet } = useMemo(() => {
        if (!cancellation) return { policyPercentage: 0, calculatedGross: 0, calculatedNet: 0 };

        const cancelDate = new Date(cancellationDate + 'T00:00:00');
        let pct = 0;

        if (currentYatra?.policy && currentYatra.policy.length > 0) {
            const policy = [...currentYatra.policy].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
            const rule = policy.find(r => cancelDate <= new Date(r.date + 'T23:59:59'));
            pct = rule ? rule.refund : 0;
        }

        // Use the editable amountPaidForCancelled value for refund calculation
        const paidForCancelled = parseFloat(amountPaidForCancelled) || 0;
        const gross = Math.floor((paidForCancelled * pct) / 100);
        const deduction = parseFloat(trainCharges) || 0;
        const net = Math.max(0, gross - deduction);

        return { policyPercentage: pct, calculatedGross: gross, calculatedNet: net };
    }, [cancellation, cancellationDate, trainCharges, currentYatra, amountPaidForCancelled]);

    // What actually gets saved as refundAmount
    const effectiveRefundAmount = useMemo(() => {
        if (useManualAmount) {
            return parseFloat(manualRefundAmount) || 0;
        }
        return calculatedNet;
    }, [useManualAmount, manualRefundAmount, calculatedNet]);

    // When in manual override mode, keep the net refund in sync if train charges or paid amount changes.
    // The stored % is the gross %; train charges are always deducted on top of it.
    useEffect(() => {
        if (!useManualAmount) return;
        const pct = parseFloat(manualRefundPercent);
        if (isNaN(pct) || pct <= 0) return;
        const paid = parseFloat(amountPaidForCancelled) || 0;
        const train = parseFloat(trainCharges) || 0;
        const newNet = Math.max(0, Math.floor(paid * pct / 100) - train);
        setManualRefundAmount(String(newNet));
    }, [trainCharges, amountPaidForCancelled, useManualAmount]); // intentionally NOT including manualRefundPercent to avoid loops

    if (!isOpen || !cancellation) return null;

    const handleSave = async () => {
        if (!currentYatra) return;
        try {
            setIsSaving(true);
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const newRefundAmount = effectiveRefundAmount;
            const oldRefundAmount = cancellation.refundAmount ?? 0;
            const refundDelta = newRefundAmount - oldRefundAmount;

            const cancRef = doc(db, 'cancellations', cancellation.id);
            const regId = cancellation.originalRegistrationId;

            const cancUpdates: Record<string, any> = {
                refundStatus,
                refundUtr: refundUtr.trim() || null,
                cancellationDate,
                trainCancellationCharges: parseFloat(trainCharges) || 0,
                amountPaidForCancelled: parseFloat(amountPaidForCancelled) || 0,
                refundAmount: newRefundAmount,
                refundPercentageApplied: useManualAmount
                    ? (parseFloat(manualRefundPercent) || null)
                    : policyPercentage,
                remarks: remarks.trim() || null,
            };

            // Always update the cancellation record — this is the source of truth
            // for Dashboard financial calculations.
            // Also try to update the source registration if it exists (for partial cancellations
            // where the registration is still active). This is best-effort.
            if (refundDelta !== 0 && regId) {
                await runTransaction(db, async (transaction) => {
                    const regRef = doc(db, 'registrations', regId);
                    const regSnap = await transaction.get(regRef);

                    // 1. Always update cancellation
                    transaction.update(cancRef, cancUpdates);

                    // 2. Best-effort: sync active registration's amountPaid
                    if (regSnap.exists()) {
                        const regData = regSnap.data();
                        // Only update if registration is still active (not soft-cancelled)
                        if (regData.status !== 'cancelled') {
                            if (regData.paymentDetails) {
                                const currentAmountPaid = regData.paymentDetails?.amountPaid ?? 0;
                                const newAmountPaid = Math.max(0, currentAmountPaid - refundDelta);
                                transaction.update(regRef, { 'paymentDetails.amountPaid': newAmountPaid });
                            } else {
                                const currentTotal = regData.totalAmount ?? 0;
                                const newTotal = Math.max(0, currentTotal - refundDelta);
                                transaction.update(regRef, { totalAmount: newTotal });
                            }
                        }
                    }
                });
            } else {
                await updateDoc(cancRef, cancUpdates);
            }

            onClose();
        } catch (error) {
            console.error('Error updating cancellation:', error);
            alert('Failed to update cancellation. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-gray-900 border border-white/10 rounded-xl shadow-2xl max-h-[92vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white">Edit Cancellation Details</h2>
                        <p className="text-sm text-gray-400 mt-1">Adjust refund, charges &amp; status</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">

                    {/* Read-Only Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Booking Info</h3>
                            <div className="space-y-3">
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <span className="block text-xs text-gray-500 mb-1">Primary Traveler</span>
                                    <div className="font-medium text-white">{cancellation.name}</div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <span className="block text-xs text-gray-500 mb-1">Contact Phone</span>
                                    <div className="font-medium text-white">{cancellation.phone}</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Cancelled Members</h3>
                            <div className="space-y-2 max-h-[130px] overflow-y-auto pr-1">
                                {cancellation.cancelledMembers?.length > 0 ? (
                                    cancellation.cancelledMembers.map((member, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-2.5 bg-white/5 rounded-lg border border-white/5">
                                            <div className="p-1.5 bg-red-500/10 rounded-full text-red-400 flex-shrink-0">
                                                <User className="w-3.5 h-3.5" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-gray-200">{member.name}</div>
                                                <div className="text-xs text-gray-500">{member.age} yrs • {member.gender}</div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-gray-500 italic text-sm">No member details available.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Cancellation Date */}
                    <div className="border-t border-white/10 pt-5">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-blue-400" /> Cancellation Date
                        </h3>
                        <div>
                            <label className="block text-sm text-gray-300 mb-1.5">
                                Cancellation Date
                                <span className="ml-2 text-xs text-gray-500">(used for policy calculation)</span>
                            </label>
                            <input
                                type="date"
                                value={cancellationDate}
                                onChange={e => setCancellationDate(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                            />
                        </div>
                    </div>

                    {/* Amount Paid for Cancelled Members */}
                    <div className="border-t border-white/10 pt-5">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                            Amount Paid (for cancelled members)
                        </h3>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                            <input
                                type="number"
                                min="0"
                                value={amountPaidForCancelled}
                                onChange={e => setAmountPaidForCancelled(e.target.value)}
                                placeholder="e.g. 5000"
                                className="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1.5">
                            Prorated share of total payment for the cancelled members. Used to calculate refund amount.
                        </p>
                    </div>

                    {/* Train Charges */}
                    <div className="border-t border-white/10 pt-5">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Train className="w-4 h-4 text-amber-400" /> Train Ticket Cancellation Charges
                        </h3>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                            <input
                                type="number"
                                min="0"
                                value={trainCharges}
                                onChange={e => setTrainCharges(e.target.value)}
                                placeholder="0"
                                className="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-amber-500/50 outline-none"
                            />
                        </div>
                        <p className="text-xs text-amber-400/60 mt-1.5">Will be deducted from the calculated refund amount.</p>
                    </div>

                    {/* Refund Calculation Preview */}
                    <div className="border-t border-white/10 pt-5">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-purple-400" /> Refund Calculation
                        </h3>

                        <div className="grid grid-cols-3 gap-3 text-center mb-4">
                            <div className="bg-black/20 rounded-lg p-3">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Policy %</span>
                                <span className="block text-xl font-bold text-yellow-400">{policyPercentage}%</span>
                            </div>
                            <div className="bg-black/20 rounded-lg p-3">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Gross Refund</span>
                                <span className="block text-xl font-bold text-blue-400">₹{calculatedGross.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="bg-black/20 rounded-lg p-3">
                                <span className="block text-xs text-gray-500 uppercase mb-1">Net Refund</span>
                                <span className="block text-xl font-bold text-emerald-400">₹{calculatedNet.toLocaleString('en-IN')}</span>
                            </div>
                        </div>

                        {/* Manual Override Toggle */}
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10 mb-3">
                            <input
                                type="checkbox"
                                id="manualOverride"
                                checked={useManualAmount}
                                onChange={e => setUseManualAmount(e.target.checked)}
                                className="w-4 h-4 accent-purple-500"
                            />
                            <label htmlFor="manualOverride" className="text-sm text-gray-300 cursor-pointer select-none">
                                Override with custom refund amount
                            </label>
                        </div>

                        {useManualAmount && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">Custom Refund Amount (₹)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                                        <input
                                            type="number"
                                            min="0"
                                            value={manualRefundAmount}
                                            onChange={e => {
                                                const amt = e.target.value;
                                                setManualRefundAmount(amt);
                                                // Back-calculate %: (amount + trainCharges) / amountPaid * 100
                                                const paid = parseFloat(amountPaidForCancelled) || 0;
                                                const train = parseFloat(trainCharges) || 0;
                                                if (paid > 0) {
                                                    const pct = Math.round(((parseFloat(amt) || 0) + train) / paid * 100);
                                                    setManualRefundPercent(String(Math.min(100, Math.max(0, pct))));
                                                }
                                            }}
                                            className="w-full bg-black/20 border border-purple-500/40 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">Effective Refund %</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={manualRefundPercent}
                                            onChange={e => {
                                                const pct = e.target.value;
                                                setManualRefundPercent(pct);
                                                // Forward-calculate amount: paid * pct/100 - trainCharges
                                                const paid = parseFloat(amountPaidForCancelled) || 0;
                                                const train = parseFloat(trainCharges) || 0;
                                                const amt = Math.max(0, Math.floor(paid * (parseFloat(pct) || 0) / 100) - train);
                                                setManualRefundAmount(String(amt));
                                            }}
                                            className="w-full bg-black/20 border border-purple-500/40 rounded-lg px-4 pr-8 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                            <span className="text-xs text-gray-400">Final Refund Amount to be stored: </span>
                            <span className="text-lg font-bold text-emerald-400 ml-2">₹{effectiveRefundAmount.toLocaleString('en-IN')}</span>
                        </div>
                    </div>

                    {/* Refund Status & UTR */}
                    <div className="border-t border-white/10 pt-5">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Refund Status</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Current Status</label>
                                <select
                                    value={refundStatus}
                                    onChange={e => setRefundStatus(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="processing">Processing</option>
                                    <option value="completed">Completed</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Refund Transaction ID / UTR</label>
                                <input
                                    type="text"
                                    value={refundUtr}
                                    onChange={e => setRefundUtr(e.target.value)}
                                    placeholder="e.g. UPI/REF/1234567890"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-gray-600"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Remarks */}
                    <div className="border-t border-white/10 pt-5">
                        <label className="block text-sm font-semibold text-gray-300 mb-1.5">Remarks / Notes</label>
                        <textarea
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            rows={2}
                            placeholder="Add any admin notes..."
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none placeholder:text-gray-600 resize-none"
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-lg border border-white/10 text-gray-300 font-medium hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
