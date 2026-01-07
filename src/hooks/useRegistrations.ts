import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAppStore } from '../store/useAppStore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import type { Registration, Cancellation } from '../types';

export const useRegistrations = () => {
    const { currentYatra } = useAppStore();
    const [data, setData] = useState<Registration[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentYatra) {
            setData([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const { db } = currentYatra.isMaster
            ? getMasterApp()
            : getDynamicApp(currentYatra.id, currentYatra.config);

        const q = query(collection(db, 'registrations')); // Remove orderBy to include docs missing submittedAt

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const regs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Registration[];

            // Client-side sort
            regs.sort((a, b) => {
                const dateA = a.submittedAt?.toDate?.() || new Date(a.submittedAt || 0);
                const dateB = b.submittedAt?.toDate?.() || new Date(b.submittedAt || 0);
                return dateB.getTime() - dateA.getTime();
            });

            setData(regs);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching registrations:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [currentYatra]);

    return { data, isLoading };
};

export const useCancellations = () => {
    const { currentYatra } = useAppStore();
    const [data, setData] = useState<Cancellation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentYatra) {
            setData([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const { db } = currentYatra.isMaster
            ? getMasterApp()
            : getDynamicApp(currentYatra.id, currentYatra.config);

        const q = query(collection(db, 'cancellations'), orderBy('cancelledAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const cancels = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Cancellation[];
            setData(cancels);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching cancellations:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [currentYatra]);

    return { data, isLoading };
};
