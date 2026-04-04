import { useState, useMemo } from 'react';
import { X, Search, Loader2, GitMerge, Users, Link2, Unlink } from 'lucide-react';
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
    const [step, setStep] = useState<'select' | 'confirm' | 'linked'>('select');

    // Find registrations already linked to this one
    const linkedRegistrations = useMemo(() => {
        if (!primaryRegistration?.familyGroupId) return [];
        return allRegistrations.filter(
            reg => reg.id !== primaryRegistration.id && reg.familyGroupId === primaryRegistration.familyGroupId
        );
    }, [allRegistrations, primaryRegistration]);

    // Filter registrations for the search
    const filteredRegistrations = useMemo(() => {
        if (!primaryRegistration) return [];
        return allRegistrations.filter(reg => {
            if (reg.id === primaryRegistration.id) return false;
            // Don't show registrations already linked to this one
            if (primaryRegistration.familyGroupId && reg.familyGroupId === primaryRegistration.familyGroupId) return false;

            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const matchesName = reg.name?.toLowerCase().includes(q);
            const matchesPhone = reg.phone?.toLowerCase().includes(q);
            const matchesMember = reg.members?.some(m => m.name.toLowerCase().includes(q));
            return matchesName || matchesPhone || matchesMember;
        });
    }, [allRegistrations, primaryRegistration, searchQuery]);

    if (!isOpen || !primaryRegistration) return null;

    // Determine initial step based on whether we have existing links
    const effectiveStep = step === 'select' && linkedRegistrations.length > 0 && !selectedSecondary ? 'linked' : step;

    const handleSelectSecondary = (reg: Registration) => {
        setSelectedSecondary(reg);
        setStep('confirm');
    };

    const handleBack = () => {
        setSelectedSecondary(null);
        setStep(linkedRegistrations.length > 0 ? 'linked' : 'select');
    };

    const handleLink = async () => {
        if (!currentYatra || !primaryRegistration || !selectedSecondary) return;

        setIsMerging(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const batch = writeBatch(db);

            // Use existing familyGroupId or create a new one based on primary's ID
            const groupId = primaryRegistration.familyGroupId || primaryRegistration.id;

            // Update primary registration (set groupId if not already set)
            if (!primaryRegistration.familyGroupId) {
                const primaryRef = doc(db, 'registrations', primaryRegistration.id);
                batch.update(primaryRef, {
                    familyGroupId: groupId,
                    updatedAt: new Date().toISOString(),
                });
            }

            // Update all existing linked registrations to use the same groupId 
            // (in case secondary already has its own group — merge the groups)
            if (selectedSecondary.familyGroupId && selectedSecondary.familyGroupId !== groupId) {
                const secondaryGroupRegs = allRegistrations.filter(
                    r => r.familyGroupId === selectedSecondary.familyGroupId
                );
                secondaryGroupRegs.forEach(r => {
                    const ref = doc(db, 'registrations', r.id);
                    batch.update(ref, {
                        familyGroupId: groupId,
                        updatedAt: new Date().toISOString(),
                    });
                });
            } else {
                // Just link the secondary
                const secondaryRef = doc(db, 'registrations', selectedSecondary.id);
                batch.update(secondaryRef, {
                    familyGroupId: groupId,
                    updatedAt: new Date().toISOString(),
                });
            }

            await batch.commit();

            onSuccess();
            handleClose();
        } catch (error: any) {
            console.error("Failed to link registrations:", error);
            alert(`Failed to link: ${error.message || error}`);
        } finally {
            setIsMerging(false);
        }
    };

    const handleUnlink = async (regToUnlink: Registration) => {
        if (!currentYatra || !primaryRegistration) return;

        const confirmed = confirm(`Unlink "${regToUnlink.name}" from this family group?`);
        if (!confirmed) return;

        setIsMerging(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const batch = writeBatch(db);
            const ref = doc(db, 'registrations', regToUnlink.id);
            batch.update(ref, {
                familyGroupId: null,
                updatedAt: new Date().toISOString(),
            });

            // If only 2 registrations are in the group, also clear the primary's groupId
            const remainingLinked = linkedRegistrations.filter(r => r.id !== regToUnlink.id);
            if (remainingLinked.length === 0) {
                const primaryRef = doc(db, 'registrations', primaryRegistration.id);
                batch.update(primaryRef, {
                    familyGroupId: null,
                    updatedAt: new Date().toISOString(),
                });
            }

            await batch.commit();
            onSuccess();
            handleClose();
        } catch (error: any) {
            console.error("Failed to unlink registration:", error);
            alert(`Failed to unlink: ${error.message || error}`);
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
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-transparent">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Link2 className="w-5 h-5 text-emerald-400" />
                            Link as Family
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Linking: <span className="text-white font-medium">{primaryRegistration.name}</span>
                            <span className="text-gray-500 ml-2">({primaryRegistration.members?.length || 0} members)</span>
                            {primaryRegistration.familyGroupId && (
                                <span className="ml-2 inline-flex items-center gap-1 text-emerald-400 text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    <Link2 className="w-3 h-3" />
                                    Family Group
                                </span>
                            )}
                        </p>
                    </div>
                    <button onClick={handleClose} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">

                    {/* Linked Registrations View */}
                    {effectiveStep === 'linked' && (
                        <div className="space-y-4">
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                                <p className="text-xs text-emerald-400/70 uppercase tracking-wider font-bold mb-3 flex items-center gap-2">
                                    <Link2 className="w-3.5 h-3.5" />
                                    Linked Family Members ({linkedRegistrations.length + 1} registrations)
                                </p>

                                {/* Primary */}
                                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-bold text-white flex items-center gap-2">
                                                {primaryRegistration.name}
                                                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-bold">PRIMARY</span>
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">{primaryRegistration.phone}</p>
                                        </div>
                                        <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded border border-white/10">
                                            {primaryRegistration.members?.length || 0} members
                                        </span>
                                    </div>
                                    {primaryRegistration.members && primaryRegistration.members.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {primaryRegistration.members.map((m, idx) => (
                                                <span key={idx} className="text-[10px] bg-black/30 text-gray-400 px-1.5 py-0.5 rounded border border-white/5">
                                                    {m.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Linked registrations */}
                                {linkedRegistrations.map(reg => (
                                    <div key={reg.id} className="p-3 rounded-lg bg-white/5 border border-white/10 mb-2 group">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-white">{reg.name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{reg.phone}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs bg-white/10 text-gray-300 px-2 py-0.5 rounded border border-white/10">
                                                    {reg.members?.length || 0} members
                                                </span>
                                                <button
                                                    onClick={() => handleUnlink(reg)}
                                                    disabled={isMerging}
                                                    className="p-1.5 rounded-md text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                                    title="Unlink from family"
                                                >
                                                    <Unlink className="w-4 h-4" />
                                                </button>
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
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setStep('select')}
                                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all text-sm text-gray-400 hover:text-emerald-300 flex items-center justify-center gap-2"
                            >
                                <GitMerge className="w-4 h-4" />
                                Link Another Registration
                            </button>
                        </div>
                    )}

                    {/* Select Step */}
                    {effectiveStep === 'select' && (
                        <div className="space-y-4">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name, phone, or member name..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all"
                                    autoFocus
                                />
                            </div>

                            <p className="text-xs text-gray-500 px-1">
                                Select a registration to link as family with <strong className="text-gray-300">{primaryRegistration.name}</strong>. Both registrations will remain independent — they'll just be grouped as a family for room allotment and exports.
                            </p>

                            {/* Registration List */}
                            <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                                {filteredRegistrations.map(reg => (
                                    <button
                                        key={reg.id}
                                        onClick={() => handleSelectSecondary(reg)}
                                        className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-white group-hover:text-emerald-300 transition-colors">
                                                    {reg.name}
                                                    {reg.familyGroupId && (
                                                        <span className="ml-2 text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                                            In a family group
                                                        </span>
                                                    )}
                                                </p>
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
                                        {searchQuery ? 'No matching registrations found.' : 'No other registrations available to link.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Confirm Step */}
                    {effectiveStep === 'confirm' && selectedSecondary && (
                        <div className="space-y-6">
                            {/* Info Banner */}
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-start gap-3">
                                <Link2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-emerald-200 text-sm font-medium mb-1">Non-destructive family link</p>
                                    <p className="text-emerald-200/70 text-xs">
                                        Both registrations will remain independent with their own members and payments. They'll be grouped as a family for room allotment and exports. You can unlink them at any time.
                                    </p>
                                </div>
                            </div>

                            {/* Link Preview */}
                            <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-start">
                                {/* Primary */}
                                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                    <p className="text-xs text-emerald-400/70 uppercase tracking-wider font-bold mb-2">Registration A</p>
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

                                {/* Link Icon */}
                                <div className="flex items-center justify-center pt-10">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                                        <Link2 className="w-5 h-5 text-emerald-400" />
                                    </div>
                                </div>

                                {/* Secondary */}
                                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                    <p className="text-xs text-emerald-400/70 uppercase tracking-wider font-bold mb-2">Registration B</p>
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
                            </div>

                            {/* Result Preview */}
                            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                <p className="text-xs text-emerald-400/70 uppercase tracking-wider font-bold mb-3">After linking</p>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-1">Total Members</span>
                                        <span className="text-lg font-bold text-white">
                                            {(primaryRegistration.members?.length || 0) + (selectedSecondary.members?.length || 0)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-1">Registrations</span>
                                        <span className="text-lg font-bold text-white">
                                            {linkedRegistrations.length + 2}
                                        </span>
                                        <span className="text-xs text-gray-500 block">in family</span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-gray-500 block mb-1">Impact</span>
                                        <span className="text-sm font-medium text-emerald-400">Room grouping & exports</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 flex justify-between items-center bg-gray-900/50">
                    {effectiveStep === 'confirm' ? (
                        <>
                            <button onClick={handleBack} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                                ← Back
                            </button>
                            <button
                                onClick={handleLink}
                                disabled={isMerging}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/30"
                            >
                                {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                Link as Family
                            </button>
                        </>
                    ) : effectiveStep === 'linked' ? (
                        <>
                            <div />
                            <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                                Close
                            </button>
                        </>
                    ) : (
                        <>
                            {linkedRegistrations.length > 0 ? (
                                <button
                                    onClick={() => setStep('linked')}
                                    className="px-4 py-2 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2"
                                >
                                    <Link2 className="w-4 h-4" />
                                    View Linked ({linkedRegistrations.length})
                                </button>
                            ) : (
                                <div />
                            )}
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
