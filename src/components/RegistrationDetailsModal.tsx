import { X, User, Phone, MapPin, CreditCard, ImageIcon, Users } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import type { Registration } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: Registration | null;
}

export const RegistrationDetailsModal = ({ isOpen, onClose, data }: Props) => {
    if (!isOpen || !data) return null;

    // Helper to safely access data across different schemas (Flat vs Nested)
    const getPaymentStatus = () => {
        return data.paymentStatus || data.paymentDetails?.paymentStatus || 'pending';
    };

    const getTotalAmount = () => {
        return data.paymentDetails?.totalAmount || data.totalAmount || 0;
    };

    const getPaidAmount = () => {
        return data.paymentDetails?.amountPaid || (data as any).amountPaid || 0; // Check root amountPaid too
    };

    const getUtr = () => {
        return data.paymentDetails?.utrNumber || data.utr || (data as any).utrNumber || '';
    };

    const getScreenshot = () => {
        return data.paymentDetails?.paymentProofUrl || data.screenshotUrl || (data as any).paymentProof || '';
    };

    const isPaid = getPaymentStatus() === 'verified';
    const totalAmount = getTotalAmount();
    const paidAmount = getPaidAmount();
    const pendingAmount = totalAmount - paidAmount;
    const utr = getUtr();
    const screenshot = getScreenshot();

    // Use Portal to escape parent transforms/clipping
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-scale-in">

                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-start justify-between bg-gradient-to-r from-purple-500/10 to-transparent">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-2xl font-display font-bold text-white">{data.name}</h2>
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold border",
                                isPaid ? "text-green-400 bg-green-400/10 border-green-500/20" : "text-yellow-400 bg-yellow-400/10 border-yellow-500/20"
                            )}>
                                {getPaymentStatus().replace(/_/g, ' ').toUpperCase()}
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm font-mono flex items-center gap-2">
                            ID: {data.id}
                            <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                            {new Date().toLocaleDateString()}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Primary Contact & Payment Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Contact Info */}
                        <div className="glass-card p-5 space-y-4">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4" /> Personal Details
                            </h3>
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                        <Phone className="w-4 h-4 text-purple-400 shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-xs text-gray-500">Phone</span>
                                            <span className="text-white font-mono">{data.phone}</span>
                                        </div>
                                    </div>
                                    {data.whatsapp && (
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                            <div className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                                                <span className="text-green-400 text-[10px] font-bold">W</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-gray-500">WhatsApp</span>
                                                <span className="text-white font-mono">{data.whatsapp}</span>
                                            </div>
                                        </div>
                                    )}
                                    {data.email && (
                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                            <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                                                <span className="text-blue-400 text-[10px] font-bold">@</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-gray-500">Email</span>
                                                <span className="text-white break-all">{data.email}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                                    <MapPin className="w-4 h-4 text-purple-400 shrink-0 mt-1" />
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Address</span>
                                        <span className="text-gray-300 text-sm whitespace-pre-wrap">{data.address || 'No address provided'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Payment & System Info */}
                        <div className="glass-card p-5 space-y-4">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <CreditCard className="w-4 h-4" /> System & Payment
                            </h3>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                    <span className="block text-xs text-green-400/70 mb-1">Paid</span>
                                    <span className="block text-xl font-bold text-green-400 font-mono">₹{paidAmount.toLocaleString()}</span>
                                </div>
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <span className="block text-xs text-red-400/70 mb-1">Pending</span>
                                    <span className="block text-xl font-bold text-red-400 font-mono">₹{pendingAmount.toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {utr && (
                                    <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center">
                                        <span className="text-xs text-gray-400">UTR / ID</span>
                                        <span className="text-sm text-white font-mono select-all bg-black/20 px-2 py-1 rounded">{utr}</span>
                                    </div>
                                )}
                                <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center">
                                    <span className="text-xs text-gray-400">Family ID</span>
                                    <span className="text-xs text-gray-300 font-mono">{data.familyId || data.id}</span>
                                </div>

                                <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center">
                                    <span className="text-xs text-gray-400">Joined WhatsApp Group?</span>
                                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded",
                                        data.joinedWhatsapp === 'yes' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    )}>
                                        {data.joinedWhatsapp === 'yes' ? 'YES' : 'NO'}
                                    </span>
                                </div>

                                <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center">
                                    <span className="text-xs text-gray-400">Submitted On</span>
                                    <span className="text-xs text-gray-300">
                                        {data.submittedAt?.toDate ? data.submittedAt.toDate().toLocaleString('en-IN') : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Screenshot Viewer */}
                    {screenshot && (
                        <div className="glass-card p-5">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                                <ImageIcon className="w-4 h-4" /> Payment Proof
                            </h3>
                            <div className="relative group rounded-lg overflow-hidden border border-white/10 bg-black/50 aspect-video md:aspect-[21/9] flex items-center justify-center">
                                <img
                                    src={screenshot}
                                    alt="Payment Proof"
                                    className="max-h-full object-contain"
                                />
                                <a
                                    href={screenshot}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <span className="px-4 py-2 bg-white text-black rounded-lg font-bold text-sm">View Full Size</span>
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Members List */}
                    <div className="glass-card p-0 overflow-hidden">
                        <div className="p-5 border-b border-white/5 bg-white/5">
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Users className="w-4 h-4" /> Traveller Details ({data.members?.length || 0})
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-black/20">
                                    <tr>
                                        <th className="px-6 py-3 font-medium">Name</th>
                                        <th className="px-6 py-3 font-medium">Age/Gender</th>
                                        <th className="px-6 py-3 font-medium">Package</th>
                                        {data.members?.[0]?.roomNumber && <th className="px-6 py-3 font-medium">Room Assigned</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.members?.map((member, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 font-medium text-white">{member.name}</td>
                                            <td className="px-6 py-4 text-gray-300">{member.age} / {member.gender}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 text-xs">
                                                    {member.packageName || 'Standard'}
                                                </span>
                                            </td>
                                            {member.roomNumber && <td className="px-6 py-4 text-gray-300">{member.roomNumber}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Remarks Section */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Remarks</h3>
                        <div className="p-3 rounded-lg bg-white/5 border border-white/5 min-h-[60px] text-sm text-gray-300 whitespace-pre-wrap">
                            {data.remarks || 'No remarks added.'}
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-white/5 bg-gray-900/50 flex justify-end gap-3">
                    <button onClick={onClose} className="btn-secondary">Close</button>
                </div>
            </div>
        </div>,
        document.body
    );
};
