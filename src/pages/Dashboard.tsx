import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegistrations } from '../hooks/useRegistrations';
import { useManagementTeam, useYatraManagementSelection } from '../hooks/useManagementTeam';
import { useAppStore } from '../store/useAppStore';
import {
    Users,
    CreditCard,
    Banknote,
    Wallet,
    // UserCheck,
    AlertCircle,
    Activity,
    Baby,
    PersonStanding
} from 'lucide-react';
import { cn } from '../lib/utils';

export const Dashboard = () => {
    const { currentYatra } = useAppStore();
    const { data: registrations = [], isLoading } = useRegistrations();
    const { members: globalMgmtMembers } = useManagementTeam();
    const { selectedIds: mgmtSelectedIds } = useYatraManagementSelection();
    const navigate = useNavigate();

    const mgmtCount = globalMgmtMembers.filter(m => mgmtSelectedIds.includes(m.id)).length;
    const mgmtMaleCount = globalMgmtMembers.filter(m => mgmtSelectedIds.includes(m.id) && ['male', 'm'].includes((m.gender || '').toLowerCase())).length;
    const mgmtFemaleCount = globalMgmtMembers.filter(m => mgmtSelectedIds.includes(m.id) && ['female', 'f'].includes((m.gender || '').toLowerCase())).length;

    // --- Stats Aggregation Logic ---
    const stats = useMemo(() => {
        let totalAmount = 0;
        let onlineAmount = 0;
        let onlineChaitanyaAmount = 0;
        let onlineNarayanaAmount = 0;
        let cashAmount = 0;
        let totalTravellers = 0;
        let totalRecords = registrations.length;
        let pendingRecords = 0;

        let singleTravellers = 0;
        let familyGroups = 0;
        let maleCount = 0;
        let femaleCount = 0;

        const twoSharingPerPerson = currentYatra?.config?.twoSharingAmount || 0;

        const familySizeCounts: Record<number, number> = {};
        const packageGenderCounts: Record<string, { male: number; female: number; total: number }> = {};
        const ageGroups: Record<string, number> = {
            '0-5': 0, '6-12': 0, '13-18': 0, '19-30': 0,
            '31-50': 0, '51-60': 0, '61-70': 0, '71+': 0
        };

        registrations.forEach(reg => {
            // 1. Finances
            // For yatras with installments (Hampi style), use amountPaid (actual collection).
            // For simple yatras (Puri style), use totalAmount (assumed full payment).
            const revenue = reg.paymentDetails ? (reg.paymentDetails.amountPaid || 0) : (reg.totalAmount || 0);

            totalAmount += revenue;

            // Online vs Cash Classification
            // Check UTR for "cash" string (case-insensitive) OR explicit assignment
            const utr = reg.utr || reg.paymentDetails?.utrNumber || '';
            const isCash = utr.toLowerCase().includes('cash') || reg.paymentDetails?.assignedTo === 'cash';

            if (isCash) {
                cashAmount += revenue;
            } else {
                onlineAmount += revenue;

                let assignedTo = '';

                // 1. Check direct assignment (New Logic)
                if (reg.paymentDetails?.assignedTo) {
                    assignedTo = reg.paymentDetails.assignedTo;
                }
                // 2. Check Installment assignments (if any)
                else if (reg.paymentDetails?.installments?.length) {
                    // Iterate and sum up assigned installments
                    reg.paymentDetails.installments.forEach((inst, idx) => {
                        const instAmount = inst.amount || 0;
                        if (inst.assignedTo === 'chaitanya') {
                            onlineChaitanyaAmount += instAmount;
                        } else if (inst.assignedTo === 'narayana') {
                            onlineNarayanaAmount += instAmount;
                        } else {
                            // Fallback to remarks ONLY for First Installment
                            if (idx === 0) {
                                const remarks = (reg.remarks || '').toLowerCase();
                                if (remarks.includes('chaitanya')) onlineChaitanyaAmount += instAmount;
                                else if (remarks.includes('narayana')) onlineNarayanaAmount += instAmount;
                            }
                            // Subsequent installments (idx > 0) are unassigned by default -> do not add to chaitanya/narayana
                        }
                    });

                    assignedTo = 'processed_via_installments';
                }
                else {
                    // Fallback to Remarks (Old Logic for Single Payments)
                    const remarks = (reg.remarks || '').toLowerCase();
                    if (remarks.includes('chaitanya')) assignedTo = 'chaitanya';
                    else if (remarks.includes('narayana')) assignedTo = 'narayana';
                }

                if (assignedTo === 'chaitanya') {
                    onlineChaitanyaAmount += revenue;
                } else if (assignedTo === 'narayana') {
                    onlineNarayanaAmount += revenue;
                }
            }

            // 2-Sharing Premium
            const hasTwoSharingMembers = reg.members?.some(m => m.isTwoSharing);
            if (hasTwoSharingMembers && twoSharingPerPerson > 0) {
                const twoSharingCount = reg.members!.filter(m => m.isTwoSharing).length;
                // Check if 2-sharing is already included as an installment
                const existingTwoSharingInstallment = reg.paymentDetails?.installments?.find(i => i.name === '2 Sharing Premium');
                if (!existingTwoSharingInstallment) {
                    const twoSharingFee = twoSharingCount * twoSharingPerPerson;
                    totalAmount += twoSharingFee;

                    const twoSharingAssigned = (reg.paymentDetails as any)?.twoSharingAssignedTo || '';
                    if (twoSharingAssigned === 'cash') {
                        cashAmount += twoSharingFee;
                    } else if (twoSharingAssigned === 'chaitanya') {
                        onlineAmount += twoSharingFee;
                        onlineChaitanyaAmount += twoSharingFee;
                    } else if (twoSharingAssigned === 'narayana') {
                        onlineAmount += twoSharingFee;
                        onlineNarayanaAmount += twoSharingFee;
                    }
                    // If unassigned, it adds to total but not to any specific account
                }
            }

            if (reg.paymentStatus === 'pending_verification' || reg.paymentDetails?.paymentStatus === 'verification_pending') {
                pendingRecords++;
            }

            // 2. Travellers
            const memberCount = reg.members?.length || 0;
            totalTravellers += memberCount;

            if (memberCount === 1) singleTravellers++;
            else if (memberCount > 1) familyGroups++;

            // Family Size Bucket
            const sizeKey = memberCount >= 6 ? 6 : memberCount;
            familySizeCounts[sizeKey] = (familySizeCounts[sizeKey] || 0) + 1;

            // 3. Age Groups
            reg.members?.forEach(m => {
                const age = Number(m.age);
                if (!isNaN(age)) {
                    if (age <= 5) ageGroups['0-5']++;
                    else if (age <= 12) ageGroups['6-12']++;
                    else if (age <= 18) ageGroups['13-18']++;
                    else if (age <= 30) ageGroups['19-30']++;
                    else if (age <= 50) ageGroups['31-50']++;
                    else if (age <= 60) ageGroups['51-60']++;
                    else if (age <= 70) ageGroups['61-70']++;
                    else ageGroups['71+']++;
                }

                const g = (m.gender || '').toLowerCase();
                if (g === 'male' || g === 'm') maleCount++;
                else if (g === 'female' || g === 'f') femaleCount++;

                if (m.packageName) {
                    if (!packageGenderCounts[m.packageName]) {
                        packageGenderCounts[m.packageName] = { male: 0, female: 0, total: 0 };
                    }
                    packageGenderCounts[m.packageName].total++;
                    if (g === 'male' || g === 'm') packageGenderCounts[m.packageName].male++;
                    else if (g === 'female' || g === 'f') packageGenderCounts[m.packageName].female++;
                }
            });
        });

        return {
            totalAmount,
            onlineAmount,
            onlineChaitanyaAmount,
            onlineNarayanaAmount,
            cashAmount,
            totalTravellers,
            totalRecords,
            pendingRecords,
            singleTravellers,
            familyGroups,
            familySizeCounts,
            ageGroups,
            maleCount,
            femaleCount,
            packageGenderCounts
        };
    }, [registrations, currentYatra]);

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white font-display mb-2">{currentYatra?.name || 'Dashboard'}</h1>
                <p className="text-gray-400">Real-time overview of registrations and finances.</p>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatsCard
                    title="Total Travellers"
                    value={stats.totalTravellers + mgmtCount}
                    icon={Users}
                    color="text-purple-400"
                    bg="bg-purple-500/10"
                    trend={mgmtCount > 0 ? `${stats.totalTravellers} Reg + ${mgmtCount} Mgmt` : `${stats.familyGroups} Families`}
                />
                <StatsCard
                    title="Male"
                    value={stats.maleCount + mgmtMaleCount}
                    icon={PersonStanding}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                    trend={mgmtMaleCount > 0 ? `${stats.maleCount} Reg + ${mgmtMaleCount} Mgmt` : undefined}
                />
                <StatsCard
                    title="Female"
                    value={stats.femaleCount + mgmtFemaleCount}
                    icon={PersonStanding}
                    color="text-pink-400"
                    bg="bg-pink-500/10"
                    trend={mgmtFemaleCount > 0 ? `${stats.femaleCount} Reg + ${mgmtFemaleCount} Mgmt` : undefined}
                />
                {Object.keys(stats.packageGenderCounts).length > 0 && Object.entries(stats.packageGenderCounts).map(([pkg, counts]) => (
                    <StatsCard
                        key={pkg}
                        title={pkg}
                        value={counts.total}
                        icon={Activity}
                        color="text-amber-400"
                        bg="bg-amber-500/10"
                        trend={`♂ ${counts.male}  ♀ ${counts.female}`}
                    />
                ))}
                <StatsCard
                    title="Total Revenue"
                    value={`₹${stats.totalAmount.toLocaleString()}`}
                    icon={Banknote}
                    color="text-green-400"
                    bg="bg-green-500/10"
                    trend="₹0 Pending"
                />
                <StatsCard
                    title="Online Collections"
                    value={`₹${stats.onlineAmount.toLocaleString()}`}
                    icon={CreditCard}
                    color="text-blue-400"
                    bg="bg-blue-500/10"
                />
                <StatsCard
                    title="Chaitanya (Online)"
                    value={`₹${stats.onlineChaitanyaAmount.toLocaleString()}`}
                    icon={CreditCard}
                    color="text-cyan-400"
                    bg="bg-cyan-500/10"
                />
                <StatsCard
                    title="Narayana (Online)"
                    value={`₹${stats.onlineNarayanaAmount.toLocaleString()}`}
                    icon={CreditCard}
                    color="text-sky-400"
                    bg="bg-sky-500/10"
                />
                <StatsCard
                    title="Cash Collections"
                    value={`₹${stats.cashAmount.toLocaleString()}`}
                    icon={Wallet}
                    color="text-amber-400"
                    bg="bg-amber-500/10"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Demographics */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Family Size Breakdown */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                            <PersonStanding className="w-5 h-5 text-purple-400" />
                            Group Size Distribution
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map(size => (
                                <div key={size} className="bg-white/5 rounded-xl p-4 flex flex-col items-center justify-center border border-white/5 hover:bg-white/10 transition-colors">
                                    <span className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-1">
                                        {size === 6 ? '6+ Members' : `${size} Member${size > 1 ? 's' : ''}`}
                                    </span>
                                    <span className="text-2xl font-bold text-white">
                                        {stats.familySizeCounts[size] || 0}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Age Demographics */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                            <Baby className="w-5 h-5 text-pink-400" />
                            Traveller Age Profile
                        </h3>
                        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                            {Object.entries(stats.ageGroups).map(([range, count]) => (
                                <div key={range} className="flex flex-col items-center">
                                    <div className="w-full bg-gray-800 rounded-t-lg relative h-24 flex items-end justify-center overflow-hidden group">
                                        <div
                                            className="w-full bg-gradient-to-t from-purple-600 to-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity"
                                            style={{ height: `${Math.max((count / stats.totalTravellers) * 100 * 3, 5)}%` }} // Scaling factor for visual
                                        ></div>
                                        <span className="absolute bottom-1 text-xs font-bold text-white shadow-black drop-shadow-md">{count}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 mt-2 font-medium">{range}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Quick Actions / Alerts */}
                <div className="space-y-6">
                    {/* Action Required */}
                    <div className="glass-card p-6 border-l-4 border-l-yellow-500">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-500" />
                            Action Required
                        </h3>
                        <div className="flex items-center justify-between bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                            <span className="text-yellow-200">Pending Verifications</span>
                            <span className="text-2xl font-bold text-yellow-500">{stats.pendingRecords}</span>
                        </div>
                        <button
                            onClick={() => navigate('/registrations?status=pending_verification')}
                            className="w-full mt-4 btn-secondary text-sm"
                        >
                            View Pending List
                        </button>
                    </div>

                    {/* Quick Stats */}
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-400" />
                            Registration Types
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Single Travellers</span>
                                <span className="text-white font-mono">{stats.singleTravellers}</span>
                            </div>
                            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-blue-500 h-full" style={{ width: `${(stats.singleTravellers / stats.totalRecords) * 100}%` }}></div>
                            </div>

                            <div className="flex justify-between items-center pt-2">
                                <span className="text-gray-400">Family Groups</span>
                                <span className="text-white font-mono">{stats.familyGroups}</span>
                            </div>
                            <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-indigo-500 h-full" style={{ width: `${(stats.familyGroups / stats.totalRecords) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Sub-components
const StatsCard = ({ title, value, icon: Icon, color, bg, trend }: any) => (
    <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
        <div className={`absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
            <Icon className="w-24 h-24 transform translate-x-4 -translate-y-4" />
        </div>

        <div className="flex justify-between items-start mb-4 z-10">
            <div className={cn("p-2 rounded-lg", bg)}>
                <Icon className={cn("w-6 h-6", color)} />
            </div>
            {trend && <span className="text-xs font-medium text-gray-400 bg-black/20 px-2 py-1 rounded-full">{trend}</span>}
        </div>

        <div className="z-10">
            <h4 className="text-gray-400 text-sm font-medium uppercase tracking-wider">{title}</h4>
            <p className="text-2xl font-bold text-white mt-1 font-display">{value}</p>
        </div>
    </div>
);
