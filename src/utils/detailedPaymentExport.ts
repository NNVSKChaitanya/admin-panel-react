import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Registration, Cancellation } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaymentItemForExport {
    name: string;
    amount: number;
    assignedTo: 'chaitanya' | 'narayana' | 'cash' | 'unassigned';
    type: 'full' | 'installment' | 'twoSharing' | 'member';
    groupLabel: string;
}

interface CancellationForExport {
    name: string;
    paidAmount: number;
    refundAmount: number;
    retainedAmount: number;
    account: string;
}

interface ExportConfig {
    yatraName?: string;
    twoSharingAmount?: number;
}

// ─── Style Presets ──────────────────────────────────────────────────────────

const COLORS = {
    titleBg: '1B1464',
    titleFont: 'FFFFFF',
    subtitleBg: '2D2A6E',
    subtitleFont: 'B8B5E0',

    summaryHeaderBg: '1F2937',
    summaryHeaderFont: 'F9FAFB',

    chaitanyaBg: '0E7490',
    chaitanyaLight: 'E0F7FA',
    narayanaBg: '0369A1',
    narayanaLight: 'E0F2FE',
    cashBg: '047857',
    cashLight: 'D1FAE5',
    accountFont: 'FFFFFF',

    tableHeaderBg: '374151',
    tableHeaderFont: 'F9FAFB',
    subHeaderBg: '4B5563',

    totalRowBg: 'FEF3C7',
    totalRowFont: '92400E',

    grandTotalBg: '065F46',
    grandTotalFont: 'FFFFFF',

    calcBg: 'F0FDF4',         // Very light green
    calcLabelBg: 'F8FAFC',    // Slate-50
    calcValueBg: 'FFFFFF',
    calcBalanceBg: '065F46',
    calcBalanceFont: 'FFFFFF',
    calcHeaderBg: '1E293B',   // Slate-800
    calcHeaderFont: 'F1F5F9',

    expenseHeaderBg: '6D28D9',
    expenseHeaderFont: 'FFFFFF',
    trainHeaderBg: 'B45309',
    trainHeaderFont: 'FFFFFF',

    altRowBg: 'F3F4F6',
    white: 'FFFFFF',
    lightBorder: 'D1D5DB',
    darkText: '111827',
    mutedText: '6B7280',
};

const INR_FMT = '₹#,##0';

const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: COLORS.lightBorder } },
    left: { style: 'thin', color: { argb: COLORS.lightBorder } },
    bottom: { style: 'thin', color: { argb: COLORS.lightBorder } },
    right: { style: 'thin', color: { argb: COLORS.lightBorder } },
};

const medBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'medium', color: { argb: '9CA3AF' } },
    left: { style: 'medium', color: { argb: '9CA3AF' } },
    bottom: { style: 'medium', color: { argb: '9CA3AF' } },
    right: { style: 'medium', color: { argb: '9CA3AF' } },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function s(
    ws: ExcelJS.Worksheet, r: number, c: number,
    opts: {
        bg?: string; font?: string; bold?: boolean; size?: number;
        border?: Partial<ExcelJS.Borders> | null; numFmt?: string;
        hAlign?: 'left' | 'center' | 'right';
        italic?: boolean;
    } = {}
) {
    const cell = ws.getCell(r, c);
    if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
    cell.font = {
        name: 'Calibri', size: opts.size || 11,
        bold: opts.bold || false, italic: opts.italic || false,
        color: opts.font ? { argb: opts.font } : { argb: COLORS.darkText },
    };
    if (opts.border !== null) cell.border = opts.border || thinBorder;
    cell.alignment = { horizontal: opts.hAlign || 'left', vertical: 'middle', wrapText: true };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
}


function v(ws: ExcelJS.Worksheet, r: number, c: number, value: any) {
    ws.getCell(r, c).value = value;
}


// ─── Data Building ──────────────────────────────────────────────────────────

function getCancellationAccount(canc: Cancellation): string {
    const o = canc.originalData;
    if (!o) return 'unassigned';
    const utr = (o.utr || o.paymentDetails?.utrNumber || '').toLowerCase();
    if (utr.includes('cash') || o.paymentDetails?.assignedTo === 'cash') return 'cash';
    if (o.paymentDetails?.assignedTo) return o.paymentDetails.assignedTo;
    if (o.paymentDetails?.installments?.length) {
        const f = o.paymentDetails.installments[0];
        if (f.assignedTo) return f.assignedTo;
    }
    const rem = (o.remarks || '').toLowerCase();
    if (rem.includes('chaitanya')) return 'chaitanya';
    if (rem.includes('narayana')) return 'narayana';
    return 'unassigned';
}

function buildPaymentItems(registrations: Registration[], twoSharingAmount: number): PaymentItemForExport[] {
    const list: PaymentItemForExport[] = [];
    registrations.forEach(reg => {
        if (reg.paymentDetails?.installments?.length) {
            reg.paymentDetails.installments.forEach((inst, idx) => {
                let assigned: 'chaitanya' | 'narayana' | 'cash' | 'unassigned' = 'unassigned';
                const utr = ((inst as any).utrNumber || reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
                if (inst.assignedTo) assigned = inst.assignedTo;
                else if (utr.includes('cash') && idx === 0) assigned = 'cash';
                else if (idx === 0) {
                    if (reg.remarks?.toLowerCase().includes('chaitanya')) assigned = 'chaitanya';
                    else if (reg.remarks?.toLowerCase().includes('narayana')) assigned = 'narayana';
                }
                const ma = reg.members?.map((_, mi) => (inst as any).memberAssignments?.[mi] !== undefined ? (inst as any).memberAssignments[mi] : assigned);
                const same = ma?.length ? ma.every((a: any) => a === ma[0]) : true;
                let gl = 'Other';
                if (inst.name === '2 Sharing Premium') gl = '2 Sharing';
                else if (idx === 0) gl = '1st Installment';
                else if (idx === 1) gl = '2nd Installment';
                else if (idx === 2) gl = '3rd Installment';
                else if (idx === 3) gl = '4th Installment';
                if (same) {
                    list.push({ name: `${reg.name} (Inst. ${idx + 1})`, amount: inst.amount || 0, assignedTo: ma?.[0] || assigned, type: 'installment', groupLabel: gl });
                } else {
                    reg.members?.forEach((m, mi) => {
                        const amt = m.packagePrice || ((inst.amount || 0) / (reg.members.length || 1));
                        list.push({ name: `${m.name} (Inst. ${idx + 1})`, amount: amt, assignedTo: ma![mi] || assigned, type: 'member', groupLabel: gl });
                    });
                }
            });
        } else {
            let assigned: 'chaitanya' | 'narayana' | 'cash' | 'unassigned' = 'unassigned';
            const utr = (reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
            if (reg.paymentDetails?.assignedTo) assigned = reg.paymentDetails.assignedTo;
            else if (utr.includes('cash')) assigned = 'cash';
            else if (reg.remarks?.toLowerCase().includes('chaitanya')) assigned = 'chaitanya';
            else if (reg.remarks?.toLowerCase().includes('narayana')) assigned = 'narayana';
            const ma = reg.members?.map(m => m.assignedTo !== undefined ? m.assignedTo : assigned);
            const same = ma?.length ? ma.every(a => a === ma[0]) : true;
            const amount = reg.paymentDetails?.amountPaid || reg.totalAmount || 0;
            if (same) {
                list.push({ name: reg.name, amount, assignedTo: ma?.[0] || assigned, type: 'full', groupLabel: 'Full Payment' });
            } else {
                reg.members?.forEach(m => {
                    const amt = m.packagePrice || (amount / (reg.members.length || 1));
                    list.push({ name: `${m.name} (${reg.name})`, amount: amt, assignedTo: m.assignedTo !== undefined && m.assignedTo !== null ? m.assignedTo : assigned, type: 'member', groupLabel: 'Full Payment' });
                });
            }
        }
        const has2s = reg.members?.some(m => m.isTwoSharing);
        const existing2s = reg.paymentDetails?.installments?.find(i => i.name === '2 Sharing Premium');
        if (has2s && !existing2s && twoSharingAmount > 0) {
            const cnt = reg.members!.filter(m => m.isTwoSharing).length;
            let tsa: 'chaitanya' | 'narayana' | 'cash' | 'unassigned' = 'unassigned';
            if (reg.paymentDetails?.twoSharingAssignedTo) tsa = reg.paymentDetails.twoSharingAssignedTo;
            list.push({ name: `${reg.name} (2-Sharing)`, amount: cnt * twoSharingAmount, assignedTo: tsa, type: 'twoSharing', groupLabel: '2 Sharing' });
        }
    });
    return list;
}

// ─── Main Export ────────────────────────────────────────────────────────────

export async function exportDetailedPaymentsExcel(
    registrations: Registration[],
    cancellations: Cancellation[],
    config: ExportConfig = {}
) {
    const { yatraName = 'Yatra', twoSharingAmount = 0 } = config;
    const allItems = buildPaymentItems(registrations, twoSharingAmount);

    const accounts = ['chaitanya', 'narayana', 'cash'] as const;
    const accountLabels: Record<string, string> = { chaitanya: 'Chaitanya (Online)', narayana: 'Narayana (Online)', cash: 'Cash / Spot' };
    const accountColors: Record<string, string> = { chaitanya: COLORS.chaitanyaBg, narayana: COLORS.narayanaBg, cash: COLORS.cashBg };

    const itemsByAccount: Record<string, PaymentItemForExport[]> = {};
    accounts.forEach(a => { itemsByAccount[a] = allItems.filter(i => i.assignedTo === a); });

    const cancsByAccount: Record<string, CancellationForExport[]> = {};
    accounts.forEach(a => { cancsByAccount[a] = []; });
    cancellations.forEach(canc => {
        const account = getCancellationAccount(canc);
        const paid = canc.amountPaidForCancelled || 0;
        const refund = canc.refundAmount || 0;
        const retained = Math.max(0, paid - refund);
        if (cancsByAccount[account]) cancsByAccount[account].push({ name: canc.name, paidAmount: paid, refundAmount: refund, retainedAmount: retained, account });
    });

    const accountTotals: Record<string, number> = {};
    const cancRetainedTotals: Record<string, number> = {};
    const cancRefundTotals: Record<string, number> = {};
    accounts.forEach(a => {
        accountTotals[a] = itemsByAccount[a].reduce((sum, i) => sum + i.amount, 0);
        cancRetainedTotals[a] = cancsByAccount[a].reduce((sum, c) => sum + c.retainedAmount, 0);
        cancRefundTotals[a] = cancsByAccount[a].reduce((sum, c) => sum + c.refundAmount, 0);
    });
    const overallReceived = accounts.reduce((sum, a) => sum + accountTotals[a], 0);
    const overallRetained = accounts.reduce((sum, a) => sum + cancRetainedTotals[a], 0);
    const overallRefunds = accounts.reduce((sum, a) => sum + cancRefundTotals[a], 0);

    // ─── Create Workbook ────────────────────────────────────────────

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ISKCON Tenali Admin Panel';
    const ws = wb.addWorksheet('Detailed Payments', {
        views: [{ showGridLines: false }],
    });

    // Column widths — generous to avoid ####
    ws.columns = [
        { width: 7 },   // A: S.No
        { width: 34 },  // B: Name
        { width: 18 },  // C: Group/Label
        { width: 18 },  // D: Amount
        { width: 3 },   // E: Spacer
        { width: 7 },   // F: S.No
        { width: 30 },  // G: Name
        { width: 18 },  // H: Paid/Charges
        { width: 18 },  // I: Refund
        { width: 20 },  // J: Retained/Remarks
    ];

    let row = 1;
    let tableCounter = 0; // For unique table names

    // ══════════════════════════════════════════════════════════════════
    // TITLE
    // ══════════════════════════════════════════════════════════════════

    ws.mergeCells(row, 1, row, 10);
    v(ws, row, 1, `${yatraName} — Detailed Payment Report`);
    s(ws, row, 1, { bg: COLORS.titleBg, font: COLORS.titleFont, bold: true, size: 16, border: medBorder, hAlign: 'center' });
    ws.getRow(row).height = 38;
    row++;

    ws.mergeCells(row, 1, row, 10);
    v(ws, row, 1, `Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    s(ws, row, 1, { bg: COLORS.subtitleBg, font: COLORS.subtitleFont, size: 10, italic: true, hAlign: 'center', border: medBorder });
    row += 2;

    // ══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════

    ws.mergeCells(row, 1, row, 5);
    v(ws, row, 1, 'SUMMARY');
    s(ws, row, 1, { bg: COLORS.summaryHeaderBg, font: COLORS.summaryHeaderFont, bold: true, size: 14, border: medBorder, hAlign: 'center' });
    ws.getRow(row).height = 30;
    row++;

    const sumHeaders = ['#', 'Account', 'Amount Received', 'Retained (Cancellation)', 'Total Refunds'];
    sumHeaders.forEach((h, i) => {
        v(ws, row, i + 1, h);
        s(ws, row, i + 1, { bg: COLORS.tableHeaderBg, font: COLORS.tableHeaderFont, bold: true, hAlign: 'center', border: medBorder, size: 10 });
    });
    row++;

    accounts.forEach((acc, idx) => {
        const bg = idx % 2 === 0 ? COLORS.white : COLORS.altRowBg;
        v(ws, row, 1, idx + 1);
        v(ws, row, 2, accountLabels[acc]);
        v(ws, row, 3, accountTotals[acc]);
        v(ws, row, 4, cancRetainedTotals[acc]);
        v(ws, row, 5, cancRefundTotals[acc]);
        s(ws, row, 1, { bg, hAlign: 'center', border: thinBorder });
        s(ws, row, 2, { bg, font: accountColors[acc], bold: true, border: thinBorder });
        for (let c = 3; c <= 5; c++) s(ws, row, c, { bg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder });
        row++;
    });

    v(ws, row, 1, '');
    v(ws, row, 2, 'OVERALL');
    v(ws, row, 3, overallReceived);
    v(ws, row, 4, overallRetained);
    v(ws, row, 5, overallRefunds);
    for (let c = 1; c <= 5; c++) {
        s(ws, row, c, { bg: COLORS.grandTotalBg, font: COLORS.grandTotalFont, bold: true, border: medBorder, hAlign: c >= 3 ? 'right' : 'center', numFmt: c >= 3 ? INR_FMT : undefined, size: 12 });
    }
    row += 3;

    // ══════════════════════════════════════════════════════════════════
    // PER-ACCOUNT SECTIONS
    // ══════════════════════════════════════════════════════════════════

    const groupOrder = ['Full Payment', '1st Installment', '2nd Installment', '3rd Installment', '4th Installment', '2 Sharing', 'Other'];

    accounts.forEach(acc => {
        const label = accountLabels[acc];
        const acColor = accountColors[acc];
        const acItems = itemsByAccount[acc];
        const acCancs = cancsByAccount[acc];

        // ── ACCOUNT HEADING ──
        ws.mergeCells(row, 1, row, 10);
        v(ws, row, 1, `  ${label.toUpperCase()}`);
        s(ws, row, 1, { bg: acColor, font: COLORS.accountFont, bold: true, size: 16, border: medBorder, hAlign: 'left' });
        ws.getRow(row).height = 38;
        row += 2;

        // ── Group items ──
        const groups: Record<string, PaymentItemForExport[]> = {};
        acItems.forEach(item => {
            if (!groups[item.groupLabel]) groups[item.groupLabel] = [];
            groups[item.groupLabel].push(item);
        });

        const paymentRows: { name: string; group: string; amount: number }[] = [];
        groupOrder.forEach(gl => {
            const gi = groups[gl];
            if (!gi || gi.length === 0) return;
            gi.forEach(item => paymentRows.push({ name: item.name, group: gl, amount: item.amount }));
        });

        const cancRows = acCancs.map(c => ({ name: c.name, paid: c.paidAmount, refund: c.refundAmount, retained: c.retainedAmount }));
        const maxDataRows = Math.max(paymentRows.length, cancRows.length, 1);

        // ── PAYMENTS TABLE TITLE ──
        ws.mergeCells(row, 1, row, 4);
        v(ws, row, 1, 'PAYMENTS RECEIVED');
        s(ws, row, 1, { bg: acColor, font: COLORS.accountFont, bold: true, size: 12, border: medBorder, hAlign: 'center' });

        ws.mergeCells(row, 6, row, 10);
        v(ws, row, 6, 'CANCELLATIONS');
        s(ws, row, 6, { bg: acColor, font: COLORS.accountFont, bold: true, size: 12, border: medBorder, hAlign: 'center' });
        ws.getRow(row).height = 26;
        row++;

        // Sub-headers
        ['S.No', 'Member Name', 'Group', 'Amount'].forEach((h, i) => {
            v(ws, row, i + 1, h);
            s(ws, row, i + 1, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 10 });
        });
        ['S.No', 'Member Name', 'Paid Amount', 'Refund Amount', 'Retained Amount'].forEach((h, i) => {
            v(ws, row, i + 6, h);
            s(ws, row, i + 6, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 10 });
        });
        row++;

        const dataStartRow = row;

        for (let i = 0; i < maxDataRows; i++) {
            const bg = i % 2 === 0 ? COLORS.white : COLORS.altRowBg;

            // Payment columns (A-D)
            if (i < paymentRows.length) {
                const p = paymentRows[i];
                v(ws, row, 1, i + 1); v(ws, row, 2, p.name); v(ws, row, 3, p.group); v(ws, row, 4, p.amount);
            } else {
                v(ws, row, 1, ''); v(ws, row, 2, ''); v(ws, row, 3, ''); v(ws, row, 4, '');
            }
            s(ws, row, 1, { bg, hAlign: 'center', border: thinBorder, size: 10 });
            s(ws, row, 2, { bg, border: thinBorder, size: 10 });
            s(ws, row, 3, { bg, border: thinBorder, size: 10, font: COLORS.mutedText, italic: true });
            s(ws, row, 4, { bg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 10 });

            // Spacer E
            ws.getCell(row, 5).border = {};

            // Cancellation columns (F-J)
            if (i < cancRows.length) {
                const c = cancRows[i];
                v(ws, row, 6, i + 1); v(ws, row, 7, c.name); v(ws, row, 8, c.paid); v(ws, row, 9, c.refund); v(ws, row, 10, c.retained);
            } else {
                v(ws, row, 6, ''); v(ws, row, 7, ''); v(ws, row, 8, ''); v(ws, row, 9, ''); v(ws, row, 10, '');
            }
            s(ws, row, 6, { bg, hAlign: 'center', border: thinBorder, size: 10 });
            s(ws, row, 7, { bg, border: thinBorder, size: 10 });
            for (let c = 8; c <= 10; c++) s(ws, row, c, { bg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 10 });

            row++;
        }

        const dataEndRow = row - 1;

        // ── TOTAL ROW with SUM formulas ──
        v(ws, row, 1, ''); v(ws, row, 2, ''); v(ws, row, 3, 'TOTAL');
        ws.getCell(row, 4).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})` };
        for (let c = 1; c <= 4; c++) s(ws, row, c, { bg: COLORS.totalRowBg, font: COLORS.totalRowFont, bold: true, border: medBorder, hAlign: c === 4 ? 'right' : (c === 3 ? 'right' : 'center'), numFmt: c === 4 ? INR_FMT : undefined, size: 11 });

        ws.getCell(row, 5).border = {};

        v(ws, row, 6, ''); v(ws, row, 7, 'TOTAL');
        ws.getCell(row, 8).value = { formula: `SUM(H${dataStartRow}:H${dataEndRow})` };
        ws.getCell(row, 9).value = { formula: `SUM(I${dataStartRow}:I${dataEndRow})` };
        ws.getCell(row, 10).value = { formula: `SUM(J${dataStartRow}:J${dataEndRow})` };
        for (let c = 6; c <= 10; c++) s(ws, row, c, { bg: COLORS.totalRowBg, font: COLORS.totalRowFont, bold: true, border: medBorder, hAlign: c >= 8 ? 'right' : (c === 7 ? 'right' : 'center'), numFmt: c >= 8 ? INR_FMT : undefined, size: 11 });

        const paymentTotalRow = row;
        const cancTotalRow = row;
        row += 2;

        // ══════════════════════════════════════════════════════════════
        // EXPENSES (left A-D)  +  TRAIN CHARGES (right F-J)
        // as proper Excel Tables so user can insert rows
        // ══════════════════════════════════════════════════════════════

        // ── EXPENSES TITLE ──
        ws.mergeCells(row, 1, row, 4);
        v(ws, row, 1, `EXPENSES — ${label}`);
        s(ws, row, 1, { bg: COLORS.expenseHeaderBg, font: COLORS.expenseHeaderFont, bold: true, size: 12, border: medBorder, hAlign: 'center' });

        ws.mergeCells(row, 6, row, 10);
        v(ws, row, 6, `TRAIN CANCELLATION CHARGES`);
        s(ws, row, 6, { bg: COLORS.trainHeaderBg, font: COLORS.trainHeaderFont, bold: true, size: 12, border: medBorder, hAlign: 'center' });
        ws.getRow(row).height = 28;
        row++;

        // -- Expense Excel Table --
        const EXPENSE_ROWS = 15;
        const expTableName = `Expenses_${acc}_${++tableCounter}`;
        const expTableRef = `A${row}`;
        const expenseTableRows: any[][] = [];
        for (let i = 0; i < EXPENSE_ROWS; i++) {
            expenseTableRows.push([i + 1, '', null]);
        }
        ws.addTable({
            name: expTableName,
            ref: expTableRef,
            headerRow: true,
            totalsRow: true,
            style: { theme: 'TableStyleLight9', showRowStripes: true },
            columns: [
                { name: 'S.No', totalsRowLabel: '', filterButton: false },
                { name: 'Expense Label', totalsRowLabel: 'TOTAL', filterButton: false },
                { name: 'Amount', totalsRowFunction: 'sum', filterButton: false },
            ],
            rows: expenseTableRows,
        });

        // Style expense table header
        s(ws, row, 1, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 10 });
        s(ws, row, 2, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 10 });
        s(ws, row, 3, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 10 });

        // -- Train Charges Excel Table --
        const trainTableName = `TrainCharges_${acc}_${tableCounter}`;
        const trainTableRef = `F${row}`;
        const trainTableRows: any[][] = [];
        for (let i = 0; i < EXPENSE_ROWS; i++) {
            trainTableRows.push([i + 1, '', null, '', '']);
        }
        ws.addTable({
            name: trainTableName,
            ref: trainTableRef,
            headerRow: true,
            totalsRow: true,
            style: { theme: 'TableStyleLight9', showRowStripes: true },
            columns: [
                { name: 'S.No', totalsRowLabel: '', filterButton: false },
                { name: 'Member / Description', totalsRowLabel: '', filterButton: false },
                { name: 'Charges', totalsRowFunction: 'sum', filterButton: false },
                { name: 'Refund UTR', totalsRowLabel: '', filterButton: false },
                { name: 'Remarks', totalsRowLabel: 'TOTAL', filterButton: false },
            ],
            rows: trainTableRows,
        });

        // Style train table header
        for (let c = 6; c <= 10; c++) {
            s(ws, row, c, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 10 });
        }

        // The expense total row is at: header (1) + data rows + totals = row + EXPENSE_ROWS
        const expenseTotalRow = row + EXPENSE_ROWS + 1; // +1 for header row offset
        const trainTotalRow = expenseTotalRow; // Same row since both tables have same # of rows

        // Style the data rows of both tables
        for (let i = 1; i <= EXPENSE_ROWS; i++) {
            const r = row + i;
            s(ws, r, 1, { hAlign: 'center', border: thinBorder, size: 10 });
            s(ws, r, 2, { border: thinBorder, size: 10 });
            s(ws, r, 3, { hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 10 });
            ws.getCell(r, 5).border = {};
            s(ws, r, 6, { hAlign: 'center', border: thinBorder, size: 10 });
            s(ws, r, 7, { border: thinBorder, size: 10 });
            s(ws, r, 8, { hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 10 });
            s(ws, r, 9, { border: thinBorder, size: 10 });
            s(ws, r, 10, { border: thinBorder, size: 10 });
        }

        // Style totals row for both tables
        for (let c = 1; c <= 3; c++) {
            s(ws, expenseTotalRow, c, { bg: COLORS.totalRowBg, font: COLORS.totalRowFont, bold: true, border: medBorder, hAlign: c === 3 ? 'right' : (c === 2 ? 'right' : 'center'), numFmt: c === 3 ? INR_FMT : undefined, size: 11 });
        }
        ws.getCell(expenseTotalRow, 5).border = {};
        for (let c = 6; c <= 10; c++) {
            s(ws, trainTotalRow, c, { bg: COLORS.totalRowBg, font: COLORS.totalRowFont, bold: true, border: medBorder, hAlign: c === 8 ? 'right' : 'center', numFmt: c === 8 ? INR_FMT : undefined, size: 11 });
        }

        row = expenseTotalRow + 2;

        // ══════════════════════════════════════════════════════════════
        // CALCULATION BLOCK — clean vertical table, no confusing +/-/=
        // ══════════════════════════════════════════════════════════════

        // Spans cols A-D (4 cols wide)
        ws.mergeCells(row, 1, row, 4);
        v(ws, row, 1, `BALANCE — ${label}`);
        s(ws, row, 1, { bg: COLORS.calcHeaderBg, font: COLORS.calcHeaderFont, bold: true, size: 13, border: medBorder, hAlign: 'center' });
        ws.getRow(row).height = 30;
        row++;

        // Header row
        ws.mergeCells(row, 1, row, 3);
        v(ws, row, 1, 'Description');
        v(ws, row, 4, 'Amount');
        s(ws, row, 1, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 11 });
        s(ws, row, 4, { bg: COLORS.subHeaderBg, font: COLORS.tableHeaderFont, bold: true, border: medBorder, hAlign: 'center', size: 11 });
        row++;

        // Row 1: Amount Received
        ws.mergeCells(row, 1, row, 3);
        v(ws, row, 1, 'Amount Received');
        ws.getCell(row, 4).value = { formula: `D${paymentTotalRow}` };
        s(ws, row, 1, { bg: COLORS.white, bold: true, border: thinBorder, size: 11 });
        s(ws, row, 4, { bg: COLORS.white, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 11 });
        const calcReceivedRow = row;
        row++;

        // Row 2: (+) Retained Amount
        ws.mergeCells(row, 1, row, 3);
        v(ws, row, 1, '(+) Retained Amount from Cancellations');
        ws.getCell(row, 4).value = { formula: `J${cancTotalRow}` };
        s(ws, row, 1, { bg: COLORS.altRowBg, border: thinBorder, size: 11 });
        s(ws, row, 4, { bg: COLORS.altRowBg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 11 });
        const calcRetainedRow = row;
        row++;

        // Row 3: (-) Total Expenses
        ws.mergeCells(row, 1, row, 3);
        v(ws, row, 1, '(-) Total Expenses');
        // Reference the SUBTOTAL in the expense table's total row
        ws.getCell(row, 4).value = { formula: `C${expenseTotalRow}` };
        s(ws, row, 1, { bg: COLORS.white, border: thinBorder, size: 11 });
        s(ws, row, 4, { bg: COLORS.white, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 11, font: 'DC2626' });
        const calcExpensesRow = row;
        row++;

        // Row 4: (-) Train Cancellation Charges
        ws.mergeCells(row, 1, row, 3);
        v(ws, row, 1, '(-) Train Cancellation Charges');
        ws.getCell(row, 4).value = { formula: `H${trainTotalRow}` };
        s(ws, row, 1, { bg: COLORS.altRowBg, border: thinBorder, size: 11 });
        s(ws, row, 4, { bg: COLORS.altRowBg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 11, font: 'DC2626' });
        const calcTrainRow = row;
        row++;

        // Row 5: BALANCE = Received + Retained - Expenses - Train
        ws.mergeCells(row, 1, row, 3);
        v(ws, row, 1, 'NET BALANCE');
        ws.getCell(row, 4).value = { formula: `D${calcReceivedRow}+D${calcRetainedRow}-D${calcExpensesRow}-D${calcTrainRow}` };
        s(ws, row, 1, { bg: COLORS.calcBalanceBg, font: COLORS.calcBalanceFont, bold: true, border: medBorder, size: 13 });
        s(ws, row, 4, { bg: COLORS.calcBalanceBg, font: COLORS.calcBalanceFont, bold: true, border: medBorder, hAlign: 'right', numFmt: INR_FMT, size: 14 });
        ws.getRow(row).height = 32;

        row += 4;
    });

    // ─── Print Settings ─────────────────────────────────────────────
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.orientation = 'landscape';

    // ─── Save ───────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${yatraName.replace(/\s+/g, '_')}_Detailed_Payments.xlsx`);
}
