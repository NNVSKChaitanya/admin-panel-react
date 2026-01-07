import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { YatraDefinition } from '../types';
import { getMasterApp } from '../services/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

interface AppState {
    // Auth State
    isAuthenticated: boolean;
    isAdminMode: boolean; // True if logged in
    user: { name: string; role: string } | null;
    login: (user: { name: string; role: string }) => void;
    logout: () => void;

    // Yatra Context
    yatras: YatraDefinition[];
    currentYatraId: string;
    currentYatra: YatraDefinition | null;
    isLoadingYatras: boolean;

    // Actions
    setYatras: (yatras: YatraDefinition[]) => void;
    setCurrentYatra: (id: string) => void;
    loadYatrasFromMaster: () => Unsubscribe;
}

type Unsubscribe = () => void;

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            isAuthenticated: false,
            isAdminMode: false,
            user: null,
            login: (user) => set({ isAuthenticated: true, isAdminMode: user.role === 'admin', user }),
            logout: () => set({ isAuthenticated: false, isAdminMode: false, user: null }),

            yatras: [],
            currentYatraId: '',
            currentYatra: null,
            isLoadingYatras: true,

            setYatras: (yatras) => set({ yatras }),
            setCurrentYatra: (id) => {
                const yatra = get().yatras.find(y => y.id === id) || null;
                set({ currentYatraId: id, currentYatra: yatra });
            },

            loadYatrasFromMaster: () => {
                const { db } = getMasterApp();
                set({ isLoadingYatras: true });

                // Default/Fallback Master Yatra
                const masterYatra: YatraDefinition = {
                    id: 'master_puri',
                    name: 'Puri Yatra 2025',
                    config: {
                        apiKey: "AIzaSyAv9AJA_4AZkOTCCZuBtraZntNW3xVspuA",
                        authDomain: "puri-yatra-one-page-site.firebaseapp.com",
                        projectId: "puri-yatra-one-page-site",
                        storageBucket: "puri-yatra-one-page-site.firebasestorage.app",
                        messagingSenderId: "489940391211",
                        appId: "1:489940391211:web:a30966971f77626feba16e"
                    },
                    isMaster: true,
                    bgImage: 'https://i.pinimg.com/736x/7e/f1/9c/7ef19cc13322d0e8cfd322b7203b8d77.jpg'
                };

                const q = query(collection(db, "yatra_dashboards"));
                const unsub = onSnapshot(q, (snapshot) => {
                    const fetchedYatras: YatraDefinition[] = [];
                    let masterOverride: Partial<YatraDefinition> | null = null;

                    snapshot.docs.forEach(doc => {
                        const data = doc.data();
                        if (doc.id === 'master_puri_override') {
                            masterOverride = data as any;
                        } else {
                            fetchedYatras.push({ id: doc.id, ...data } as YatraDefinition);
                        }
                    });

                    // Apply override
                    const finalMaster = (masterOverride && typeof masterOverride === 'object') ? { ...masterYatra, ...(masterOverride as any) } : masterYatra;

                    const allYatras = [finalMaster, ...fetchedYatras];

                    set({
                        yatras: allYatras,
                        isLoadingYatras: false
                    });

                    // If no current yatra selected, select master
                    // BUT check global state first if trying to persist? No, 'get().currentYatraId' will be hydrated if persisted.
                    const currentId = get().currentYatraId;

                    if (!currentId && allYatras.length > 0) {
                        get().setCurrentYatra(allYatras[0].id);
                    } else if (currentId) {
                        // Re-sync current object from newly fetched list
                        get().setCurrentYatra(currentId);
                    }
                });

                return unsub;
            }
        }),
        {
            name: 'admin-panel-storage',
            partialize: (state) => ({
                isAuthenticated: state.isAuthenticated,
                isAdminMode: state.isAdminMode,
                user: state.user,
                currentYatraId: state.currentYatraId
            })
        }
    )
);
