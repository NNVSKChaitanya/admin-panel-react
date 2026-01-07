import { useState } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Cancellation } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: Cancellation | null;
    onSuccess: () => void;
}

export const UndoCancellationModal = ({ isOpen, onClose, data, onSuccess }: Props) => {
    const { currentYatra } = useAppStore();
    const [isUndoing, setIsUndoing] = useState(false);

    if (!isOpen || !data) return null;

    const handleUndo = async () => {
        if (!currentYatra || !data.id) return;
        setIsUndoing(true);

        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            await runTransaction(db, async (transaction) => {
                const originalRegRef = doc(db, 'registrations', data.originalRegistrationId);
                const originalDoc = await transaction.get(originalRegRef);

                if (originalDoc.exists()) {
                    // PARTIAL UNDO: Merge members back
                    const existingData = originalDoc.data() as any;
                    const members = [...(existingData.members || []), ...(data.cancelledMembers || [])];

                    transaction.update(originalRegRef, {
                        members: members,
                        // Update total amount approximately if needed, or leave for manual fix
                        // For basic restoration, simply putting members back is key.
                        updatedAt: new Date()
                    });
                } else {
                    // FULL RESTORE: Recreate document
                    let restoredData;

                    if (data.originalData) {
                        restoredData = {
                            ...data.originalData,
                            restoredAt: new Date(),
                            remarks: (data.originalData.remarks || '') + `\n[System] Restored from cancellation on ${new Date().toLocaleDateString()}`
                        };
                    } else {
                        // Fallback: Best Effort Restore
                        console.warn("Original data missing for cancellation undo. Performing best-effort restore.");

                        // Attempt to reconstruct total from members
                        let reconstructedTotal = (data.cancelledMembers || []).reduce((sum, m) => sum + (Number(m.packagePrice) || 0), 0);

                        // Fallback 2: Back-calculate from Refund Amount if available
                        if (reconstructedTotal === 0 && data.refundAmount && data.refundPercentageApplied) {
                            reconstructedTotal = Math.floor((data.refundAmount * 100) / data.refundPercentageApplied);
                        }

                        // Fallback 3: Use refund amount itself if it was a 100% refund or similar logic (weak fallback but better than 0)
                        if (reconstructedTotal === 0 && data.refundAmount) {
                            reconstructedTotal = data.refundAmount;
                        }

                        restoredData = {
                            id: data.originalRegistrationId, // Try to keep same ID
                            name: data.name,
                            phone: data.phone,
                            // We don't have address, email, etc.
                            members: data.cancelledMembers || [],
                            totalAmount: reconstructedTotal,
                            paymentStatus: 'pending_verification', // Reset status
                            // Initialize basic payment details container
                            paymentDetails: {
                                paymentType: 'full',
                                amountPaid: 0,
                                totalAmount: reconstructedTotal,
                                paymentStatus: 'pending_verification'
                            },
                            restoredAt: serverTimestamp(),
                            submittedAt: serverTimestamp(),
                            remarks: `[System] Restored from cancellation on ${new Date().toLocaleDateString()}. CAUTION: Original details (Address, Payment History) were lost and must be re-entered.`
                        } as any;
                    }

                    // Ensure submittedAt exists even for full restore
                    if (!restoredData.submittedAt) {
                        restoredData.submittedAt = serverTimestamp();
                    }
                    if (!restoredData.restoredAt) {
                        restoredData.restoredAt = serverTimestamp();
                    }

                    transaction.set(originalRegRef, restoredData);
                }

                // Delete the cancellation record
                const cancelRef = doc(db, 'cancellations', data.id);
                transaction.delete(cancelRef);
            });

            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error undoing cancellation:", error);
            alert("Failed to undo cancellation. Original data might be missing.");
        } finally {
            setIsUndoing(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-sm rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl overflow-hidden animate-scale-in">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                        <RotateCcw className="w-8 h-8 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Undo Cancellation?</h2>
                    <p className="text-sm text-gray-400 mb-6">
                        This will restore <span className="text-white font-medium">{data.name}</span> to the active registrations list and remove this cancellation record.
                    </p>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleUndo}
                            disabled={isUndoing}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all"
                        >
                            {isUndoing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Undo'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
