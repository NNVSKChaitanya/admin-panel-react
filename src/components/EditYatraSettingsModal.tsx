import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Plus, Trash2, Settings, Calendar, Percent, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { getMasterApp } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { RefundPolicyRule } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const EditYatraSettingsModal = ({ isOpen, onClose }: Props) => {
    const { currentYatra, setCurrentYatra } = useAppStore();
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [bgImage, setBgImage] = useState('');
    const [twoSharingAmount, setTwoSharingAmount] = useState<number | ''>('');
    const [policy, setPolicy] = useState<RefundPolicyRule[]>([]);

    useEffect(() => {
        if (currentYatra) {
            setName(currentYatra.name || '');
            setBgImage(currentYatra.bgImage || '');
            setTwoSharingAmount(currentYatra.config?.twoSharingAmount ?? '');
            // Sort policy by date
            const sortedPolicy = [...(currentYatra.policy || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setPolicy(sortedPolicy);
        }
    }, [currentYatra, isOpen]);

    const handleAddRule = () => {
        setPolicy([...policy, { date: '', refund: 0 }]);
    };

    const handleRemoveRule = (index: number) => {
        setPolicy(policy.filter((_, i) => i !== index));
    };

    const handleRuleChange = (index: number, field: keyof RefundPolicyRule, value: any) => {
        const newPolicy = [...policy];
        newPolicy[index] = { ...newPolicy[index], [field]: value };
        setPolicy(newPolicy);
    };

    const handleSave = async () => {
        if (!currentYatra) return;
        setIsSaving(true);

        try {
            // Sort policy before saving
            const sortedPolicy = [...policy].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Build updated config
            const updatedConfig = { ...(currentYatra.config || {}) } as any;
            if (twoSharingAmount !== '') {
                updatedConfig.twoSharingAmount = Number(twoSharingAmount);
            } else {
                delete updatedConfig.twoSharingAmount;
            }

            // Update in Firestore
            const { db } = getMasterApp(); // Config always stored in Master
            const yatraRef = doc(db, 'yatra_dashboards', currentYatra.id);

            await updateDoc(yatraRef, {
                name,
                bgImage,
                config: updatedConfig,
                policy: sortedPolicy
            });

            // Update Local State
            setCurrentYatra({
                ...currentYatra,
                name,
                bgImage,
                config: updatedConfig,
                policy: sortedPolicy
            } as any);

            onClose();
        } catch (error) {
            console.error("Error updating settings:", error);
            alert("Failed to update settings.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !currentYatra) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-[#0f111a] border border-white/10 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col animate-scale-in">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <Settings className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Yatra Settings</h2>
                            <p className="text-sm text-gray-400">Configure details and policies</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-8 overflow-y-auto flex-1">

                    {/* General Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider border-b border-white/5 pb-2">General Information</h3>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Yatra Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4" /> Background Image URL
                                </label>
                                <input
                                    type="text"
                                    value={bgImage}
                                    onChange={(e) => setBgImage(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none placeholder:text-gray-600 font-mono text-sm"
                                />
                                {bgImage && (
                                    <div className="mt-2 h-24 w-full rounded-lg overflow-hidden border border-white/10 relative">
                                        <img src={bgImage} alt="Preview" className="w-full h-full object-cover opacity-50" />
                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white bg-black/40">Preview</div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-2">
                                    <Settings className="w-4 h-4" /> 2 Sharing Upgrade Amount (per person)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                                    <input
                                        type="number"
                                        value={twoSharingAmount}
                                        onChange={(e) => setTwoSharingAmount(e.target.value ? Number(e.target.value) : '')}
                                        placeholder="e.g. 5000"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/50 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Refund Policy Rules */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Refund Policy Rules</h3>
                            <button
                                onClick={handleAddRule}
                                className="text-xs flex items-center gap-1 bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors"
                            >
                                <Plus className="w-3 h-3" /> Add Rule
                            </button>
                        </div>

                        <div className="space-y-3">
                            {policy.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-white/10 rounded-lg text-gray-500 text-sm">
                                    No refund rules defined. Default is 0% refund.
                                </div>
                            ) : (
                                policy.map((rule, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/5 group hover:border-white/10 transition-colors">
                                        <div className="flex-1">
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                <input
                                                    type="date"
                                                    value={rule.date}
                                                    onChange={(e) => handleRuleChange(idx, 'date', e.target.value)}
                                                    className="w-full pl-9 pr-3 py-2 bg-black/20 border border-white/10 rounded text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none"
                                                />
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1 ml-1">Cancel ON or BEFORE this date</div>
                                        </div>

                                        <div className="w-32">
                                            <div className="relative">
                                                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                                <input
                                                    type="number"
                                                    min="0" max="100"
                                                    value={rule.refund}
                                                    onChange={(e) => handleRuleChange(idx, 'refund', Number(e.target.value))}
                                                    className="w-full pl-8 pr-3 py-2 bg-black/20 border border-white/10 rounded text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none text-center"
                                                />
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1 ml-1 text-center">Refund %</div>
                                        </div>

                                        <button
                                            onClick={() => handleRemoveRule(idx)}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="text-xs text-gray-500 italic">
                            System checks dates in order. If user cancels on or before a date, that percentage is applied.
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 bg-white/5 flex gap-3 justify-end">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-lg border border-white/10 text-gray-300 font-medium hover:bg-white/5 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving Config...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
