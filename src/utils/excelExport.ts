import * as XLSX from 'xlsx';
import type { Registration, Cancellation } from '../types';
import { format } from 'date-fns';

// Helper to format Firestore Timestamp or Date
const formatDate = (value: any): string => {
    if (!value) return '';
    try {
        if (value?.toDate) return format(value.toDate(), 'dd/MM/yyyy hh:mm a');
        if (value instanceof Date) return format(value, 'dd/MM/yyyy hh:mm a');
        if (typeof value === 'string') return format(new Date(value), 'dd/MM/yyyy hh:mm a');
    } catch { return String(value); }
    return String(value);
};

const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return '';
    return `₹${value.toLocaleString('en-IN')}`;
};

// ─── Column Definitions ────────────────────────────────────────────────────

// Each column definition maps a key to how to extract data from a Registration
interface ColumnDef {
    key: string;
    header: string;
    width: number;
    /** If true, this value is per-registration (merged across members). If false, per-member. */
    perRegistration: boolean;
    getValue: (reg: Registration, member?: any, memberIdx?: number) => any;
}

const REG_COLUMN_DEFS: ColumnDef[] = [
    { key: 'familyId', header: 'Family ID', width: 15, perRegistration: true, getValue: (r) => r.familyId || r.id || '' },
    { key: 'name', header: 'Primary Contact', width: 22, perRegistration: true, getValue: (r) => r.name || '' },
    { key: 'phone', header: 'Phone', width: 15, perRegistration: true, getValue: (r) => r.phone || '' },
    { key: 'email', header: 'Email', width: 25, perRegistration: true, getValue: (r) => r.email || '' },
    { key: 'whatsapp', header: 'WhatsApp Number', width: 15, perRegistration: true, getValue: (r) => r.whatsapp || r.phone || '' },
    { key: 'address', header: 'Address', width: 30, perRegistration: true, getValue: (r) => r.address || '' },
    { key: 'memberName', header: 'Member Name', width: 22, perRegistration: false, getValue: (_r, m) => m?.name || '' },
    { key: 'memberPhone', header: 'Member Phone', width: 15, perRegistration: false, getValue: (_r, m) => m?.phone || '' },
    { key: 'memberAge', header: 'Age', width: 6, perRegistration: false, getValue: (_r, m) => m?.age || '' },
    { key: 'memberGender', header: 'Gender', width: 8, perRegistration: false, getValue: (_r, m) => m?.gender || '' },
    { key: 'memberPackage', header: 'Package', width: 15, perRegistration: false, getValue: (_r, m) => m?.packageName || '' },
    { key: 'memberPackagePrice', header: 'Package Price', width: 13, perRegistration: false, getValue: (_r, m) => m?.packagePrice ? formatCurrency(m.packagePrice) : '' },
    { key: 'memberRoomNumber', header: 'Room Number', width: 12, perRegistration: false, getValue: (_r, m) => m?.roomNumber || '' },
    { key: 'memberIsTwoSharing', header: '2-Sharing', width: 10, perRegistration: false, getValue: (_r, m) => m?.isTwoSharing ? 'Yes' : 'No' },
    { key: 'memberIsManagement', header: 'Management', width: 12, perRegistration: false, getValue: (_r, m) => m?.isManagement ? 'Yes' : 'No' },
    { key: 'totalAmount', header: 'Total Amount', width: 13, perRegistration: true, getValue: (r) => formatCurrency(r.totalAmount || r.paymentDetails?.totalAmount) },
    { key: 'amountPaid', header: 'Amount Paid', width: 13, perRegistration: true, getValue: (r) => formatCurrency(r.paymentDetails?.amountPaid || r.totalAmount) },
    { key: 'paymentType', header: 'Payment Type', width: 13, perRegistration: true, getValue: (r) => r.paymentDetails?.paymentType || 'full' },
    { key: 'utr', header: 'UTR/Transaction ID', width: 20, perRegistration: true, getValue: (r) => r.utr || r.paymentDetails?.utrNumber || '' },
    { key: 'paymentStatus', header: 'Payment Status', width: 18, perRegistration: true, getValue: (r) => r.paymentStatus || r.paymentDetails?.paymentStatus || '' },
    {
        key: 'account', header: 'Assigned Account', width: 16, perRegistration: true,
        getValue: (r) => {
            if (r.paymentDetails?.assignedTo) return r.paymentDetails.assignedTo;
            if (r.paymentDetails?.installments?.length) {
                const first = r.paymentDetails.installments.find(i => i.assignedTo);
                if (first?.assignedTo) return first.assignedTo;
            }
            const rem = (r.remarks || '').toLowerCase();
            if (rem.includes('chaitanya')) return 'chaitanya';
            if (rem.includes('narayana')) return 'narayana';
            return '';
        }
    },
    { key: 'joinedWhatsapp', header: 'Joined WhatsApp', width: 15, perRegistration: true, getValue: (r) => {
        const raw = r.joinedWhatsapp;
        return String(raw).toLowerCase() === 'yes' ? 'Yes' : 'No';
    }},
    { key: 'submittedAt', header: 'Submitted At', width: 20, perRegistration: true, getValue: (r) => formatDate(r.submittedAt) },
    { key: 'remarks', header: 'Remarks', width: 25, perRegistration: true, getValue: (r) => r.remarks || '' },
];

// ─── Cancellation Column Definitions ────────────────────────────────────────

interface CancColumnDef {
    key: string;
    header: string;
    width: number;
    perCancellation: boolean;
    getValue: (canc: Cancellation, member?: any) => any;
}

const CANC_COLUMN_DEFS: CancColumnDef[] = [
    { key: 'originalId', header: 'Original Reg ID', width: 16, perCancellation: true, getValue: (c) => c.originalRegistrationId || '' },
    { key: 'name', header: 'Primary Contact', width: 22, perCancellation: true, getValue: (c) => c.name || '' },
    { key: 'phone', header: 'Phone', width: 15, perCancellation: true, getValue: (c) => c.phone || '' },
    { key: 'memberName', header: 'Cancelled Member Name', width: 22, perCancellation: false, getValue: (_c, m) => m?.name || '' },
    { key: 'memberAge', header: 'Age', width: 6, perCancellation: false, getValue: (_c, m) => m?.age || '' },
    { key: 'memberGender', header: 'Gender', width: 8, perCancellation: false, getValue: (_c, m) => m?.gender || '' },
    { key: 'memberPackage', header: 'Package', width: 15, perCancellation: false, getValue: (_c, m) => m?.packageName || '' },
    { key: 'amountPaidForCancelled', header: 'Amount Paid', width: 13, perCancellation: true, getValue: (c) => formatCurrency(c.amountPaidForCancelled || 0) },
    { key: 'refundAmount', header: 'Refund Amount', width: 13, perCancellation: true, getValue: (c) => formatCurrency(c.refundAmount) },
    { key: 'refundStatus', header: 'Refund Status', width: 14, perCancellation: true, getValue: (c) => c.refundStatus || '' },
    { key: 'refundUtr', header: 'Refund UTR', width: 20, perCancellation: true, getValue: (c) => c.refundUtr || '' },
    { key: 'refundPercentage', header: 'Refund % Applied', width: 12, perCancellation: true, getValue: (c) => c.refundPercentageApplied ? `${c.refundPercentageApplied}%` : '' },
    { key: 'trainCancellationCharges', header: 'Train Charges', width: 13, perCancellation: true, getValue: (c) => formatCurrency(c.trainCancellationCharges || 0) },
    {
        key: 'account', header: 'Original Account', width: 16, perCancellation: true,
        getValue: (c) => {
            const o = c.originalData;
            if (!o) return '';
            if (o.paymentDetails?.assignedTo) return o.paymentDetails.assignedTo;
            if (o.paymentDetails?.installments?.length) {
                const f = o.paymentDetails.installments.find((i: any) => i.assignedTo);
                if (f?.assignedTo) return f.assignedTo;
            }
            const rem = (o.remarks || '').toLowerCase();
            if (rem.includes('chaitanya')) return 'chaitanya';
            if (rem.includes('narayana')) return 'narayana';
            return '';
        }
    },
    { key: 'cancelledAt', header: 'Cancelled At', width: 20, perCancellation: true, getValue: (c) => formatDate(c.cancelledAt) },
    { key: 'remarks', header: 'Remarks', width: 25, perCancellation: true, getValue: (c) => c.remarks || '' },
];

// ─── Export Options ────────────────────────────────────────────────────────

interface ExportOptions {
    filename?: string;
    sheetName?: string;
    selectedColumns?: string[]; // If provided, only these column keys are exported
}

// ─── Registration Export ────────────────────────────────────────────────────

export const exportRegistrationsToExcel = (
    registrations: Registration[],
    options: ExportOptions = {}
) => {
    const { filename = 'registrations_export', sheetName = 'Registrations', selectedColumns } = options;

    // Filter to selected columns (or all if none specified)
    const activeCols = selectedColumns
        ? REG_COLUMN_DEFS.filter(c => selectedColumns.includes(c.key))
        : REG_COLUMN_DEFS;

    const data: any[][] = [];
    const merges: XLSX.Range[] = [];

    // Headers
    data.push(activeCols.map(c => c.header));

    let currentRow = 1;

    registrations.forEach(reg => {
        const memberCount = Math.max(reg.members?.length || 1, 1);
        const startRow = currentRow;

        if (reg.members && reg.members.length > 0) {
            reg.members.forEach((member, idx) => {
                const row: any[] = [];
                activeCols.forEach(colDef => {
                    if (colDef.perRegistration) {
                        row.push(idx === 0 ? colDef.getValue(reg) : '');
                    } else {
                        row.push(colDef.getValue(reg, member, idx));
                    }
                });
                data.push(row);
            });
        } else {
            const row: any[] = [];
            activeCols.forEach(colDef => {
                row.push(colDef.perRegistration ? colDef.getValue(reg) : '');
            });
            data.push(row);
        }

        // Merge per-registration columns across member rows
        if (memberCount > 1) {
            activeCols.forEach((colDef, colIdx) => {
                if (colDef.perRegistration) {
                    merges.push({
                        s: { r: startRow, c: colIdx },
                        e: { r: startRow + memberCount - 1, c: colIdx }
                    });
                }
            });
        }

        currentRow += memberCount;
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = merges;
    ws['!cols'] = activeCols.map(c => ({ wch: c.width }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

// ─── Cancellation Export ────────────────────────────────────────────────────

export const exportCancellationsToExcel = (
    cancellations: Cancellation[],
    options: ExportOptions = {}
) => {
    const { filename = 'cancellations_export', sheetName = 'Cancellations', selectedColumns } = options;

    const activeCols = selectedColumns
        ? CANC_COLUMN_DEFS.filter(c => selectedColumns.includes(c.key))
        : CANC_COLUMN_DEFS;

    const data: any[][] = [];
    const merges: XLSX.Range[] = [];

    data.push(activeCols.map(c => c.header));

    let currentRow = 1;

    cancellations.forEach(canc => {
        const memberCount = Math.max(canc.cancelledMembers?.length || 1, 1);
        const startRow = currentRow;

        if (canc.cancelledMembers && canc.cancelledMembers.length > 0) {
            canc.cancelledMembers.forEach((member, idx) => {
                const row: any[] = [];
                activeCols.forEach(colDef => {
                    if (colDef.perCancellation) {
                        row.push(idx === 0 ? colDef.getValue(canc) : '');
                    } else {
                        row.push(colDef.getValue(canc, member));
                    }
                });
                data.push(row);
            });
        } else {
            const row: any[] = [];
            activeCols.forEach(colDef => {
                row.push(colDef.perCancellation ? colDef.getValue(canc) : '');
            });
            data.push(row);
        }

        if (memberCount > 1) {
            activeCols.forEach((colDef, colIdx) => {
                if (colDef.perCancellation) {
                    merges.push({
                        s: { r: startRow, c: colIdx },
                        e: { r: startRow + memberCount - 1, c: colIdx }
                    });
                }
            });
        }

        currentRow += memberCount;
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = merges;
    ws['!cols'] = activeCols.map(c => ({ wch: c.width }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

// ─── Room Export (unchanged) ────────────────────────────────────────────────

const ROOM_HEADERS = [
    'Room Number', 'Room Type', 'Member Name', 'Age', 'Gender', 'Phone', 'Package', 'Special',
];

export const exportRoomsToExcel = (
    assignedRooms: Array<{ roomNumber: string; members: any[]; isTwoSharingRoom: boolean }>,
    options: ExportOptions = {}
) => {
    const { filename = 'rooms_allotment_export', sheetName = 'Rooms' } = options;

    const data: any[][] = [];
    const merges: XLSX.Range[] = [];
    data.push(ROOM_HEADERS);
    let currentRow = 1;

    assignedRooms.forEach(room => {
        const memberCount = Math.max(room.members?.length || 1, 1);
        const startRow = currentRow;
        const roomType = room.isTwoSharingRoom ? '2 Sharing' : 'Standard';

        if (room.members && room.members.length > 0) {
            room.members.forEach((member, idx) => {
                const ageNum = parseInt(String(member.age), 10);
                const isSenior = !isNaN(ageNum) && ageNum >= 55;
                const specialTags = [];
                if (member.isManagement) specialTags.push('MGMT');
                if (isSenior && !member.isManagement) specialTags.push('SENIOR');
                data.push([
                    idx === 0 ? room.roomNumber : '',
                    idx === 0 ? roomType : '',
                    member.name || '', member.age || '', member.gender || '',
                    member.phone || '', member.packageName || '', specialTags.join(', '),
                ]);
            });
        } else {
            data.push([room.roomNumber, roomType, '', '', '', '', '', '']);
        }

        if (memberCount > 1) {
            [0, 1].forEach(col => {
                merges.push({ s: { r: startRow, c: col }, e: { r: startRow + memberCount - 1, c: col } });
            });
        }
        currentRow += memberCount;
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = merges;
    ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 6 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
};
