import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getMasterApp } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { X, Lock } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const LoginModal = ({ isOpen, onClose }: Props) => {
    const { login } = useAppStore();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Get Master DB (Auth is always against Master)
            const { db } = getMasterApp();

            // Query for user
            const usersRef = collection(db, 'admin_users');
            const q = query(usersRef, where('username', '==', username), where('password', '==', password));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                // Success
                const userDoc = snapshot.docs[0].data();
                login({
                    name: userDoc.username,
                    role: userDoc.role || 'admin'
                });
                onClose();
            } else {
                setError('Invalid credentials');
            }
        } catch (err: any) {
            console.error("Login Error:", err);
            setError('Authentication failed. Check console.');
        }
    };



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-sm glass-card p-8 relative overflow-hidden">
                {/* Decorative Gradient Line */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500"></div>

                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                </button>

                <div className="mb-0 flex flex-col items-center gap-4 text-center pb-6">
                    <div className="p-3 bg-white/5 rounded-full ring-1 ring-white/10 shadow-lg shadow-purple-500/10">
                        <Lock className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gradient">Admin Access</h2>
                        <p className="text-sm text-gray-400 mt-1">Authenticate to manage yatras</p>
                    </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full input-glass"
                            placeholder="Enter username"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 ml-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full input-glass"
                            placeholder="Enter password"
                        />
                    </div>

                    {error && <p className="text-sm text-red-400 bg-red-500/10 p-2.5 rounded-lg text-center border border-red-500/20">{error}</p>}

                    <button type="submit" className="w-full btn-primary font-bold shadow-xl shadow-purple-500/20 py-2.5">
                        Sign In
                    </button>

                    {/* Dev Link was removed, so we just close the form */}
                </form>

            </div>
        </div>
    );
};
