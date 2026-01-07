import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, User } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { Cancellation } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    cancellation: Cancellation | null;
}

export const EditCancellationModal = ({ isOpen, onClose, cancellation }: Props) => {
    const { currentYatra } = useAppStore();
    const [isSaving, setIsSaving] = useState(false);
    const [refundStatus, setRefundStatus] = useState<string>('pending');
    const [refundUtr, setRefundUtr] = useState('');

    useEffect(() => {
        if (cancellation) {
            setRefundStatus(cancellation.refundStatus || 'pending');
            setRefundUtr(cancellation.refundUtr || '');
        }
    }, [cancellation]);

    if (!isOpen || !cancellation) return null;

    const handleSave = async () => {
        if (!currentYatra) return;
        try {
            setIsSaving(true);
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            await updateDoc(doc(db, 'cancellations', cancellation.id), {
                refundStatus,
                refundUtr
            });

            onClose();
        } catch (error) {
            console.error('Error updating cancellation:', error);
            alert('Failed to update cancellation.');
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-2xl bg-gray-900 border border-white/10 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white">Edit Refund Details</h2>
                        <p className="text-sm text-gray-400 mt-1">Manage refund status and transaction details</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-8">

                    {/* Read-Only Info Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Cancellation Info</h3>
                            <div className="space-y-4">
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <span className="block text-xs text-gray-500 mb-1">Primary Traveler</span>
                                    <div className="font-medium text-white">{cancellation.name}</div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <span className="block text-xs text-gray-500 mb-1">Contact Phone</span>
                                    <div className="font-medium text-white">{cancellation.phone}</div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <span className="block text-xs text-gray-500 mb-1">Refund Amount</span>
                                    <div className="font-mono text-xl text-emerald-400">₹{(cancellation.refundAmount || 0).toLocaleString('en-IN')}</div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <span className="block text-xs text-gray-500 mb-1">Original Remarks</span>
                                    <div className="text-sm text-gray-300 whitespace-pre-wrap">{cancellation.remarks || 'No remarks recorded.'}</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Cancelled Members</h3>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {cancellation.cancelledMembers && cancellation.cancelledMembers.length > 0 ? (
                                    cancellation.cancelledMembers.map((member, idx) => (
                                        <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                                            <div className="p-2 bg-red-500/10 rounded-full text-red-400">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-200">{member.name}</div>
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

                    <div className="border-t border-white/10 pt-6">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Edit Refund Status</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Current Status</label>
                                <select
                                    value={refundStatus}
                                    onChange={(e) => setRefundStatus(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
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
                                    onChange={(e) => setRefundUtr(e.target.value)}
                                    placeholder="e.g. UPI/REF/1234567890"
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none placeholder:text-gray-600"
                                />
                            </div>
                        </div>
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
                        {isSaving ? 'Saving Changes...' : 'Save Details'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
