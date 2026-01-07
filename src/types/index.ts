export interface YatraConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
}

export interface YatraDefinition {
    id: string; // Document ID (or 'master_puri')
    name: string;
    config: YatraConfig;
    bgImage?: string;
    isMaster?: boolean;
    fieldConfig?: FieldConfig; // Dynamic field configuration
    policy?: RefundPolicyRule[];
}

export interface RefundPolicyRule {
    date: string; // YYYY-MM-DD
    refund: number; // Percentage (0-100)
}

export interface FieldConfig {
    columns?: GridColumn[];
}

export interface GridColumn {
    key: string; // JSON path (e.g. "paymentDetails.amountPaid" or "members.0.name")
    label: string;
    type?: 'text' | 'currency' | 'date' | 'status' | 'badge' | 'progress' | 'actions';
}

// --- Registration Data Shapes ---

export interface Member {
    name: string;
    age: string | number;
    gender: string;
    // Dynamic fields
    packageName?: string;
    packagePrice?: number;
    roomNumber?: string;
    // Any other fields
    [key: string]: any;
}

export interface Installment {
    name: string;
    amount: number;
    dueDate: string;
    status: 'pending' | 'paid' | 'verification_pending';
}

export interface PaymentDetails {
    paymentType: 'full' | 'installment';
    amountPaid: number;
    totalAmount: number;
    utrNumber?: string;
    paymentProofUrl?: string;
    paymentStatus: 'verified' | 'pending' | 'verification_pending' | 'partial_payment' | 'no_payment';
    installments?: Installment[];
}

export interface Registration {
    id: string;
    name: string; // Primary Contact Name
    phone: string;
    email?: string;
    whatsapp?: string;
    address?: string;

    // Members
    members: Member[];

    // Computed/Root fields (Puri Style)
    totalAmount: number;
    utr?: string;
    paymentStatus: string; // 'verified' | 'pending_verification' | ...
    joinedWhatsapp?: 'yes' | 'no';

    // Complex/Dynamic fields (Hampi Style)
    paymentDetails?: PaymentDetails;

    submittedAt?: any; // Firestore Timestamp
    remarks?: string;

    // Metadata
    familyId?: string;
    screenshotUrl?: string;
}

export interface Cancellation {
    id: string;
    originalRegistrationId: string;
    name: string;
    phone: string;
    cancelledMembers: Member[];
    refundAmount: number;
    refundStatus: 'pending' | 'completed';
    refundUtr?: string;
    cancelledAt: any;
    remarks?: string;
    originalData?: Registration; // Snapshot of the original registration data at the time of cancellation
    refundPercentageApplied?: number;
}
