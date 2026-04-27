import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Registration, Cancellation } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

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
    narayanaBg: '0369A1',
    cashBg: '047857',
    accountFont: 'FFFFFF',

    tableHeaderBg: '374151',
    tableHeaderFont: 'F9FAFB',

    totalRowBg: 'FEF3C7',
    totalRowFont: '92400E',

    grandTotalBg: '065F46',
    grandTotalFont: 'FFFFFF',

    groupHeaderBg: 'E8EAED',
    groupHeaderFont: '374151',

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

// ─── Account Resolution ────────────────────────────────────────────────────

type Account = 'chaitanya' | 'narayana' | 'cash' | 'unassigned';

/**
 * Determines the account for a given installment index within a registration.
 * Uses the same logic as PaymentTracking.
 */
function getInstallmentAccount(reg: Registration, instIdx: number): Account {
    const installments = reg.paymentDetails?.installments;
    if (!installments || !installments[instIdx]) return 'unassigned';

    const inst = installments[instIdx];

    if (inst.assignedTo) return inst.assignedTo;

    if (instIdx === 0) {
        const utr = ((inst as any).utrNumber || reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
        if (utr.includes('cash')) return 'cash';
        if (reg.remarks?.toLowerCase().includes('chaitanya')) return 'chaitanya';
        if (reg.remarks?.toLowerCase().includes('narayana')) return 'narayana';
    }

    return 'unassigned';
}

/**
 * Determines the account for a full payment (non-installment) registration.
 */
function getFullPaymentAccount(reg: Registration): Account {
    if (reg.paymentDetails?.assignedTo) return reg.paymentDetails.assignedTo;
    const utr = (reg.paymentDetails?.utrNumber || reg.utr || '').toLowerCase();
    if (utr.includes('cash')) return 'cash';
    if (reg.remarks?.toLowerCase().includes('chaitanya')) return 'chaitanya';
    if (reg.remarks?.toLowerCase().includes('narayana')) return 'narayana';
    return 'unassigned';
}

// ─── Data Structures ────────────────────────────────────────────────────────

interface MemberRow {
    memberName: string;
    inst1Amount: number | null;  // null = unassigned / not applicable
    inst2Amount: number | null;
    inst3Amount: number | null;
}

interface RegistrationGroup {
    regName: string;        // Primary contact name
    regPhone: string;       // Primary contact phone
    members: MemberRow[];
}

/**
 * Builds member rows grouped by registration.
 *
 * Key rules:
 * - Only includes active registrations (status !== 'cancelled')
 * - Members already reflect partial cancellations (cancelled members are removed from reg.members)
 * - An installment amount is shown only if it's assigned to an actual account (chaitanya/narayana/cash)
 * - If it's in "unassigned", the cell is left empty
 */
function buildRegistrationGroups(registrations: Registration[]): RegistrationGroup[] {
    const groups: RegistrationGroup[] = [];

    // Only active registrations with at least one member
    const activeRegs = registrations.filter(r => r.status !== 'cancelled' && r.members?.length > 0);

    activeRegs.forEach(reg => {
        const hasInstallments = (reg.paymentDetails?.installments?.length || 0) > 0;
        const group: RegistrationGroup = {
            regName: reg.name || '',
            regPhone: reg.phone || reg.whatsapp || '',
            members: [],
        };

        reg.members.forEach((member, memberIdx) => {
            const row: MemberRow = {
                memberName: member.name || '',
                inst1Amount: null,
                inst2Amount: null,
                inst3Amount: null,
            };

            if (hasInstallments) {
                const installments = reg.paymentDetails!.installments!;
                // Filter out 2-sharing premium installments from the 3-column view
                const regularInstallments = installments.filter(i => i.name !== '2 Sharing Premium');

                regularInstallments.forEach((inst, colIdx) => {
                    if (colIdx > 2) return; // Only first 3 installments

                    // Find the original index in the installments array for account resolution
                    const origIdx = installments.indexOf(inst);
                    const baseAccount = getInstallmentAccount(reg, origIdx);

                    // Check for member-level assignment override
                    const memberAssignment = (inst as any).memberAssignments?.[memberIdx];
                    const effectiveAccount: Account = (memberAssignment !== undefined && memberAssignment !== null)
                        ? memberAssignment
                        : baseAccount;

                    // Calculate per-member amount for this installment
                    const memberAmount = (inst.amount || 0) / (reg.members.length || 1);

                    // Only show if assigned to a real account (verified)
                    const isVerified = effectiveAccount !== 'unassigned';

                    if (colIdx === 0) row.inst1Amount = isVerified ? memberAmount : null;
                    else if (colIdx === 1) row.inst2Amount = isVerified ? memberAmount : null;
                    else if (colIdx === 2) row.inst3Amount = isVerified ? memberAmount : null;
                });
            } else {
                // Full payment — treat as a single installment in column 1
                const account = getFullPaymentAccount(reg);
                const isVerified = account !== 'unassigned';
                const amount = reg.paymentDetails?.amountPaid || reg.totalAmount || 0;
                const memberAmount = member.packagePrice || (amount / (reg.members.length || 1));

                row.inst1Amount = isVerified ? memberAmount : null;
            }

            group.members.push(row);
        });

        if (group.members.length > 0) {
            groups.push(group);
        }
    });

    return groups;
}

// ─── Main Export ────────────────────────────────────────────────────────────

export async function exportSimpleAccountsExcel(
    registrations: Registration[],
    cancellations: Cancellation[],
    config: ExportConfig = {}
) {
    const { yatraName = 'Yatra' } = config;

    const groups = buildRegistrationGroups(registrations);

    // Flatten for summary calculations
    const allMemberRows = groups.flatMap(g => g.members);

    // ── Compute summary totals per account ──
    // We need to re-derive account info for the summary. We'll compute from groups.
    const accounts = ['chaitanya', 'narayana', 'cash'] as const;
    const accountLabels: Record<string, string> = {
        chaitanya: 'Chaitanya (Online)',
        narayana: 'Narayana (Online)',
        cash: 'Cash / Spot',
    };
    const accountColors: Record<string, string> = {
        chaitanya: COLORS.chaitanyaBg,
        narayana: COLORS.narayanaBg,
        cash: COLORS.cashBg,
    };

    // For the summary, we need per-account per-installment totals.
    // Re-traverse registrations to compute these accurately.
    const instTotals: Record<string, [number, number, number]> = {};
    accounts.forEach(a => { instTotals[a] = [0, 0, 0]; });
    instTotals['unassigned'] = [0, 0, 0];

    const activeRegs = registrations.filter(r => r.status !== 'cancelled' && r.members?.length > 0);
    activeRegs.forEach(reg => {
        const hasInstallments = (reg.paymentDetails?.installments?.length || 0) > 0;

        if (hasInstallments) {
            const installments = reg.paymentDetails!.installments!;
            const regularInstallments = installments.filter(i => i.name !== '2 Sharing Premium');

            regularInstallments.forEach((inst, colIdx) => {
                if (colIdx > 2) return;
                const origIdx = installments.indexOf(inst);
                const baseAccount = getInstallmentAccount(reg, origIdx);

                // Check if members have differing assignments
                const memberAssignments = reg.members.map((_, mi) => {
                    const ma = (inst as any).memberAssignments?.[mi];
                    return (ma !== undefined && ma !== null) ? ma : baseAccount;
                });
                const allSame = memberAssignments.every(a => a === memberAssignments[0]);

                if (allSame) {
                    instTotals[memberAssignments[0] || baseAccount][colIdx] += inst.amount || 0;
                } else {
                    reg.members.forEach((_, mi) => {
                        const mAmount = (inst.amount || 0) / (reg.members.length || 1);
                        instTotals[memberAssignments[mi] || baseAccount][colIdx] += mAmount;
                    });
                }
            });
        } else {
            const account = getFullPaymentAccount(reg);
            const amount = reg.paymentDetails?.amountPaid || reg.totalAmount || 0;
            instTotals[account][0] += amount;
        }
    });

    const accountTotals: Record<string, number> = {};
    accounts.forEach(a => {
        accountTotals[a] = instTotals[a][0] + instTotals[a][1] + instTotals[a][2];
    });
    const overallTotal = accounts.reduce((sum, a) => sum + accountTotals[a], 0);

    const totalMembers = allMemberRows.length;
    const totalRegistrations = groups.length;

    // ─── Create Workbook ────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ISKCON Tenali Admin Panel';
    const ws = wb.addWorksheet('Accounts Summary', {
        views: [{ showGridLines: false }],
    });

    // Columns: S.No | Primary Contact | Phone | Member Name | Inst 1 | Inst 2 | Inst 3 | Total
    ws.columns = [
        { width: 7 },   // A: S.No
        { width: 24 },  // B: Primary Contact
        { width: 16 },  // C: Phone
        { width: 28 },  // D: Member Name
        { width: 16 },  // E: Installment 1
        { width: 16 },  // F: Installment 2
        { width: 16 },  // G: Installment 3
        { width: 16 },  // H: Total
    ];

    let row = 1;

    // ══════════════════════════════════════════════════════════════════
    // TITLE
    // ══════════════════════════════════════════════════════════════════

    ws.mergeCells(row, 1, row, 8);
    v(ws, row, 1, `${yatraName} — Accounts Summary`);
    s(ws, row, 1, { bg: COLORS.titleBg, font: COLORS.titleFont, bold: true, size: 16, border: medBorder, hAlign: 'center' });
    ws.getRow(row).height = 38;
    row++;

    ws.mergeCells(row, 1, row, 8);
    v(ws, row, 1, `Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
    s(ws, row, 1, { bg: COLORS.subtitleBg, font: COLORS.subtitleFont, size: 10, italic: true, hAlign: 'center', border: medBorder });
    row += 2;

    // ══════════════════════════════════════════════════════════════════
    // SUMMARY SECTION
    // ══════════════════════════════════════════════════════════════════

    ws.mergeCells(row, 1, row, 8);
    v(ws, row, 1, 'SUMMARY');
    s(ws, row, 1, { bg: COLORS.summaryHeaderBg, font: COLORS.summaryHeaderFont, bold: true, size: 14, border: medBorder, hAlign: 'center' });
    ws.getRow(row).height = 30;
    row++;

    // Summary headers
    const sumHeaders = ['#', 'Account', '', '', 'Installment 1', 'Installment 2', 'Installment 3', 'Total'];
    sumHeaders.forEach((h, i) => {
        v(ws, row, i + 1, h);
        s(ws, row, i + 1, { bg: COLORS.tableHeaderBg, font: COLORS.tableHeaderFont, bold: true, hAlign: 'center', border: medBorder, size: 10 });
    });
    // Merge the empty columns C-D for visual cleanliness in summary
    ws.mergeCells(row, 2, row, 4);
    v(ws, row, 2, 'Account');
    s(ws, row, 2, { bg: COLORS.tableHeaderBg, font: COLORS.tableHeaderFont, bold: true, hAlign: 'center', border: medBorder, size: 10 });
    row++;

    accounts.forEach((acc, idx) => {
        const bg = idx % 2 === 0 ? COLORS.white : COLORS.altRowBg;
        v(ws, row, 1, idx + 1);
        s(ws, row, 1, { bg, hAlign: 'center', border: thinBorder });

        ws.mergeCells(row, 2, row, 4);
        v(ws, row, 2, accountLabels[acc]);
        s(ws, row, 2, { bg, font: accountColors[acc], bold: true, border: thinBorder });

        v(ws, row, 5, instTotals[acc][0]);
        v(ws, row, 6, instTotals[acc][1]);
        v(ws, row, 7, instTotals[acc][2]);
        v(ws, row, 8, accountTotals[acc]);
        for (let c = 5; c <= 8; c++) s(ws, row, c, { bg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder });
        row++;
    });

    // Overall total row
    v(ws, row, 1, '');
    s(ws, row, 1, { bg: COLORS.grandTotalBg, font: COLORS.grandTotalFont, bold: true, border: medBorder, hAlign: 'center' });
    ws.mergeCells(row, 2, row, 4);
    v(ws, row, 2, 'OVERALL');
    s(ws, row, 2, { bg: COLORS.grandTotalBg, font: COLORS.grandTotalFont, bold: true, border: medBorder, hAlign: 'center', size: 12 });
    v(ws, row, 5, accounts.reduce((sum, a) => sum + instTotals[a][0], 0));
    v(ws, row, 6, accounts.reduce((sum, a) => sum + instTotals[a][1], 0));
    v(ws, row, 7, accounts.reduce((sum, a) => sum + instTotals[a][2], 0));
    v(ws, row, 8, overallTotal);
    for (let c = 5; c <= 8; c++) {
        s(ws, row, c, {
            bg: COLORS.grandTotalBg, font: COLORS.grandTotalFont, bold: true, border: medBorder,
            hAlign: 'right', numFmt: INR_FMT, size: 12,
        });
    }
    row++;

    // Quick stats row
    ws.mergeCells(row, 1, row, 8);
    v(ws, row, 1, `Total Registrations: ${totalRegistrations}  |  Total Members: ${totalMembers}  |  Cancellations: ${cancellations.length}`);
    s(ws, row, 1, { bg: COLORS.altRowBg, font: COLORS.mutedText, size: 10, italic: true, hAlign: 'center', border: thinBorder });
    row += 2;

    // ══════════════════════════════════════════════════════════════════
    // REGISTRATIONS TABLE (grouped by primary contact)
    // ══════════════════════════════════════════════════════════════════

    ws.mergeCells(row, 1, row, 8);
    v(ws, row, 1, 'REGISTRATIONS — MEMBER-WISE PAYMENTS');
    s(ws, row, 1, { bg: COLORS.summaryHeaderBg, font: COLORS.summaryHeaderFont, bold: true, size: 14, border: medBorder, hAlign: 'center' });
    ws.getRow(row).height = 30;
    row++;

    // Table headers
    const tableHeaders = ['S.No', 'Primary Contact', 'Phone', 'Member Name', 'Installment 1', 'Installment 2', 'Installment 3', 'Total'];
    tableHeaders.forEach((h, i) => {
        v(ws, row, i + 1, h);
        s(ws, row, i + 1, { bg: COLORS.tableHeaderBg, font: COLORS.tableHeaderFont, bold: true, hAlign: 'center', border: medBorder, size: 10 });
    });
    row++;

    const dataStartRow = row;
    let sNo = 0;

    // Data rows — grouped by registration with merged primary contact & phone cells
    groups.forEach(group => {
        const groupStartRow = row;
        const memberCount = group.members.length;

        group.members.forEach((mr, idx) => {
            sNo++;
            const bg = sNo % 2 === 0 ? COLORS.altRowBg : COLORS.white;
            const memberTotal = (mr.inst1Amount || 0) + (mr.inst2Amount || 0) + (mr.inst3Amount || 0);

            v(ws, row, 1, sNo);
            // Only write contact info on the first row of the group
            v(ws, row, 2, idx === 0 ? group.regName : '');
            v(ws, row, 3, idx === 0 ? group.regPhone : '');
            v(ws, row, 4, mr.memberName);
            v(ws, row, 5, mr.inst1Amount !== null ? mr.inst1Amount : '');
            v(ws, row, 6, mr.inst2Amount !== null ? mr.inst2Amount : '');
            v(ws, row, 7, mr.inst3Amount !== null ? mr.inst3Amount : '');
            v(ws, row, 8, memberTotal > 0 ? memberTotal : '');

            s(ws, row, 1, { bg, hAlign: 'center', border: thinBorder, size: 10 });
            s(ws, row, 2, { bg, border: thinBorder, size: 10, bold: idx === 0 });
            s(ws, row, 3, { bg, border: thinBorder, size: 10 });
            s(ws, row, 4, { bg, border: thinBorder, size: 10 });
            for (let c = 5; c <= 8; c++) {
                s(ws, row, c, { bg, hAlign: 'right', numFmt: INR_FMT, border: thinBorder, size: 10 });
            }

            row++;
        });

        // Merge primary contact & phone cells across members of same registration
        if (memberCount > 1) {
            ws.mergeCells(groupStartRow, 2, groupStartRow + memberCount - 1, 2);
            ws.mergeCells(groupStartRow, 3, groupStartRow + memberCount - 1, 3);
            // Vertical align merged cells
            ws.getCell(groupStartRow, 2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            ws.getCell(groupStartRow, 3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        }
    });

    const dataEndRow = row - 1;

    // Totals row with SUM formulas
    v(ws, row, 1, '');
    v(ws, row, 2, `TOTAL (${totalMembers} members)`);
    v(ws, row, 3, '');
    v(ws, row, 4, '');
    ws.getCell(row, 5).value = { formula: `SUM(E${dataStartRow}:E${dataEndRow})` };
    ws.getCell(row, 6).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})` };
    ws.getCell(row, 7).value = { formula: `SUM(G${dataStartRow}:G${dataEndRow})` };
    ws.getCell(row, 8).value = { formula: `SUM(H${dataStartRow}:H${dataEndRow})` };
    for (let c = 1; c <= 8; c++) {
        s(ws, row, c, {
            bg: COLORS.grandTotalBg, font: COLORS.grandTotalFont, bold: true, border: medBorder,
            hAlign: c >= 5 ? 'right' : (c === 2 ? 'left' : 'center'),
            numFmt: c >= 5 ? INR_FMT : undefined, size: 12,
        });
    }

    // ─── Print Settings ─────────────────────────────────────────────
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.orientation = 'portrait';

    // ─── Save ───────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${yatraName.replace(/\s+/g, '_')}_Accounts_Summary.xlsx`);
}
