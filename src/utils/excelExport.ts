import * as XLSX from 'xlsx';
import type { Registration, Cancellation } from '../types';
import { format } from 'date-fns';

// Helper to format Firestore Timestamp or Date
const formatDate = (value: any): string => {
    if (!value) return '';
    try {
        // Handle Firestore Timestamp
        if (value?.toDate) {
            return format(value.toDate(), 'dd/MM/yyyy hh:mm a');
        }
        // Handle regular Date
        if (value instanceof Date) {
            return format(value, 'dd/MM/yyyy hh:mm a');
        }
        // Handle ISO string
        if (typeof value === 'string') {
            return format(new Date(value), 'dd/MM/yyyy hh:mm a');
        }
    } catch {
        return String(value);
    }
    return String(value);
};

// Helper to format currency
const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return '';
    return `₹${value.toLocaleString('en-IN')}`;
};

// Registration Export Headers
const REGISTRATION_HEADERS = [
    // Registration info (will be merged for multi-member registrations)
    'Family ID',
    'Primary Contact',
    'Phone',
    'Email',
    'WhatsApp',
    'Address',
    // Member info (one per row)
    'Member Name',
    'Age',
    'Gender',
    'Package',
    'Package Price',
    'Room Number',
    // Payment info (will be merged)
    'Total Amount',
    'Amount Paid',
    'Payment Type',
    'UTR/Transaction ID',
    'Payment Status',
    'Joined WhatsApp',
    'Submitted At',
    'Remarks',
];

// Cancellation Export Headers
const CANCELLATION_HEADERS = [
    'Original Reg ID',
    'Primary Contact',
    'Phone',
    // Member info (one per row)
    'Cancelled Member Name',
    'Age',
    'Gender',
    'Package',
    // Refund info (will be merged)
    'Refund Amount',
    'Refund Status',
    'Refund UTR',
    'Refund % Applied',
    'Cancelled At',
    'Remarks',
];

interface ExportOptions {
    filename?: string;
    sheetName?: string;
}

/**
 * Export registrations to Excel with proper formatting and cell merging for grouped data
 */
export const exportRegistrationsToExcel = (
    registrations: Registration[],
    options: ExportOptions = {}
) => {
    const { filename = 'registrations_export', sheetName = 'Registrations' } = options;

    // Build the data array with merged cells info
    const data: any[][] = [];
    const merges: XLSX.Range[] = [];

    // Add headers
    data.push(REGISTRATION_HEADERS);

    let currentRow = 1; // Start after header row (0-indexed)

    registrations.forEach((reg) => {
        const memberCount = Math.max(reg.members?.length || 1, 1);
        const startRow = currentRow;

        // Common registration data (to be merged across member rows)
        const commonData = {
            familyId: reg.familyId || reg.id || '',
            name: reg.name || '',
            phone: reg.phone || '',
            email: reg.email || '',
            whatsapp: reg.whatsapp || reg.phone || '',
            address: reg.address || '',
            totalAmount: formatCurrency(reg.totalAmount || reg.paymentDetails?.totalAmount),
            amountPaid: formatCurrency(reg.paymentDetails?.amountPaid || reg.totalAmount),
            paymentType: reg.paymentDetails?.paymentType || 'full',
            utr: reg.utr || reg.paymentDetails?.utrNumber || '',
            paymentStatus: reg.paymentStatus || reg.paymentDetails?.paymentStatus || '',
            joinedWhatsapp: reg.joinedWhatsapp || 'no',
            submittedAt: formatDate(reg.submittedAt),
            remarks: reg.remarks || '',
        };

        // Add a row for each member
        if (reg.members && reg.members.length > 0) {
            reg.members.forEach((member, idx) => {
                const row = [
                    idx === 0 ? commonData.familyId : '',
                    idx === 0 ? commonData.name : '',
                    idx === 0 ? commonData.phone : '',
                    idx === 0 ? commonData.email : '',
                    idx === 0 ? commonData.whatsapp : '',
                    idx === 0 ? commonData.address : '',
                    // Member data
                    member.name || '',
                    member.age || '',
                    member.gender || '',
                    member.packageName || '',
                    member.packagePrice ? formatCurrency(member.packagePrice) : '',
                    member.roomNumber || '',
                    // Payment data
                    idx === 0 ? commonData.totalAmount : '',
                    idx === 0 ? commonData.amountPaid : '',
                    idx === 0 ? commonData.paymentType : '',
                    idx === 0 ? commonData.utr : '',
                    idx === 0 ? commonData.paymentStatus : '',
                    idx === 0 ? commonData.joinedWhatsapp : '',
                    idx === 0 ? commonData.submittedAt : '',
                    idx === 0 ? commonData.remarks : '',
                ];
                data.push(row);
            });
        } else {
            // No members, add single row
            const row = [
                commonData.familyId,
                commonData.name,
                commonData.phone,
                commonData.email,
                commonData.whatsapp,
                commonData.address,
                '', '', '', '', '', '', // Empty member columns
                commonData.totalAmount,
                commonData.amountPaid,
                commonData.paymentType,
                commonData.utr,
                commonData.paymentStatus,
                commonData.joinedWhatsapp,
                commonData.submittedAt,
                commonData.remarks,
            ];
            data.push(row);
        }

        // Add merge ranges for multi-member registrations
        if (memberCount > 1) {
            // Columns to merge: 0-5 (registration info) and 12-19 (payment info)
            const mergeColumns = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19];
            mergeColumns.forEach(col => {
                merges.push({
                    s: { r: startRow, c: col },
                    e: { r: startRow + memberCount - 1, c: col }
                });
            });
        }

        currentRow += memberCount;
    });

    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Apply merges
    ws['!merges'] = merges;

    // Set column widths
    ws['!cols'] = [
        { wch: 15 }, // Family ID
        { wch: 20 }, // Primary Contact
        { wch: 15 }, // Phone
        { wch: 25 }, // Email
        { wch: 15 }, // WhatsApp
        { wch: 30 }, // Address
        { wch: 20 }, // Member Name
        { wch: 6 },  // Age
        { wch: 8 },  // Gender
        { wch: 15 }, // Package
        { wch: 12 }, // Package Price
        { wch: 12 }, // Room Number
        { wch: 12 }, // Total Amount
        { wch: 12 }, // Amount Paid
        { wch: 12 }, // Payment Type
        { wch: 20 }, // UTR
        { wch: 18 }, // Payment Status
        { wch: 15 }, // Joined WhatsApp
        { wch: 20 }, // Submitted At
        { wch: 25 }, // Remarks
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate and download
    XLSX.writeFile(wb, `${filename}.xlsx`);
};

/**
 * Export cancellations to Excel with proper formatting
 */
export const exportCancellationsToExcel = (
    cancellations: Cancellation[],
    options: ExportOptions = {}
) => {
    const { filename = 'cancellations_export', sheetName = 'Cancellations' } = options;

    const data: any[][] = [];
    const merges: XLSX.Range[] = [];

    // Add headers
    data.push(CANCELLATION_HEADERS);

    let currentRow = 1;

    cancellations.forEach((canc) => {
        const memberCount = Math.max(canc.cancelledMembers?.length || 1, 1);
        const startRow = currentRow;

        const commonData = {
            originalId: canc.originalRegistrationId || '',
            name: canc.name || '',
            phone: canc.phone || '',
            refundAmount: formatCurrency(canc.refundAmount),
            refundStatus: canc.refundStatus || '',
            refundUtr: canc.refundUtr || '',
            refundPercentage: canc.refundPercentageApplied ? `${canc.refundPercentageApplied}%` : '',
            cancelledAt: formatDate(canc.cancelledAt),
            remarks: canc.remarks || '',
        };

        if (canc.cancelledMembers && canc.cancelledMembers.length > 0) {
            canc.cancelledMembers.forEach((member, idx) => {
                const row = [
                    idx === 0 ? commonData.originalId : '',
                    idx === 0 ? commonData.name : '',
                    idx === 0 ? commonData.phone : '',
                    member.name || '',
                    member.age || '',
                    member.gender || '',
                    member.packageName || '',
                    idx === 0 ? commonData.refundAmount : '',
                    idx === 0 ? commonData.refundStatus : '',
                    idx === 0 ? commonData.refundUtr : '',
                    idx === 0 ? commonData.refundPercentage : '',
                    idx === 0 ? commonData.cancelledAt : '',
                    idx === 0 ? commonData.remarks : '',
                ];
                data.push(row);
            });
        } else {
            const row = [
                commonData.originalId,
                commonData.name,
                commonData.phone,
                '', '', '', '', // Empty member columns
                commonData.refundAmount,
                commonData.refundStatus,
                commonData.refundUtr,
                commonData.refundPercentage,
                commonData.cancelledAt,
                commonData.remarks,
            ];
            data.push(row);
        }

        if (memberCount > 1) {
            // Merge columns: 0-2 (contact info) and 7-12 (refund info)
            const mergeColumns = [0, 1, 2, 7, 8, 9, 10, 11, 12];
            mergeColumns.forEach(col => {
                merges.push({
                    s: { r: startRow, c: col },
                    e: { r: startRow + memberCount - 1, c: col }
                });
            });
        }

        currentRow += memberCount;
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = merges;

    ws['!cols'] = [
        { wch: 15 }, // Original Reg ID
        { wch: 20 }, // Primary Contact
        { wch: 15 }, // Phone
        { wch: 20 }, // Member Name
        { wch: 6 },  // Age
        { wch: 8 },  // Gender
        { wch: 15 }, // Package
        { wch: 12 }, // Refund Amount
        { wch: 12 }, // Refund Status
        { wch: 20 }, // Refund UTR
        { wch: 10 }, // Refund %
        { wch: 20 }, // Cancelled At
        { wch: 25 }, // Remarks
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    XLSX.writeFile(wb, `${filename}.xlsx`);
};
