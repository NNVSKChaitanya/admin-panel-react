import { useState, useMemo } from 'react';
import { X, Search, Loader2, GitMerge, AlertTriangle, Users, ArrowRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Registration } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, writeBatch } from 'firebase/firestore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    primaryRegistration: Registration | null;
    allRegistrations: Registration[];
    onSuccess: () => void;
}

export const MergeRegistrationsModal = ({ isOpen, onClose, primaryRegistration, allRegistrations, onSuccess }: Props) => {
    const { currentYatra } = useAppStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSecondary, setSelectedSecondary] = useState<Registration | null>(null);
    const [isMerging, setIsMerging] = useState(false);
    const [step, setStep] = useState<'select' | 'confirm'>('select');

    // Filter registrations for the search - must be before any conditional returns (Rules of Hooks)
    const filteredRegistrations = useMemo(() => {
        if (!primaryRegistration) return [];
        return allRegistrations.filter(reg => {
            if (reg.id === primaryRegistration.id) return false;
            if (reg.mergedInto) return false;

            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const matchesName = reg.name?.toLowerCase().includes(q);
            const matchesPhone = reg.phone?.toLowerCase().includes(q);
            const matchesMember = reg.members?.some(m => m.name.toLowerCase().includes(q));
            return matchesName || matchesPhone || matchesMember;
        });
    }, [allRegistrations, primaryRegistration?.id, searchQuery]);

    if (!isOpen || !primaryRegistration) return null;

    const handleSelectSecondary = (reg: Registration) => {
        setSelectedSecondary(reg);
        setStep('confirm');
    };

    const handleBack = () => {
        setSelectedSecondary(null);
        setStep('select');
    };

    const handleMerge = async () => {
        if (!currentYatra || !primaryRegistration || !selectedSecondary) return;

        setIsMerging(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const batch = writeBatch(db);
            const primaryRef = doc(db, 'registrations', primaryRegistration.id);
            const secondaryRef = doc(db, 'registrations', selectedSecondary.id);

            // 1. Combine members
            const combinedMembers = [
                ...(primaryRegistration.members || []),
                ...(selectedSecondary.members || [])
            ];

            // 2. Sum total amounts
            const combinedTotal = (primaryRegistration.totalAmount || 0) + (selectedSecondary.totalAmount || 0);

            // 3. Merge payment details
            const primaryPD = primaryRegistration.paymentDetails;
            const secondaryPD = selectedSecondary.paymentDetails;

            let mergedPaymentDetails = primaryPD ? { ...primaryPD } : undefined;

            if (secondaryPD) {
                if (mergedPaymentDetails) {
                    // Combine amounts
                    mergedPaymentDetails.amountPaid = (mergedPaymentDetails.amountPaid || 0) + (secondaryPD.amountPaid || 0);
                    mergedPaymentDetails.totalAmount = (mergedPaymentDetails.totalAmount || 0) + (secondaryPD.totalAmount || 0);

                    // Combine installments if both have them
                    if (secondaryPD.installments?.length) {
                        mergedPaymentDetails.installments = [
                            ...(mergedPaymentDetails.installments || []),
                            ...secondaryPD.installments
                        ];
                    }

                    // Keep payment proof from either
                    if (!mergedPaymentDetails.paymentProofUrl && secondaryPD.paymentProofUrl) {
                        mergedPaymentDetails.paymentProofUrl = secondaryPD.paymentProofUrl;
                    }
                    if (!mergedPaymentDetails.utrNumber && secondaryPD.utrNumber) {
                        mergedPaymentDetails.utrNumber = secondaryPD.utrNumber;
                    }
                } else {
                    mergedPaymentDetails = { ...secondaryPD };
                }
            }

            // 4. Merge tracking
            const mergedFrom = [
                ...(primaryRegistration.mergedFrom || []),
                selectedSecondary.id
            ];

            // 5. Combine remarks
            let combinedRemarks = primaryRegistration.remarks || '';
            if (selectedSecondary.remarks) {
                combinedRemarks = combinedRemarks
                    ? `${combinedRemarks}\n[Merged from ${selectedSecondary.name}]: ${selectedSecondary.remarks}`
                    : `[Merged from ${selectedSecondary.name}]: ${selectedSecondary.remarks}`;
            }

            // Update primary registration
            const primaryUpdate: any = {
                members: combinedMembers,
                totalAmount: combinedTotal,
                mergedFrom: mergedFrom,
                remarks: combinedRemarks,
                updatedAt: new Date().toISOString()
            };

            if (mergedPaymentDetails) {
                primaryUpdate.paymentDetails = mergedPaymentDetails;
            }

            // Preserve all data from secondary if primary doesn't have it
            if (!primaryRegistration.utr && selectedSecondary.utr) {
                primaryUpdate.utr = selectedSecondary.utr;
            }
            if (!primaryRegistration.screenshotUrl && selectedSecondary.screenshotUrl) {
                primaryUpdate.screenshotUrl = selectedSecondary.screenshotUrl;
            }
            if (!primaryRegistration.email && selectedSecondary.email) {
                primaryUpdate.email = selectedSecondary.email;
            }
            if (!primaryRegistration.whatsapp && selectedSecondary.whatsapp) {
                primaryUpdate.whatsapp = selectedSecondary.whatsapp;
            }
            if (!primaryRegistration.address && selectedSecondary.address) {
                primaryUpdate.address = selectedSecondary.address;
            }
            if (!primaryRegistration.joinedWhatsapp && selectedSecondary.joinedWhatsapp) {
                primaryUpdate.joinedWhatsapp = selectedSecondary.joinedWhatsapp;
            }

            batch.update(primaryRef, primaryUpdate);

            // Delete the secondary registration
            batch.delete(secondaryRef);

            await batch.commit();

            onSuccess();
            handleClose();
        } catch (error: any) {
            console.error("Failed to merge registrations:", error);
            alert(`Failed to merge: ${error.message || error}`);
        } finally {
            setIsMerging(false);
        }
    };

    const handleClose = () => {
        setSearchQuery('');
        setSelectedSecondary(null);
        setStep('select');
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

            <div className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-scale-in">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <GitMerge className="w-5 h-5 text-indigo-400" />
                            Merge Registrations
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Merging into: <span className="text-white font-medium">{primaryRegistration.name}</span>
                            <span className="text-gray-500 ml-2">({primaryRegistration.members?.length || 0} members)</span>
                        </p>
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">

                    {step === 'select' && (
                        <div className="space-y-4">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name, phone, or member name..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all"
                                    autoFocus
                                />
                            </div>

                            <p className="text-xs text-gray-500 px-1">
                                Select a registration to merge into <strong className="text-gray-300">{primaryRegistration.name}</strong>. The selected registration will be deleted and its members will be added to the primary.
                            </p>

                            {/* Registration List */}
                            <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                                {filteredRegistrations.map(reg => (
                                    <button
                                        key={reg.id}
                                        onClick={() => handleSelectSecondary(reg)}
                                        className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-white group-hover:text-indigo-300 transition-colors">{reg.name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{reg.phone}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded border border-white/10">
                                                    {reg.members?.length || 0} members
                                                </span>
                                                <p className="text-xs text-gray-500 mt-1 font-mono">₹{(reg.totalAmount || 0).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        {reg.members && reg.members.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {reg.members.map((m, idx) => (
                                                    <span key={idx} className="text-[10px] bg-black/30 text-gray-400 px-1.5 py-0.5 rounded border border-white/5">
                                                        {m.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                ))}
                                {filteredRegistrations.length === 0 && (
                                    <div className="text-center py-10 text-gray-500 text-sm">
                                        {searchQuery ? 'No matching registrations found.' : 'No other registrations available to merge.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 'confirm' && selectedSecondary && (
                        <div className="space-y-6">
                            {/* Warning */}
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-amber-200 text-sm font-medium mb-1">This action cannot be undone</p>
                                    <p className="text-amber-200/70 text-xs">
                                        The secondary registration will be permanently deleted. All its members and payment data will be merged into the primary registration.
                                    </p>
                                </div>
                            </div>

                            {/* Merge Preview */}
                            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-start">
                                {/* Secondary (Source) */}
                                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                                    <p className="text-xs text-red-400/70 uppercase tracking-wider font-bold mb-2">Will be deleted</p>
                                    <p className="font-bold text-white">{selectedSecondary.name}</p>
                                    <p className="text-xs text-gray-500">{selectedSecondary.phone}</p>
                                    <div className="mt-3 space-y-1">
                                        {selectedSecondary.members?.map((m, idx) => (
                                            <div key={idx} className="text-xs text-gray-400 flex items-center gap-1.5">
                                                <Users className="w-3 h-3" />
                                                {m.name} ({m.age}/{m.gender})
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 text-xs text-gray-500 font-mono">
                                        Total: ₹{(selectedSecondary.totalAmount || 0).toLocaleString()}
                                    </div>
                                </div>

                                {/* Arrow */}
                                <div className="flex items-center justify-center pt-10">
                                    <ArrowRight className="w-6 h-6 text-indigo-400" />
                                </div>

                                {/* Primary (Target) */}
                                <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10">
                                    <p className="text-xs text-green-400/70 uppercase tracking-wider font-bold mb-2">Merge target</p>
                                    <p className="font-bold text-white">{primaryRegistration.name}</p>
                                    <p className="text-xs text-gray-500">{primaryRegistration.phone}</p>
                                    <div className="mt-3 space-y-1">
                                        {primaryRegistration.members?.map((m, idx) => (
                                            <div key={idx} className="text-xs text-gray-400 flex items-center gap-1.5">
                                                <Users className="w-3 h-3" />
                                                {m.name} ({m.age}/{m.gender})
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 text-xs text-gray-500 font-mono">
                                        Total: ₹{(primaryRegistration.totalAmount || 0).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Result Preview */}
                            <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                                <p className="text-xs text-indigo-400/70 uppercase tracking-wider font-bold mb-3">After merge</p>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-1">Members</span>
                                        <span className="text-lg font-bold text-white">
                                            {(primaryRegistration.members?.length || 0) + (selectedSecondary.members?.length || 0)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-1">Total Amount</span>
                                        <span className="text-lg font-bold text-white font-mono">
                                            ₹{((primaryRegistration.totalAmount || 0) + (selectedSecondary.totalAmount || 0)).toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-1">Primary Contact</span>
                                        <span className="text-sm font-medium text-white">{primaryRegistration.name}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 flex justify-between items-center bg-gray-900/50">
                    {step === 'confirm' ? (
                        <>
                            <button onClick={handleBack} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                                ← Back
                            </button>
                            <button
                                onClick={handleMerge}
                                disabled={isMerging}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-900/30"
                            >
                                {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                                Confirm Merge
                            </button>
                        </>
                    ) : (
                        <>
                            <div />
                            <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
