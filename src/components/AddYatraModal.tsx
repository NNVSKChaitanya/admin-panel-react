import { useState } from 'react';
// import { useAppStore } from '../store/useAppStore'; 
// Hook unused, commented out or removed
import { getMasterApp } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { X, PlusSquare } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const AddYatraModal = ({ isOpen, onClose }: Props) => {
    // const { currentYatra } = useAppStore();
    const [name, setName] = useState('');
    const [bgImage, setBgImage] = useState('');
    const [configJson, setConfigJson] = useState('');
    const [fieldConfigJson, setFieldConfigJson] = useState(''); // Advanced
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSave = async () => {
        try {
            if (!name || !configJson) return alert('Name and Config are required');

            setIsSubmitting(true);
            const config = JSON.parse(configJson);
            let fieldConfig = undefined;

            if (fieldConfigJson) {
                fieldConfig = JSON.parse(fieldConfigJson);
            }

            const { db } = getMasterApp();
            await addDoc(collection(db, 'yatra_dashboards'), {
                name,
                bgImage,
                config,
                fieldConfig,
                createdAt: new Date().toISOString()
            });

            onClose();
            // Store listener will auto-update
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl relative max-h-[90vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-black">
                    <X className="w-5 h-5" />
                </button>

                <div className="mb-6 flex items-center gap-2 text-purple-700">
                    <PlusSquare className="w-6 h-6" />
                    <h2 className="text-xl font-bold">Add New Yatra</h2>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Yatra Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-900"
                            placeholder="e.g. Vrindavan 2025"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Background Image URL</label>
                        <input
                            type="text"
                            value={bgImage}
                            onChange={(e) => setBgImage(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-900"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Firebase Config (JSON)</label>
                        <textarea
                            rows={5}
                            value={configJson}
                            onChange={(e) => setConfigJson(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-xs text-gray-600"
                            placeholder='{ "apiKey": "...", "projectId": "..." }'
                        />
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-medium text-gray-700">Advanced: Field Config (JSON) [Optional]</label>
                        <p className="text-xs text-gray-500 mb-2">Define custom columns if auto-discovery is insufficient.</p>
                        <textarea
                            rows={4}
                            value={fieldConfigJson}
                            onChange={(e) => setFieldConfigJson(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-xs text-gray-600"
                            placeholder='{ "columns": [{ "key": "package.name", "label": "Pkg" }] }'
                        />
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button onClick={onClose} className="flex-1 rounded-md bg-gray-200 py-2 text-gray-700 hover:bg-gray-300">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSubmitting}
                            className="flex-1 rounded-md bg-purple-600 py-2 font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Yatra'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
