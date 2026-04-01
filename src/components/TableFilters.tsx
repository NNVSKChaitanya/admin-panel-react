import { useState } from 'react';
import { Plus, X, Filter, ChevronDown } from 'lucide-react';
import type { Registration } from '../types';

// ─── Filter Rule Model ──────────────────────────────────────────────────────

export interface FilterRule {
    id: string;
    field: string;
    operator: string;
    value: string;
}

interface FieldDef {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    /** For 'select' type, the list of options */
    options?: string[];
    /** How to extract the value from a registration for comparison */
    getValue: (item: any) => any;
    /** For member-level fields: returns array of values from all members */
    isMemberField?: boolean;
}

// ─── Available Fields ───────────────────────────────────────────────────────

const REG_FIELDS: FieldDef[] = [
    { key: 'name', label: 'Primary Contact', type: 'text', getValue: (r: Registration) => r.name || '' },
    { key: 'phone', label: 'Phone', type: 'text', getValue: (r: Registration) => r.phone || '' },
    { key: 'email', label: 'Email', type: 'text', getValue: (r: Registration) => r.email || '' },
    { key: 'address', label: 'Address', type: 'text', getValue: (r: Registration) => r.address || '' },
    {
        key: 'memberName', label: 'Member Name', type: 'text', isMemberField: true,
        getValue: (r: Registration) => r.members?.map(m => m.name || '') || [],
    },
    {
        key: 'memberAge', label: 'Member Age', type: 'number', isMemberField: true,
        getValue: (r: Registration) => r.members?.map(m => parseInt(String(m.age), 10) || 0) || [],
    },
    {
        key: 'memberGender', label: 'Gender', type: 'select', isMemberField: true,
        options: ['Male', 'Female'],
        getValue: (r: Registration) => r.members?.map(m => m.gender || '') || [],
    },
    {
        key: 'memberPackage', label: 'Package', type: 'text', isMemberField: true,
        getValue: (r: Registration) => r.members?.map(m => m.packageName || '') || [],
    },
    {
        key: 'memberPackagePrice', label: 'Package Price', type: 'number', isMemberField: true,
        getValue: (r: Registration) => r.members?.map(m => m.packagePrice || 0) || [],
    },
    {
        key: 'isTwoSharing', label: '2-Sharing', type: 'select', isMemberField: true,
        options: ['Yes', 'No'],
        getValue: (r: Registration) => r.members?.map(m => m.isTwoSharing ? 'Yes' : 'No') || [],
    },
    {
        key: 'isManagement', label: 'Management', type: 'select', isMemberField: true,
        options: ['Yes', 'No'],
        getValue: (r: Registration) => r.members?.map(m => m.isManagement ? 'Yes' : 'No') || [],
    },
    {
        key: 'roomNumber', label: 'Room Number', type: 'text', isMemberField: true,
        getValue: (r: Registration) => r.members?.map(m => m.roomNumber || '') || [],
    },
    { key: 'totalAmount', label: 'Total Amount', type: 'number', getValue: (r: Registration) => r.totalAmount || r.paymentDetails?.totalAmount || 0 },
    { key: 'amountPaid', label: 'Amount Paid', type: 'number', getValue: (r: Registration) => r.paymentDetails?.amountPaid || r.totalAmount || 0 },
    { key: 'memberCount', label: 'No. of Members', type: 'number', getValue: (r: Registration) => r.members?.length || 0 },
    { key: 'utr', label: 'UTR/ID', type: 'text', getValue: (r: Registration) => r.utr || r.paymentDetails?.utrNumber || '' },
    { key: 'remarks', label: 'Remarks', type: 'text', getValue: (r: Registration) => r.remarks || '' },
    {
        key: 'joinedWhatsapp', label: 'Joined WhatsApp', type: 'select',
        options: ['Yes', 'No'],
        getValue: (r: Registration) => {
            const raw = r.joinedWhatsapp;
            return String(raw).toLowerCase() === 'yes' ? 'Yes' : 'No';
        },
    },
];

const OPERATORS: Record<string, { key: string; label: string }[]> = {
    text: [
        { key: 'contains', label: 'Contains' },
        { key: 'not_contains', label: 'Does not contain' },
        { key: 'equals', label: 'Equals' },
        { key: 'not_equals', label: 'Not equals' },
        { key: 'starts_with', label: 'Starts with' },
        { key: 'is_empty', label: 'Is empty' },
        { key: 'is_not_empty', label: 'Is not empty' },
    ],
    number: [
        { key: 'equals', label: '=' },
        { key: 'not_equals', label: '≠' },
        { key: 'gt', label: '>' },
        { key: 'gte', label: '≥' },
        { key: 'lt', label: '<' },
        { key: 'lte', label: '≤' },
    ],
    select: [
        { key: 'equals', label: 'Is' },
        { key: 'not_equals', label: 'Is not' },
    ],
};

// ─── Filter Matching Logic ──────────────────────────────────────────────────

function matchValue(actual: any, operator: string, filterValue: string, fieldType: string): boolean {
    if (operator === 'is_empty') return !actual || String(actual).trim() === '';
    if (operator === 'is_not_empty') return !!actual && String(actual).trim() !== '';

    if (fieldType === 'number') {
        const numActual = parseFloat(String(actual)) || 0;
        const numFilter = parseFloat(filterValue) || 0;
        switch (operator) {
            case 'equals': return numActual === numFilter;
            case 'not_equals': return numActual !== numFilter;
            case 'gt': return numActual > numFilter;
            case 'gte': return numActual >= numFilter;
            case 'lt': return numActual < numFilter;
            case 'lte': return numActual <= numFilter;
            default: return true;
        }
    }

    const strActual = String(actual || '').toLowerCase();
    const strFilter = String(filterValue || '').toLowerCase();

    switch (operator) {
        case 'contains': return strActual.includes(strFilter);
        case 'not_contains': return !strActual.includes(strFilter);
        case 'equals': return strActual === strFilter;
        case 'not_equals': return strActual !== strFilter;
        case 'starts_with': return strActual.startsWith(strFilter);
        default: return true;
    }
}

/** Apply all filter rules to a registration. Returns true if it passes all filters. */
export function applyFilters(item: any, rules: FilterRule[]): boolean {
    if (rules.length === 0) return true;

    return rules.every(rule => {
        const fieldDef = REG_FIELDS.find(f => f.key === rule.field);
        if (!fieldDef) return true;
        if (!rule.value && rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty') return true;

        const rawValue = fieldDef.getValue(item);

        // For member-level fields, match if ANY member matches
        if (fieldDef.isMemberField && Array.isArray(rawValue)) {
            return rawValue.some(val => matchValue(val, rule.operator, rule.value, fieldDef.type));
        }

        return matchValue(rawValue, rule.operator, rule.value, fieldDef.type);
    });
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
    rules: FilterRule[];
    onChange: (rules: FilterRule[]) => void;
}

export const TableFilters = ({ rules, onChange }: Props) => {
    const [isExpanded, setIsExpanded] = useState(rules.length > 0);

    const addRule = () => {
        const newRule: FilterRule = {
            id: Date.now().toString(),
            field: REG_FIELDS[0].key,
            operator: 'contains',
            value: '',
        };
        onChange([...rules, newRule]);
        setIsExpanded(true);
    };

    const updateRule = (id: string, updates: Partial<FilterRule>) => {
        onChange(rules.map(r => {
            if (r.id !== id) return r;
            const updated = { ...r, ...updates };
            // Reset operator when field type changes
            if (updates.field) {
                const newFieldDef = REG_FIELDS.find(f => f.key === updates.field);
                const ops = OPERATORS[newFieldDef?.type || 'text'];
                if (!ops.find(o => o.key === updated.operator)) {
                    updated.operator = ops[0].key;
                }
                updated.value = '';
            }
            return updated;
        }));
    };

    const removeRule = (id: string) => {
        const next = rules.filter(r => r.id !== id);
        onChange(next);
        if (next.length === 0) setIsExpanded(false);
    };

    const clearAll = () => {
        onChange([]);
        setIsExpanded(false);
    };

    return (
        <div className="w-full">
            {/* Toggle bar */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => rules.length > 0 ? setIsExpanded(!isExpanded) : addRule()}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                        rules.length > 0
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20'
                            : 'bg-black/20 text-gray-400 border-white/10 hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Filter className="w-4 h-4" />
                    {rules.length > 0 ? `${rules.length} Filter${rules.length > 1 ? 's' : ''} Active` : 'Add Filter'}
                    {rules.length > 0 && <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                </button>

                {rules.length > 0 && (
                    <button
                        onClick={clearAll}
                        className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-2 py-1"
                    >
                        Clear all
                    </button>
                )}
            </div>

            {/* Filter rules panel */}
            {isExpanded && (
                <div className="mt-3 space-y-2 p-3 rounded-xl bg-black/20 border border-white/5 animate-fade-in">
                    {rules.map((rule, idx) => {
                        const fieldDef = REG_FIELDS.find(f => f.key === rule.field);
                        const fieldType = fieldDef?.type || 'text';
                        const ops = OPERATORS[fieldType] || OPERATORS.text;
                        const needsValue = rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty';

                        return (
                            <div key={rule.id} className="flex items-center gap-2 flex-wrap">
                                {idx > 0 && (
                                    <span className="text-xs text-purple-400/60 font-medium uppercase tracking-wider w-10 text-center">AND</span>
                                )}
                                {idx === 0 && <span className="w-10" />}

                                {/* Field selector */}
                                <select
                                    value={rule.field}
                                    onChange={e => updateRule(rule.id, { field: e.target.value })}
                                    className="px-3 py-1.5 bg-gray-800/80 border border-white/10 rounded-lg text-sm text-gray-200 outline-none focus:ring-2 focus:ring-purple-500/40 appearance-none cursor-pointer min-w-[140px]"
                                >
                                    {REG_FIELDS.map(f => (
                                        <option key={f.key} value={f.key}>{f.label}</option>
                                    ))}
                                </select>

                                {/* Operator selector */}
                                <select
                                    value={rule.operator}
                                    onChange={e => updateRule(rule.id, { operator: e.target.value })}
                                    className="px-3 py-1.5 bg-gray-800/80 border border-white/10 rounded-lg text-sm text-gray-200 outline-none focus:ring-2 focus:ring-purple-500/40 appearance-none cursor-pointer min-w-[120px]"
                                >
                                    {ops.map(o => (
                                        <option key={o.key} value={o.key}>{o.label}</option>
                                    ))}
                                </select>

                                {/* Value input */}
                                {needsValue && (
                                    fieldDef?.type === 'select' && fieldDef.options ? (
                                        <select
                                            value={rule.value}
                                            onChange={e => updateRule(rule.id, { value: e.target.value })}
                                            className="px-3 py-1.5 bg-gray-800/80 border border-white/10 rounded-lg text-sm text-gray-200 outline-none focus:ring-2 focus:ring-purple-500/40 appearance-none cursor-pointer min-w-[100px]"
                                        >
                                            <option value="">-- Select --</option>
                                            {fieldDef.options.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            type={fieldDef?.type === 'number' ? 'number' : 'text'}
                                            value={rule.value}
                                            onChange={e => updateRule(rule.id, { value: e.target.value })}
                                            placeholder={fieldDef?.type === 'number' ? '0' : 'value...'}
                                            className="px-3 py-1.5 bg-gray-800/80 border border-white/10 rounded-lg text-sm text-white placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-purple-500/40 w-36"
                                        />
                                    )
                                )}

                                {/* Remove */}
                                <button
                                    onClick={() => removeRule(rule.id)}
                                    className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}

                    {/* Add another filter */}
                    <button
                        onClick={addRule}
                        className="flex items-center gap-1.5 text-xs text-purple-400/70 hover:text-purple-300 transition-colors mt-1 ml-10"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Add another filter
                    </button>
                </div>
            )}
        </div>
    );
};
