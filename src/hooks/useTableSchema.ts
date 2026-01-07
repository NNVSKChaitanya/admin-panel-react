import { useMemo } from 'react';
import type { Registration, YatraDefinition, GridColumn } from '../types';

export const useTableSchema = (yatra: YatraDefinition | null, data: Registration[] = []) => {
    return useMemo(() => {
        // 1. If explicit config exists, use it
        if (yatra?.fieldConfig?.columns) {
            return yatra.fieldConfig.columns;
        }

        // 2. Fallback: Auto-Discovery logic
        const columns: GridColumn[] = [
            { key: 'name', label: 'Primary Contact', type: 'text' },
            { key: 'phone', label: 'Phone', type: 'text' },
        ];

        // Detect if we have "members" with packages
        const hasPackages = data.some(r => r.members?.some(m => m.packageName));
        if (hasPackages) {
            columns.push({ key: 'members_summary', label: 'Type', type: 'badge' }); // Custom type for "2 AC, 1 Non-AC"
        } else {
            columns.push({ key: 'members.length', label: 'Travellers', type: 'text' });
        }

        // Detect Payment Type
        const hasComplexPayment = data.some(r => r.paymentDetails?.paymentType === 'installment');
        if (hasComplexPayment) {
            columns.push({ key: 'paymentDetails.installments', label: 'Installments', type: 'progress' });
            columns.push({ key: 'paymentDetails.totalAmount', label: 'Total', type: 'currency' });
        } else {
            columns.push({ key: 'totalAmount', label: 'Amount', type: 'currency' });
            columns.push({ key: 'paymentStatus', label: 'Status', type: 'status' });
        }

        columns.push({ key: 'utr', label: 'UTR/ID', type: 'text' });

        return columns;
    }, [yatra, data]);
};
