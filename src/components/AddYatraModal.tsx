import { useState } from 'react';
import { getMasterApp } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { X, PlusSquare, Image, Database, ShieldCheck, Loader2, Calendar } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { createPortal } from 'react-dom';
import type { RefundPolicyRule } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const AddYatraModal = ({ isOpen, onClose }: Props) => {
    // Only used to re-fetch if needed, but store subscription handles it.
    const { } = useAppStore();

    const [name, setName] = useState('');
    const [bgImage, setBgImage] = useState('');
    const [configJson, setConfigJson] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Policy State
    const [policy, setPolicy] = useState<RefundPolicyRule[]>([
        { date: '2025-12-31', refund: 100 }
    ]);

    // Default template for easier starting
    const defaultConfig = `{
  "apiKey": "",
  "authDomain": "",
  "projectId": "",
  "storageBucket": "",
  "messagingSenderId": "",
  "appId": ""
}`;

    if (!isOpen) return null;

    const handleAddRule = () => {
        setPolicy([...policy, { date: '', refund: 0 }]);
    };

    const handleRuleChange = (index: number, field: keyof RefundPolicyRule, value: any) => {
        const newPolicy = [...policy];
        newPolicy[index] = { ...newPolicy[index], [field]: field === 'refund' ? Number(value) : value };
        setPolicy(newPolicy);
    };

    const handleRemoveRule = (index: number) => {
        setPolicy(policy.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        try {
            if (!name) return alert('Yatra Name is required');
            if (!configJson) return alert('Firebase Config is required');

            setIsSubmitting(true);

            // Validate JSON
            let config;
            try {
                config = JSON.parse(configJson);
            } catch (e) {
                alert('Invalid Firebase Config JSON');
                setIsSubmitting(false);
                return;
            }

            const { db } = getMasterApp();
            await addDoc(collection(db, 'yatra_dashboards'), {
                name,
                bgImage: bgImage || 'https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&q=80',
                config,
                policy, // Save the policy
                createdAt: new Date().toISOString()
            });

            // Reset form
            setName('');
            setBgImage('');
            setConfigJson('');
            setPolicy([{ date: '2025-12-31', refund: 100 }]);

            onClose();
        } catch (e: any) {
            console.error(e);
            alert('Error creating yatra: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Card */}
            <div className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-scale-in">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-900/20 to-indigo-900/20">
                    <div className="flex items-center gap-3 text-white">
                        <div className="p-2 bg-purple-500/20 rounded-lg border border-purple-500/30">
                            <PlusSquare className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Add New Yatra</h2>
                            <p className="text-xs text-purple-400/80 font-medium">Configure new dashboard instance</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors hover:bg-white/5 p-2 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5" /> Yatra Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input-glass w-full"
                                placeholder="e.g. Vrindavan 2026"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Image className="w-3.5 h-3.5" /> Wallpaper URL
                            </label>
                            <input
                                type="text"
                                value={bgImage}
                                onChange={(e) => setBgImage(e.target.value)}
                                className="input-glass w-full"
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    {/* Config Section */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" /> Firebase Configuration (JSON)
                                </label>
                                <button
                                    onClick={() => setConfigJson(defaultConfig)}
                                    className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                                >
                                    Load Template
                                </button>
                            </div>
                            <textarea
                                rows={6}
                                value={configJson}
                                onChange={(e) => setConfigJson(e.target.value)}
                                className="input-glass w-full font-mono text-xs text-blue-300/90 leading-relaxed"
                                placeholder='Paste your firebaseConfig object here...'
                            />
                            <p className="text-[10px] text-gray-500">
                                Required. This connects the dashboard to the specific Firestore database for this Yatra.
                            </p>
                        </div>

                        {/* Policy Section */}
                        <div className="space-y-2 pt-4 border-t border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" /> Cancellation Policy
                                </label>
                                <button onClick={handleAddRule} className="text-xs text-purple-400 hover:text-white flex items-center gap-1">
                                    <PlusSquare className="w-3 h-3" /> Add Rule
                                </button>
                            </div>

                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {policy.map((rule, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <input
                                                type="date"
                                                value={rule.date}
                                                onChange={e => handleRuleChange(idx, 'date', e.target.value)}
                                                className="input-glass w-full py-1.5 text-xs text-white"
                                            />
                                        </div>
                                        <div className="w-24 relative">
                                            <input
                                                type="number"
                                                value={rule.refund}
                                                onChange={e => handleRuleChange(idx, 'refund', e.target.value)}
                                                className="input-glass w-full py-1.5 text-xs text-center pr-6"
                                            />
                                            <span className="absolute right-2 top-1.5 text-xs text-gray-500">%</span>
                                        </div>
                                        <button onClick={() => handleRemoveRule(idx)} className="text-gray-600 hover:text-red-400">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-500">
                                Define refund percentage based on cancellation date. Rules are evaluated in order.
                            </p>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-gray-900/50">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSubmitting}
                        className="btn-primary flex items-center gap-2 px-6"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusSquare className="w-4 h-4" />}
                        Create Ecosystem
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
