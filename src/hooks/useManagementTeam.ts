import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { getMasterApp, getDynamicApp } from '../services/firebase';
import { useAppStore } from '../store/useAppStore';
import type { ManagementMember } from '../types';

/**
 * Real-time listener for the global management team stored in master Firestore.
 */
export const useManagementTeam = () => {
    const [members, setMembers] = useState<ManagementMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const { db } = getMasterApp();
        const unsub = onSnapshot(collection(db, 'management_team'), (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ManagementMember));
            list.sort((a, b) => a.name.localeCompare(b.name));
            setMembers(list);
            setIsLoading(false);
        }, (error) => {
            console.error('Error fetching management team:', error);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    return { members, isLoading };
};

/**
 * Real-time listener for the per-yatra management selection.
 * Stored as a single doc `management_selection` inside the yatra's own Firestore under `config/management_selection`.
 */
export const useYatraManagementSelection = () => {
    const { currentYatra } = useAppStore();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentYatra) {
            setSelectedIds([]);
            setIsLoading(false);
            return;
        }

        const { db } = currentYatra.isMaster
            ? getMasterApp()
            : getDynamicApp(currentYatra.id, currentYatra.config);

        const docRef = doc(db, 'config', 'management_selection');
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setSelectedIds(snap.data().selectedMemberIds || []);
            } else {
                setSelectedIds([]);
            }
            setIsLoading(false);
        }, (error) => {
            console.error('Error fetching management selection:', error);
            setIsLoading(false);
        });

        return () => unsub();
    }, [currentYatra]);

    return { selectedIds, isLoading };
};

// --- CRUD helpers ---

export const addManagementMember = async (member: Omit<ManagementMember, 'id'>) => {
    const { db } = getMasterApp();
    const docRef = doc(collection(db, 'management_team'));
    await setDoc(docRef, member);
    return docRef.id;
};

export const updateManagementMember = async (id: string, data: Partial<ManagementMember>) => {
    const { db } = getMasterApp();
    const docRef = doc(db, 'management_team', id);
    await setDoc(docRef, data, { merge: true });
};

export const deleteManagementMember = async (id: string) => {
    const { db } = getMasterApp();
    await deleteDoc(doc(db, 'management_team', id));
};

export const saveYatraManagementSelection = async (
    yatra: { id: string; isMaster?: boolean; config: any },
    selectedMemberIds: string[]
) => {
    const { db } = yatra.isMaster
        ? getMasterApp()
        : getDynamicApp(yatra.id, yatra.config);

    const docRef = doc(db, 'config', 'management_selection');
    await setDoc(docRef, { selectedMemberIds });
};
