import { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
    useManagementTeam,
    useYatraManagementSelection,
    addManagementMember,
    updateManagementMember,
    deleteManagementMember,
    saveYatraManagementSelection,
} from '../hooks/useManagementTeam';
import type { ManagementMember } from '../types';
import { Loader2, Plus, Pencil, Trash2, X, Shield, CheckSquare, Square, Save, Users } from 'lucide-react';
import { cn } from '../lib/utils';

const EMPTY_FORM: Omit<ManagementMember, 'id'> = { name: '', age: '', gender: 'Male' };

export const ManagementTeam = () => {
    const { currentYatra, user } = useAppStore();
    const { members, isLoading: isLoadingMembers } = useManagementTeam();
    const { selectedIds, isLoading: isLoadingSelection } = useYatraManagementSelection();

    // Form state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<ManagementMember | null>(null);
    const [form, setForm] = useState<Omit<ManagementMember, 'id'>>(EMPTY_FORM);
    const [isSaving, setIsSaving] = useState(false);

    // Yatra selection state (local copy for toggling before saving)
    const [localSelection, setLocalSelection] = useState<string[] | null>(null);
    const activeSelection = localSelection ?? selectedIds;
    const selectionChanged = localSelection !== null && JSON.stringify(localSelection.sort()) !== JSON.stringify([...selectedIds].sort());

    // Sync local selection when Firestore data loads
    const handleResetSelection = () => setLocalSelection(null);

    const openAddForm = () => {
        setEditingMember(null);
        setForm(EMPTY_FORM);
        setIsFormOpen(true);
    };

    const openEditForm = (member: ManagementMember) => {
        setEditingMember(member);
        setForm({ name: member.name, age: member.age, gender: member.gender });
        setIsFormOpen(true);
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingMember(null);
        setForm(EMPTY_FORM);
    };

    const handleSaveMember = async () => {
        if (!form.name.trim() || !form.age) return;
        setIsSaving(true);
        try {
            if (editingMember) {
                await updateManagementMember(editingMember.id, form);
            } else {
                await addManagementMember(form);
            }
            closeForm();
        } catch (err) {
            console.error('Failed to save member:', err);
            alert('Failed to save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMember = async (id: string) => {
        if (!confirm('Delete this management member?')) return;
        try {
            await deleteManagementMember(id);
            // Also remove from local selection if present
            if (localSelection) {
                setLocalSelection(prev => prev ? prev.filter(x => x !== id) : []);
            }
        } catch (err) {
            console.error('Failed to delete member:', err);
            alert('Failed to delete.');
        }
    };

    const toggleMemberSelection = (id: string) => {
        const current = localSelection ?? [...selectedIds];
        const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        setLocalSelection(next);
    };

    const handleSaveSelection = async () => {
        if (!currentYatra || !localSelection) return;
        setIsSaving(true);
        try {
            await saveYatraManagementSelection(currentYatra, localSelection);
            setLocalSelection(null);
        } catch (err) {
            console.error('Failed to save selection:', err);
            alert('Failed to save selection.');
        } finally {
            setIsSaving(false);
        }
    };

    const selectedMembers = useMemo(() =>
        members.filter(m => activeSelection.includes(m.id)),
        [members, activeSelection]
    );

    if (isLoadingMembers || isLoadingSelection) {
        return (
            <div className="flex h-[calc(100vh-140px)] items-center justify-center">
                <Loader2 className="animate-spin h-10 w-10 text-purple-500" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white font-display mb-2 flex items-center gap-3">
                        <Shield className="w-8 h-8 text-amber-400" />
                        Management Team
                    </h1>
                    <p className="text-gray-400">
                        Global team members. Select who joins <span className="text-purple-300 font-medium">{currentYatra?.name || 'current yatra'}</span>.
                    </p>
                </div>
                {user && (
                    <button
                        onClick={openAddForm}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-500/20 transition-all active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Add Member
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Full Roster */}
                <div className="lg:col-span-2">
                    <div className="glass-card overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Users className="w-5 h-5 text-purple-400" />
                                All Members ({members.length})
                            </h3>
                        </div>

                        {members.length === 0 ? (
                            <div className="p-12 text-center">
                                <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                                <p className="text-gray-500">No management members yet.</p>
                                {user && <p className="text-gray-600 text-sm mt-1">Click "Add Member" to get started.</p>}
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {members.map(member => {
                                    const isSelected = activeSelection.includes(member.id);
                                    const genderColor = member.gender?.toLowerCase() === 'female' || member.gender?.toLowerCase() === 'f'
                                        ? 'text-pink-400' : 'text-blue-400';
                                    const genderBg = member.gender?.toLowerCase() === 'female' || member.gender?.toLowerCase() === 'f'
                                        ? 'bg-pink-500/10 border-pink-500/20' : 'bg-blue-500/10 border-blue-500/20';

                                    return (
                                        <div
                                            key={member.id}
                                            className={cn(
                                                "p-4 flex items-center gap-4 transition-all",
                                                isSelected ? "bg-purple-500/5" : "hover:bg-white/5"
                                            )}
                                        >
                                            {/* Selection checkbox */}
                                            <button
                                                onClick={() => toggleMemberSelection(member.id)}
                                                className="flex-shrink-0 transition-transform hover:scale-110"
                                                title={isSelected ? "Deselect for this yatra" : "Select for this yatra"}
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-5 h-5 text-purple-400" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-gray-600 hover:text-gray-400" />
                                                )}
                                            </button>

                                            {/* Member info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3">
                                                    <p className="text-white font-medium truncate">{member.name}</p>
                                                    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-bold", genderBg, genderColor)}>
                                                        {member.gender?.charAt(0).toUpperCase() || '?'}
                                                    </span>
                                                    <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                                                        Age: {member.age}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            {user && (
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => openEditForm(member)}
                                                        className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteMember(member.id)}
                                                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Yatra Selection Summary */}
                <div className="space-y-6">
                    <div className="glass-card p-6 border-l-4 border-l-amber-500">
                        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-amber-400" />
                            Selected for Yatra
                        </h3>
                        <p className="text-gray-500 text-xs mb-4">{currentYatra?.name || '—'}</p>

                        {selectedMembers.length === 0 ? (
                            <p className="text-gray-600 text-sm">No management members selected for this yatra. Use the checkboxes to select.</p>
                        ) : (
                            <div className="space-y-2">
                                {selectedMembers.map(m => (
                                    <div key={m.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-[10px] font-bold text-white shadow">
                                            {m.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm text-white font-medium truncate">{m.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="text-gray-400">{selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected</span>
                        </div>

                        {selectionChanged && (
                            <div className="mt-4 flex gap-2">
                                <button
                                    onClick={handleSaveSelection}
                                    disabled={isSaving}
                                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-4 py-2.5 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Save Selection
                                </button>
                                <button
                                    onClick={handleResetSelection}
                                    className="px-4 py-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors font-medium"
                                >
                                    Reset
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={closeForm}>
                    <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingMember ? 'Edit Member' : 'Add Member'}
                            </h2>
                            <button onClick={closeForm} className="text-gray-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    className="input-glass w-full"
                                    placeholder="Enter full name"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Age *</label>
                                    <input
                                        type="number"
                                        value={form.age}
                                        onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                                        className="input-glass w-full"
                                        placeholder="Age"
                                        min={1}
                                        max={120}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Gender *</label>
                                    <select
                                        value={form.gender}
                                        onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                                        className="input-glass w-full"
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={handleSaveMember}
                                disabled={isSaving || !form.name.trim() || !form.age}
                                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-2.5 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {editingMember ? 'Update' : 'Add Member'}
                            </button>
                            <button
                                onClick={closeForm}
                                className="px-6 py-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
