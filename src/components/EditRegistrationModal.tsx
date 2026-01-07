import { useState, useEffect } from 'react';
import { X, Save, Loader2, Plus, Trash2, User, CreditCard } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Registration, Member, Installment } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: Registration | null;
    onSuccess: () => void;
}

export const EditRegistrationModal = ({ isOpen, onClose, data, onSuccess }: Props) => {
    const { currentYatra } = useAppStore();
    const [formData, setFormData] = useState<Partial<Registration>>({});
    const [members, setMembers] = useState<Member[]>([]);
    const [installments, setInstallments] = useState<Installment[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'members'>('details');

    useEffect(() => {
        if (data) {
            setFormData({
                name: data.name,
                phone: data.phone,
                email: data.email,
                whatsapp: data.whatsapp,
                address: data.address,
                remarks: data.remarks,
                paymentStatus: data.paymentStatus || data.paymentDetails?.paymentStatus, // Fallback to nested
                joinedWhatsapp: data.joinedWhatsapp,
                utr: data.utr,
                familyId: data.familyId || data.id,
                // Handle nested payment details flattening for edit if needed
                // If the data uses paymentDetails, we might want to edit that object.
                // For simplicity in this v1, we focus on root fields which 'Puri' uses.
                // If 'Hampi' schema is used, we might need deeper logic. 
                // Let's assume root fields are primary or mapped.
            });
            setMembers(data.members ? [...data.members] : []);
            setInstallments(data.paymentDetails?.installments ? [...data.paymentDetails.installments] : []);
        }
    }, [data, isOpen]);

    if (!isOpen || !data) return null;

    const handleMemberChange = (index: number, field: keyof Member, value: any) => {
        const updated = [...members];
        updated[index] = { ...updated[index], [field]: value };
        setMembers(updated);
    };

    const removeMember = (index: number) => {
        const updated = members.filter((_, i) => i !== index);
        setMembers(updated);
    };

    const addMember = () => {
        setMembers([...members, { name: '', age: '', gender: 'Male' }]);
    };

    const handleInstallmentChange = (index: number, field: keyof Installment, value: any) => {
        const updated = [...installments];
        updated[index] = { ...updated[index], [field]: value };
        setInstallments(updated);
    };

    const handleSave = async () => {
        if (!currentYatra || !data.id) return;
        setIsSaving(true);

        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const updatedData: any = {
                ...formData,
                members: members,
                updatedAt: new Date().toISOString()
            };

            // Basic logic: If flat schema is used, update totalAmount based on member count?
            // Or trust the user to manually edit amount? 
            // In original code: `updatedData.totalAmount = updatedData.members.length * 5000; `
            // We should probably replicate that logic or leave it purely to manual overrides if we had an amount field.
            // For safety, let's recalculate totalAmount if it's a fixed price yatra (Puri).
            // But to be generic, we might skip auto-calc for now unless explicitly requested.
            // Wait, original code strictly did: `updatedData.totalAmount = updatedData.members.length * 5000; `
            // Let's preserve member count based calculation if it was there, but maybe safer to NOT touch amount automatically unless we know price.

            // Sync Payment Details if they exist (Dynamic / Hampi Style)
            if (data.paymentDetails) {
                updatedData.paymentDetails = {
                    ...data.paymentDetails,
                    paymentStatus: formData.paymentStatus, // Sync root status to nested
                    utrNumber: formData.utr, // Sync root UTR to nested
                    installments: installments // Update installments
                };

                // Recalculate amounts if using installments
                if (installments.length > 0) {
                    const totalPaid = installments
                        .filter(i => i.status === 'paid' || i.status === 'verification_pending')
                        .reduce((sum, i) => sum + Number(i.amount), 0);

                    updatedData.paymentDetails.amountPaid = totalPaid;
                    // We don't auto-update totalAmount, assuming it's fixed per package but could be editable field in future
                }
            }

            // detailed deep cleanup to remove undefined values safely
            const removeUndefined = (obj: any) => {
                if (obj === null || typeof obj !== 'object') return obj;

                Object.keys(obj).forEach(key => {
                    if (obj[key] === undefined) {
                        delete obj[key];
                    } else if (typeof obj[key] === 'object') {
                        removeUndefined(obj[key]);
                    }
                });
                return obj;
            };

            removeUndefined(updatedData);

            await updateDoc(doc(db, 'registrations', data.id), updatedData);

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error("Error updating registration:", error);
            // Detailed alert for debugging
            alert(`Failed to update registration: ${error.message || error} `);
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-scale-in">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Edit Registration <span className="text-xs text-gray-500 font-normal px-2 py-1 bg-white/5 rounded">{data.name}</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/5">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'details' ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        Basic Details
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'members' ? 'border-purple-500 text-purple-400 bg-purple-500/5' : 'border-transparent text-gray-400 hover:text-white'}`}
                    >
                        Manage Travellers ({members.length})
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">

                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            {/* Contact Section */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <User className="w-4 h-4" /> Personal Info
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="label-text">Name</label>
                                        <input type="text" className="input-glass w-full"
                                            value={formData.name || ''}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="label-text">Phone</label>
                                        <input type="text" className="input-glass w-full"
                                            value={formData.phone || ''}
                                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="label-text">Email</label>
                                        <input type="email" className="input-glass w-full"
                                            value={formData.email || ''}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="label-text">WhatsApp</label>
                                        <input type="text" className="input-glass w-full"
                                            value={formData.whatsapp || ''}
                                            onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="label-text">Address</label>
                                        <textarea className="input-glass w-full h-20 resize-none"
                                            value={formData.address || ''}
                                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Status Section */}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" /> Payment & Status
                                </h3>

                                {/* Dynamic Payment View */}
                                {data.paymentDetails?.paymentType === 'installment' ? (
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-medium text-white">Installment Plan</span>
                                            <span className="text-xs text-purple-400 font-bold">
                                                Total: ₹{data.paymentDetails.totalAmount}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {installments.map((inst, idx) => (
                                                <div key={idx} className="flex items-center gap-2 text-sm bg-black/20 p-2 rounded border border-white/5">
                                                    <div className="flex-1 min-w-0">
                                                        <input
                                                            className="bg-transparent text-gray-300 w-full outline-none text-xs"
                                                            value={inst.name}
                                                            onChange={e => handleInstallmentChange(idx, 'name', e.target.value)}
                                                        />
                                                        <input
                                                            className="bg-transparent text-[10px] text-gray-500 w-full outline-none"
                                                            value={inst.dueDate}
                                                            onChange={e => handleInstallmentChange(idx, 'dueDate', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="w-20">
                                                        <input
                                                            type="number"
                                                            className="bg-transparent text-white font-mono text-right w-full outline-none border-b border-white/5 focus:border-purple-500/50"
                                                            value={inst.amount}
                                                            onChange={e => handleInstallmentChange(idx, 'amount', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="w-32">
                                                        <select
                                                            className={`w-full text-[10px] uppercase font-bold py-1 px-1 rounded outline-none border border-transparent focus:border-white/10 ${inst.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                                                                inst.status === 'verification_pending' ? 'bg-yellow-500/10 text-yellow-400' :
                                                                    'bg-red-500/10 text-red-400'
                                                                }`}
                                                            value={inst.status}
                                                            onChange={e => handleInstallmentChange(idx, 'status', e.target.value)}
                                                        >
                                                            <option value="pending" className="bg-gray-800 text-red-400">Pending</option>
                                                            <option value="verification_pending" className="bg-gray-800 text-yellow-400">Verifying</option>
                                                            <option value="paid" className="bg-gray-800 text-green-400">Paid</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="label-text">Payment Status</label>
                                            <select
                                                className="input-glass w-full bg-[#0f111a]"
                                                value={formData.paymentStatus || 'pending_verification'}
                                                onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}
                                            >
                                                <option value="pending_verification">Pending Verification</option>
                                                <option value="verified">Verified</option>
                                                <option value="partial_payment">Partial Payment</option>
                                                <option value="no_payment">No Payment</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label-text">Joined WhatsApp?</label>
                                            <select
                                                className="input-glass w-full bg-[#0f111a]"
                                                value={formData.joinedWhatsapp || 'no'}
                                                onChange={e => setFormData({ ...formData, joinedWhatsapp: e.target.value as 'yes' | 'no' })}
                                            >
                                                <option value="no">No</option>
                                                <option value="yes">Yes</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label-text">UTR / Transaction ID</label>
                                            <input type="text" className="input-glass w-full"
                                                value={formData.utr || ''}
                                                onChange={e => setFormData({ ...formData, utr: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="label-text">Family ID</label>
                                            <input type="text" className="input-glass w-full"
                                                value={formData.familyId || ''}
                                                onChange={e => setFormData({ ...formData, familyId: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4">
                                    <label className="label-text">Remarks</label>
                                    <textarea className="input-glass w-full h-20 resize-none"
                                        value={formData.remarks || ''}
                                        onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                        placeholder="Internal admin notes..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Travellers List</h3>
                                <button onClick={addMember} className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                                    <Plus className="w-3 h-3" /> Add New
                                </button>
                            </div>

                            <div className="space-y-3">
                                {members.map((member, idx) => (
                                    <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5 relative group">
                                        <button
                                            onClick={() => removeMember(idx)}
                                            className="absolute top-2 right-2 p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remove Traveller"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                            <div className="md:col-span-4">
                                                <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Full Name</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm focus:border-purple-500/50 outline-none text-white placeholder-gray-600"
                                                    placeholder="Traveller Name"
                                                    value={member.name}
                                                    onChange={e => handleMemberChange(idx, 'name', e.target.value)}
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Age</label>
                                                <input
                                                    type="number"
                                                    className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm focus:border-purple-500/50 outline-none text-white"
                                                    value={member.age}
                                                    onChange={e => handleMemberChange(idx, 'age', e.target.value)}
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Gender</label>
                                                <select
                                                    className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm focus:border-purple-500/50 outline-none text-gray-300"
                                                    value={member.gender}
                                                    onChange={e => handleMemberChange(idx, 'gender', e.target.value)}
                                                >
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>

                                            {/* Dynamic Fields - Only show if data suggests packages exist */}
                                            {(members.some(m => m.packageName) || currentYatra?.config?.projectId?.includes('hampi')) && (
                                                <>
                                                    <div className="md:col-span-2">
                                                        <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Package</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm focus:border-purple-500/50 outline-none text-white"
                                                            value={member.packageName || ''}
                                                            placeholder="e.g. 2 AC"
                                                            onChange={e => handleMemberChange(idx, 'packageName', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Room</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm focus:border-purple-500/50 outline-none text-white"
                                                            value={member.roomNumber || ''}
                                                            placeholder="Room No"
                                                            onChange={e => handleMemberChange(idx, 'roomNumber', e.target.value)}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {members.length === 0 && (
                                    <div className="text-center py-10 text-gray-500 text-sm border-2 border-dashed border-white/5 rounded-xl">
                                        No travellers added yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-gray-900/50">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="btn-primary flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
