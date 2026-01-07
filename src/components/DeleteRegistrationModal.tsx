import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Registration, Cancellation } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    data: Registration | Cancellation | null;
    onSuccess: () => void;
    collectionName?: 'registrations' | 'cancellations';
}

export const DeleteRegistrationModal = ({ isOpen, onClose, data, onSuccess, collectionName = 'registrations' }: Props) => {
    const { currentYatra } = useAppStore();
    const [isDeleting, setIsDeleting] = useState(false);

    if (!isOpen || !data) return null;

    const handleDelete = async () => {
        if (!currentYatra || !data.id) return;
        setIsDeleting(true);

        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            await deleteDoc(doc(db, collectionName, data.id));

            onSuccess();
            onClose();
        } catch (error) {
            console.error(`Error deleting from ${collectionName}:`, error);
            alert(`Failed to delete record from ${collectionName}`);
        } finally {
            setIsDeleting(false);
        }
    };

    const itemLabel = collectionName === 'cancellations' ? 'cancellation record' : 'registration';

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-sm rounded-2xl bg-[#0f111a] border border-white/10 shadow-2xl overflow-hidden animate-scale-in">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                        <Trash2 className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Delete Record?</h2>
                    <p className="text-sm text-gray-400 mb-6">
                        Are you sure you want to delete the {itemLabel} for <span className="text-white font-medium">{data.name}</span>? This action is <span className="text-red-400 font-bold">permanent</span> and cannot be undone.
                    </p>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 transition-all"
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Delete'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
