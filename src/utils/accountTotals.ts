import type { Registration, Cancellation } from '../types';

export interface AccountTotals {
    chaitanya: number;
    narayana: number;
    cash: number;
    unassigned: number;
    total: number;
}

/**
 * Computes per-account totals using the EXACT same logic as PaymentTracking's items builder.
 * This is the single source of truth for account amounts.
 *
 * For each registration, it determines the account (chaitanya/narayana/cash/unassigned)
 * and the amount, using the same rules as PaymentTracking:
 * - Installment-based: each installment's amount goes to its assigned account
 * - Full payment: full amountPaid goes to the assigned account
 * - 2-Sharing premium: separate amount attributed to its assigned account
 */
export function computeAccountTotals(
    registrations: Registration[],
    twoSharingAmount: number = 0
): AccountTotals {
    const totals: AccountTotals = { chaitanya: 0, narayana: 0, cash: 0, unassigned: 0, total: 0 };

    const addToAccount = (account: string, amount: number) => {
        if (account === 'chaitanya') totals.chaitanya += amount;
        else if (account === 'narayana') totals.narayana += amount;
        else if (account === 'cash') totals.cash += amount;
        else totals.unassigned += amount;
        totals.total += amount;
    };

    registrations.forEach(reg => {
        // --- Installment-based registrations ---
        if (reg.paymentDetails?.installments?.length) {
            reg.paymentDetails.installments.forEach((inst, idx) => {
                let assigned: string = 'unassigned';

                const utr = ((inst as any).utrNumber || reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
                const isCashUTR = utr.includes('cash');

                if (inst.assignedTo) {
                    assigned = inst.assignedTo;
                } else if (isCashUTR && idx === 0) {
                    assigned = 'cash';
                } else if (idx === 0) {
                    if (reg.remarks?.toLowerCase().includes('chaitanya')) assigned = 'chaitanya';
                    else if (reg.remarks?.toLowerCase().includes('narayana')) assigned = 'narayana';
                }

                // Check member-level assignments
                const memberAssignments = reg.members?.map((_, mIdx) => {
                    return (inst as any).memberAssignments?.[mIdx] !== undefined
                        ? (inst as any).memberAssignments[mIdx]
                        : assigned;
                });
                const allSame = memberAssignments?.length
                    ? memberAssignments.every((a: any) => a === memberAssignments[0])
                    : true;

                if (allSame) {
                    addToAccount(memberAssignments?.[0] || assigned, inst.amount || 0);
                } else {
                    // Split by member
                    reg.members?.forEach((m, mIdx) => {
                        let mAmount = 0;
                        if (m.packagePrice) mAmount = m.packagePrice;
                        else if (reg.members.length > 0) mAmount = (inst.amount || 0) / reg.members.length;
                        addToAccount(memberAssignments![mIdx] || assigned, mAmount);
                    });
                }
            });
        }
        // --- Full payment / Puri-style ---
        else {
            let assigned: string = 'unassigned';

            const utr = (reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
            const isCashUTR = utr.includes('cash');

            if (reg.paymentDetails?.assignedTo) {
                assigned = reg.paymentDetails.assignedTo;
            } else if (isCashUTR) {
                assigned = 'cash';
            } else if (reg.remarks?.toLowerCase().includes('chaitanya')) {
                assigned = 'chaitanya';
            } else if (reg.remarks?.toLowerCase().includes('narayana')) {
                assigned = 'narayana';
            }

            // Member-level assignments
            const memberAssignments = reg.members?.map(m =>
                m.assignedTo !== undefined ? m.assignedTo : assigned
            );
            const allSame = memberAssignments?.length
                ? memberAssignments.every(a => a === memberAssignments[0])
                : true;

            const amount = reg.paymentDetails?.amountPaid || reg.totalAmount || 0;

            if (allSame) {
                addToAccount(memberAssignments?.[0] || assigned, amount);
            } else {
                reg.members?.forEach((m, idx) => {
                    let mAmount = 0;
                    if (m.packagePrice) mAmount = m.packagePrice;
                    else if (reg.members.length > 0) mAmount = amount / reg.members.length;
                    addToAccount(
                        m.assignedTo !== undefined && m.assignedTo !== null ? m.assignedTo : assigned,
                        mAmount
                    );
                });
            }
        }

        // --- 2-Sharing Premium ---
        const hasTwoSharingMembers = reg.members?.some(m => m.isTwoSharing);
        const existingTwoSharingInstallment = reg.paymentDetails?.installments?.find(i => i.name === '2 Sharing Premium');

        if (hasTwoSharingMembers && !existingTwoSharingInstallment && twoSharingAmount > 0) {
            const twoSharingCount = reg.members!.filter(m => m.isTwoSharing).length;
            const totalFee = twoSharingCount * twoSharingAmount;
            const twoSharingAssigned = reg.paymentDetails?.twoSharingAssignedTo || 'unassigned';
            addToAccount(twoSharingAssigned, totalFee);
        }
    });

    return totals;
}
