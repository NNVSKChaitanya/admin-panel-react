import { useState, useMemo, useEffect } from 'react';
import { useRegistrations } from '../hooks/useRegistrations';
import { useAppStore } from '../store/useAppStore';
import type { Registration, Member } from '../types';
import { doc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getDynamicApp, getMasterApp } from '../services/firebase';
import { useManagementTeam, useYatraManagementSelection } from '../hooks/useManagementTeam';
import { Loader2, Users, BedDouble, AlertCircle, X, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { exportRoomsToExcel } from '../utils/excelExport';

// --- Types for the Board ---
interface MemberItem extends Member {
    registrationId: string;
    memberIndex: number;
    primaryContactName: string;
    familyId: string;
    isManagement?: boolean;
}

const CheckIcon = ({ small = false }: { small?: boolean }) => (
    <svg className={cn("text-white", small ? "w-3 h-3" : "w-4 h-4")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
);

const MinusIcon = () => (
    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
    </svg>
);

// Helper to style member cards based on gender and age
const getMemberStyles = (gender: string, age: string | number) => {
    const ageNum = parseInt(String(age), 10);
    const isSenior = !isNaN(ageNum) && ageNum >= 55;
    const g = gender?.toLowerCase();

    let bgStyle = "bg-black/20"; // Default
    let textStyle = "text-gray-300";
    let badgeStyle = "bg-gray-500/20 text-gray-300 border-gray-500/30";
    let genderLabel = "U";

    if (g === 'male' || g === 'm') {
        bgStyle = isSenior ? "bg-blue-900/30 border-blue-500/30" : "bg-blue-500/10 border-blue-500/10";
        textStyle = isSenior ? "text-blue-200 font-bold" : "text-blue-300";
        badgeStyle = "bg-blue-500/20 text-blue-300 border-blue-500/30";
        genderLabel = "M";
    } else if (g === 'female' || g === 'f') {
        bgStyle = isSenior ? "bg-pink-900/40 border-pink-500/30" : "bg-pink-500/10 border-pink-500/10";
        textStyle = isSenior ? "text-pink-200 font-bold" : "text-pink-300";
        badgeStyle = "bg-pink-500/20 text-pink-300 border-pink-500/30";
        genderLabel = "F";
    }

    return { bgStyle, textStyle, badgeStyle, isSenior, genderLabel };
};

export const RoomAllotment = () => {
    const { currentYatra } = useAppStore();
    const { data: registrations = [], isLoading } = useRegistrations();
    const { members: globalMgmtMembers } = useManagementTeam();
    const { selectedIds: mgmtSelectedIds } = useYatraManagementSelection();
    const [isUpdating, setIsUpdating] = useState(false);

    // Management room assignments (stored separately)
    const [mgmtRoomAssignments, setMgmtRoomAssignments] = useState<Record<string, string>>({});

    // Effect to load management room assignments
    useEffect(() => {
        if (!currentYatra) return;
        const { db } = currentYatra.isMaster
            ? getMasterApp()
            : getDynamicApp(currentYatra.id, currentYatra.config);

        const docRef = doc(db, 'config', 'management_room_assignments');
        const unsub = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setMgmtRoomAssignments(snap.data().assignments || {});
            } else {
                setMgmtRoomAssignments({});
            }
        });
        return () => unsub();
    }, [currentYatra]);

    // Selection state for multi-select
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [assignRoomInput, setAssignRoomInput] = useState('');
    const [roomCapacity, setRoomCapacity] = useState<number>(3);

    // Normalize Data into Member Items
    const allMembers = useMemo(() => {
        const list: MemberItem[] = [];
        registrations.forEach(reg => {
            if (reg.members) {
                reg.members.forEach((m, idx) => {
                    list.push({
                        ...m,
                        registrationId: reg.id,
                        memberIndex: idx,
                        primaryContactName: reg.name,
                        familyId: reg.familyId || reg.id
                    });
                });
            }
        });

        // Inject selected management members
        const selectedMgmt = globalMgmtMembers.filter(m => mgmtSelectedIds.includes(m.id));
        selectedMgmt.forEach((m) => {
            list.push({
                name: m.name,
                age: m.age,
                gender: m.gender,
                registrationId: `MGMT_${m.id}`,
                memberIndex: 0,
                primaryContactName: 'Management Team',
                familyId: `MGMT_TEAM`,
                isManagement: true,
                roomNumber: mgmtRoomAssignments[m.id] || '',
            });
        });

        return list;
    }, [registrations, globalMgmtMembers, mgmtSelectedIds, mgmtRoomAssignments]);

    // Data groupings
    const { unassignedNormalGroups, unassignedTwoSharing, assignedRooms } = useMemo(() => {
        const unassignedNormalList: MemberItem[] = [];
        const unassignedTwoSharingList: MemberItem[] = [];
        const roomsMap: Record<string, MemberItem[]> = {};

        allMembers.forEach(m => {
            if (m.roomNumber) {
                if (!roomsMap[m.roomNumber]) roomsMap[m.roomNumber] = [];
                roomsMap[m.roomNumber].push(m);
            } else {
                if (m.isTwoSharing) {
                    unassignedTwoSharingList.push(m);
                } else {
                    unassignedNormalList.push(m);
                }
            }
        });

        // Convert roomsMap to array and sort
        const assignedRoomsArray = Object.entries(roomsMap).map(([roomNumber, members]) => ({
            roomNumber,
            members,
            isTwoSharingRoom: members.some(m => m.isTwoSharing)
        })).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

        // Group normal unassigned by Family/Registration
        const groupedUnassigned: Record<string, { registrationId: string; primaryContactName: string; familyId: string; members: MemberItem[] }> = {};
        unassignedNormalList.forEach(m => {
            if (!groupedUnassigned[m.registrationId]) {
                groupedUnassigned[m.registrationId] = {
                    registrationId: m.registrationId,
                    primaryContactName: m.primaryContactName,
                    familyId: m.familyId,
                    members: []
                };
            }
            groupedUnassigned[m.registrationId].members.push(m);
        });
        const unassignedGroups = Object.values(groupedUnassigned);

        return {
            unassignedNormalGroups: unassignedGroups,
            unassignedTwoSharing: unassignedTwoSharingList,
            assignedRooms: assignedRoomsArray
        };
    }, [allMembers]);

    const toggleSelection = (memberId: string) => {
        setSelectedMembers(prev =>
            prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
        );
    };

    const toggleFamilySelection = (members: MemberItem[]) => {
        const memberIds = members.map(m => `${m.registrationId}_${m.memberIndex}`);
        const allSelected = memberIds.every(id => selectedMembers.includes(id));

        if (allSelected) {
            // Deselect all
            setSelectedMembers(prev => prev.filter(id => !memberIds.includes(id)));
        } else {
            // Select all
            setSelectedMembers(prev => {
                const newSelection = [...prev];
                memberIds.forEach(id => {
                    if (!newSelection.includes(id)) newSelection.push(id);
                });
                return newSelection;
            });
        }
    };

    const handleAssignRoom = async (startingRoomNumber: string, memberIdsToAssign: string[] = selectedMembers) => {
        if (!currentYatra || memberIdsToAssign.length === 0) return;

        if (memberIdsToAssign.length % roomCapacity !== 0) {
            alert(`Standard rooms require members in multiples of ${roomCapacity}.`);
            return;
        }

        // 1. Validate that all selected members have the same Package
        let targetPackage = '';
        const membersDataToAssign: MemberItem[] = [];

        for (const memberId of memberIdsToAssign) {
            if (memberId.startsWith('MGMT_')) {
                // Management members skip package validation
                continue;
            }
            const [regId, memberIndexStr] = memberId.split('_');
            const memberIndex = parseInt(memberIndexStr, 10);
            const reg = registrations.find(r => r.id === regId);

            if (reg && reg.members[memberIndex]) {
                const member = reg.members[memberIndex];
                const pkg = member.packageName || 'Unknown';
                membersDataToAssign.push({ ...member, packageName: pkg } as MemberItem);

                if (!targetPackage) {
                    targetPackage = pkg;
                } else if (targetPackage !== pkg) {
                    alert(`Package Mismatch: You selected members with different packages ('${targetPackage}' and '${pkg}'). You cannot assign them together.`);
                    return;
                }
            }
        }

        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            const roomsNeeded = memberIdsToAssign.length / roomCapacity;
            const generatedRooms: string[] = [];

            if (startingRoomNumber.trim() === '') {
                // Auto-generate generic RM- numbers based on existing assigned rooms
                let maxRmNumber = 0;
                assignedRooms.forEach(room => {
                    if (room.roomNumber.startsWith("RM-")) {
                        const num = parseInt(room.roomNumber.replace("RM-", ""), 10);
                        if (!isNaN(num) && num > maxRmNumber) {
                            maxRmNumber = num;
                        }
                    }
                });

                for (let i = 0; i < roomsNeeded; i++) {
                    maxRmNumber++;
                    generatedRooms.push(`RM-${maxRmNumber.toString().padStart(2, '0')}`);
                }
            } else {
                const baseRoom = startingRoomNumber.trim();
                const match = baseRoom.match(/^(.*?)(\d+)(\D*)$/);

                for (let i = 0; i < roomsNeeded; i++) {
                    if (roomsNeeded === 1) {
                        generatedRooms.push(baseRoom);
                    } else if (match) {
                        const prefix = match[1];
                        const startNum = parseInt(match[2], 10);
                        const padding = match[2].length;
                        const suffix = match[3];
                        const nextNum = (startNum + i).toString().padStart(padding, '0');
                        generatedRooms.push(`${prefix}${nextNum}${suffix}`);
                    } else {
                        generatedRooms.push(`${baseRoom}-${i + 1}`);
                    }
                }
            }

            // 2. Validate against existing assigned rooms to prevent mixing packages
            for (const roomName of generatedRooms) {
                const existingRoom = assignedRooms.find(r => r.roomNumber === roomName);
                if (existingRoom && existingRoom.members.length > 0) {
                    const existingPackage = existingRoom.members[0].packageName || 'Unknown';
                    if (existingPackage !== targetPackage) {
                        alert(`Conflict in Room ${roomName}: It already holds members with package '${existingPackage}'. You cannot put '${targetPackage}' members here.`);
                        setIsUpdating(false);
                        return;
                    }
                }
            }

            // We need to group updates by registrationId
            const updatesByReg: Record<string, Registration> = {};
            const mgmtUpdates: Record<string, string> = { ...mgmtRoomAssignments };

            memberIdsToAssign.forEach((memberId, index) => {
                const roomIndex = Math.floor(index / roomCapacity);
                const assignedRoomName = generatedRooms[roomIndex];

                if (memberId.startsWith('MGMT_')) {
                    const mgmtId = memberId.replace('MGMT_', '').replace('_0', '');
                    mgmtUpdates[mgmtId] = assignedRoomName;
                } else {
                    const [regId, memberIndexStr] = memberId.split('_');
                    const memberIndex = parseInt(memberIndexStr, 10);

                    if (!updatesByReg[regId]) {
                        updatesByReg[regId] = JSON.parse(JSON.stringify(registrations.find(r => r.id === regId))); // Deep copy
                    }

                    if (updatesByReg[regId] && updatesByReg[regId].members[memberIndex]) {
                        updatesByReg[regId].members[memberIndex].roomNumber = assignedRoomName;
                    }
                }
            });

            // Perform updates
            const updatePromises = Object.entries(updatesByReg).map(([regId, updatedReg]) => {
                const regRef = doc(db, 'registrations', regId);
                return updateDoc(regRef, { members: updatedReg.members });
            });

            // Save management room assignments if any changed
            const hasMgmtChanges = memberIdsToAssign.some(id => id.startsWith('MGMT_'));
            if (hasMgmtChanges) {
                const mgmtDocRef = doc(db, 'config', 'management_room_assignments');
                updatePromises.push(setDoc(mgmtDocRef, { assignments: mgmtUpdates }));
            }

            await Promise.all(updatePromises);

            setSelectedMembers([]);
            setAssignRoomInput('');
        } catch (error) {
            console.error("Failed to assign room:", error);
            alert("Failed to assign room.");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleRemoveFromRoom = async (member: MemberItem) => {
        if (!currentYatra) return;
        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            if (member.isManagement) {
                // Remove from management room assignments
                const mgmtId = member.registrationId.replace('MGMT_', '');
                const updatedAssignments = { ...mgmtRoomAssignments };
                delete updatedAssignments[mgmtId];
                const mgmtDocRef = doc(db, 'config', 'management_room_assignments');
                await setDoc(mgmtDocRef, { assignments: updatedAssignments });
            } else {
                const regRef = doc(db, 'registrations', member.registrationId);
                const reg = registrations.find(r => r.id === member.registrationId);

                if (reg) {
                    const updatedMembers = [...reg.members];
                    if (updatedMembers[member.memberIndex]) {
                        updatedMembers[member.memberIndex].roomNumber = ''; // Clear room
                        await updateDoc(regRef, { members: updatedMembers });
                    }
                }
            }
        } catch (error) {
            console.error("Failed to remove from room:", error);
            alert("Failed to remove from room.");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, member: MemberItem) => {
        const id = member.isManagement ? member.registrationId : `${member.registrationId}_${member.memberIndex}`;
        e.dataTransfer.setData('memberId', id);
        e.dataTransfer.setData('currentRoom', member.roomNumber || '');
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDropToUnassigned = async (e: React.DragEvent) => {
        e.preventDefault();
        const memberId = e.dataTransfer.getData('memberId');
        const currentRoom = e.dataTransfer.getData('currentRoom');
        
        if (!memberId || !currentRoom) return; // Already unassigned or invalid
        
        const member = allMembers.find(m => {
            const id = m.isManagement ? m.registrationId : `${m.registrationId}_${m.memberIndex}`;
            return id === memberId;
        });

        if (member) {
            await handleRemoveFromRoom(member);
        }
    };

    const handleDropIntoRoom = async (e: React.DragEvent, targetRoomNumber: string) => {
        e.preventDefault();
        const memberId = e.dataTransfer.getData('memberId');
        const currentRoom = e.dataTransfer.getData('currentRoom');

        if (!currentYatra || !memberId || currentRoom === targetRoomNumber) return;

        const targetMember = allMembers.find(m => {
            const id = m.isManagement ? m.registrationId : `${m.registrationId}_${m.memberIndex}`;
            return id === memberId;
        });

        if (!targetMember) return;

        // Validate package mismatch with destination
        const existingRoom = assignedRooms.find(r => r.roomNumber === targetRoomNumber);
        if (existingRoom && existingRoom.members.length > 0 && !targetMember.isManagement) {
            const existingPackage = existingRoom.members[0].packageName || 'Unknown';
            const memberPkg = targetMember.packageName || 'Unknown';
            if (existingPackage !== memberPkg) {
                alert(`Conflict in Room ${targetRoomNumber}: It already holds members with package '${existingPackage}'. You cannot put '${memberPkg}' member here.`);
                return;
            }
        }

        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            if (targetMember.isManagement) {
                const mgmtId = targetMember.registrationId.replace('MGMT_', '');
                const mgmtUpdates = { ...mgmtRoomAssignments, [mgmtId]: targetRoomNumber };
                const mgmtDocRef = doc(db, 'config', 'management_room_assignments');
                await setDoc(mgmtDocRef, { assignments: mgmtUpdates });
            } else {
                const reg = registrations.find(r => r.id === targetMember.registrationId);
                if (reg && reg.members[targetMember.memberIndex]) {
                    const updatedMembers = [...reg.members];
                    updatedMembers[targetMember.memberIndex].roomNumber = targetRoomNumber;
                    const regRef = doc(db, 'registrations', targetMember.registrationId);
                    await updateDoc(regRef, { members: updatedMembers });
                }
            }
        } catch (error) {
            console.error("Failed to move room:", error);
            alert("Failed to move room.");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAutoAssignTwoSharing = async () => {
        if (!currentYatra || unassignedTwoSharing.length === 0) return;

        if (!confirm(`Auto-assign rooms for ${unassignedTwoSharing.length} two-sharing members?`)) return;

        setIsUpdating(true);
        try {
            const { db } = currentYatra.isMaster
                ? getMasterApp()
                : getDynamicApp(currentYatra.id, currentYatra.config);

            // Group by family AND package to avoid mixing packages in auto-generated 2-sharing rooms
            const groupedByFamilyAndPkg: Record<string, MemberItem[]> = {};
            unassignedTwoSharing.forEach(m => {
                const key = `${m.familyId}_${m.packageName || 'Unknown'}`;
                if (!groupedByFamilyAndPkg[key]) groupedByFamilyAndPkg[key] = [];
                groupedByFamilyAndPkg[key].push(m);
            });

            const updatesByReg: Record<string, Registration> = {};
            let roomCounter = 1;

            // Find max existing 2SH room to continue numbering
            assignedRooms.forEach(room => {
                if (room.roomNumber.startsWith('2SH-')) {
                    const num = parseInt(room.roomNumber.split('-')[1], 10);
                    if (!isNaN(num) && num >= roomCounter) {
                        roomCounter = num + 1;
                    }
                }
            });

            let currentRoomMembers: MemberItem[] = [];

            const assignCurrentRoom = () => {
                const roomName = `2SH-${roomCounter.toString().padStart(2, '0')}`;
                currentRoomMembers.forEach(m => {
                    if (!updatesByReg[m.registrationId]) {
                        updatesByReg[m.registrationId] = JSON.parse(JSON.stringify(registrations.find(r => r.id === m.registrationId)));
                    }
                    updatesByReg[m.registrationId].members[m.memberIndex].roomNumber = roomName;
                });
                roomCounter++;
                currentRoomMembers = [];
            };

            // Iterate family-package groups and pair them up
            Object.values(groupedByFamilyAndPkg).forEach(familyMembers => {
                familyMembers.forEach(m => {
                    currentRoomMembers.push(m);
                    if (currentRoomMembers.length === 2) {
                        assignCurrentRoom();
                    }
                });
            });

            // If there's 1 person left (odd number), put them in their own room
            if (currentRoomMembers.length > 0) {
                assignCurrentRoom();
            }

            // Perform updates
            const updatePromises = Object.entries(updatesByReg).map(([regId, updatedReg]) => {
                const regRef = doc(db, 'registrations', regId);
                return updateDoc(regRef, { members: updatedReg.members });
            });

            await Promise.all(updatePromises);
        } catch (error) {
            console.error("Failed to auto-assign 2-sharing rooms:", error);
            alert("Failed to auto-assign rules.");
        } finally {
            setIsUpdating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-140px)] items-center justify-center">
                <Loader2 className="animate-spin h-10 w-10 text-purple-500" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col space-y-4 animate-fade-in">
            <div className="flex items-center justify-between px-2">
                <div>
                    <h1 className="text-2xl font-bold text-white">Room Allotment</h1>
                    <p className="text-gray-400 text-sm">Manage room assignments for all travellers.</p>
                </div>
                <div className="flex items-center gap-4">
                    {isUpdating && <span className="text-sm text-yellow-400 animate-pulse flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Updating...</span>}
                    <button
                        onClick={() => exportRoomsToExcel(assignedRooms, { filename: `Rooms_${currentYatra?.name || 'Export'}` })}
                        disabled={assignedRooms.length === 0}
                        className="flex items-center gap-2 bg-green-600/20 hover:bg-green-600/40 text-green-300 border border-green-500/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Export Allotments to Excel"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
                {/* Unassigned Section */}
                <div 
                    className="md:col-span-4 flex flex-col gap-4 min-h-0 border-r border-white/5 pr-4 transition-colors"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-white/5'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('bg-white/5'); }}
                    onDrop={(e) => { e.currentTarget.classList.remove('bg-white/5'); handleDropToUnassigned(e); }}
                >

                    {/* 2 Sharing Needs Assignment */}
                    {unassignedTwoSharing.length > 0 && (
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex flex-col shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-indigo-300 flex items-center gap-2">
                                    <BedDouble className="w-4 h-4" /> 2 Sharing Pending ({unassignedTwoSharing.length})
                                </h3>
                                <button
                                    onClick={handleAutoAssignTwoSharing}
                                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors"
                                >
                                    Auto-Assign
                                </button>
                            </div>
                            <div className="space-y-2">
                                {unassignedTwoSharing.map(m => {
                                    const { bgStyle, textStyle, badgeStyle, isSenior, genderLabel } = getMemberStyles(m.gender, m.age);
                                    return (
                                        <div 
                                            key={`${m.registrationId}_${m.memberIndex}`} 
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, m)}
                                            className={cn("p-2 rounded border text-sm flex justify-between items-center cursor-grab active:cursor-grabbing", bgStyle)}
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("text-xs px-1.5 py-0.5 rounded border font-bold", badgeStyle)}>{genderLabel}</span>
                                                    <p className={cn("font-medium", textStyle)}>{m.name}</p>
                                                    {isSenior && <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-bold tracking-wider">SENIOR</span>}
                                                </div>
                                                <p className="text-xs text-indigo-400/70 mt-0.5">Family: {m.primaryContactName}</p>
                                            </div>
                                            <div className="text-right">
                                                {m.packageName ? (
                                                    <span className="text-[10px] bg-white/10 text-indigo-200 px-1.5 py-0.5 rounded border border-white/10">{m.packageName}</span>
                                                ) : (
                                                    <span className="text-[10px] text-gray-500">No Package</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Normal Unassigned grouped by Family */}
                    <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col relative min-h-0">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-300 flex items-center gap-2">
                                <Users className="w-4 h-4" /> Families / Unassigned
                            </h3>
                            {selectedMembers.length > 0 && (
                                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded font-bold">
                                    {selectedMembers.length} Selected
                                </span>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pb-4 pr-2">
                            {unassignedNormalGroups.map(group => {
                                const groupMemberIds = group.members.map(m => `${m.registrationId}_${m.memberIndex}`);
                                const allSelected = groupMemberIds.length > 0 && groupMemberIds.every(id => selectedMembers.includes(id));
                                const someSelected = groupMemberIds.some(id => selectedMembers.includes(id));

                                return (
                                    <div key={group.registrationId} className="bg-black/20 border border-white/5 rounded-xl overflow-hidden">
                                        <div
                                            className={cn(
                                                "p-3 flex justify-between items-center border-b border-white/5 cursor-pointer transition-colors hover:bg-white/5",
                                                allSelected ? "bg-purple-900/20" : someSelected ? "bg-purple-900/10" : ""
                                            )}
                                            onClick={() => toggleFamilySelection(group.members)}
                                        >
                                            <div>
                                                <h4 className="font-bold text-gray-200 text-sm">Family: {group.primaryContactName}</h4>
                                                <p className="text-xs text-gray-500">{group.members.length} member(s)</p>
                                            </div>
                                            <div className={cn(
                                                "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                                allSelected ? "bg-purple-500 border-purple-500" : someSelected ? "bg-purple-500/50 border-purple-500" : "border-gray-500"
                                            )}>
                                                {allSelected && <CheckIcon />}
                                                {!allSelected && someSelected && <MinusIcon />}
                                            </div>
                                        </div>
                                        <div className="p-2 space-y-1 bg-black/40">
                                            {group.members.map(m => {
                                                const id = `${m.registrationId}_${m.memberIndex}`;
                                                const isSelected = selectedMembers.includes(id);
                                                const { bgStyle, textStyle, badgeStyle, isSenior, genderLabel } = getMemberStyles(m.gender, m.age);

                                                return (
                                                    <div
                                                        key={id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, m)}
                                                        onClick={(e) => { e.stopPropagation(); toggleSelection(id); }}
                                                        className={cn(
                                                            "p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all flex items-center gap-3",
                                                            isSelected ? "shadow-[0_0_0_2px_rgba(168,85,247,0.5)] ring-2 ring-purple-500/50" : "hover:brightness-125",
                                                            bgStyle
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                                                            isSelected ? "bg-purple-500 border-purple-500" : "border-gray-600 bg-black/40"
                                                        )}>
                                                            {isSelected && <CheckIcon small />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-bold flex-shrink-0", badgeStyle)}>{genderLabel}</span>
                                                                <p className={cn("text-sm font-medium truncate shrink", textStyle)}>{m.name}</p>
                                                                {m.isManagement && <span className="text-[9px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-bold tracking-wider flex-shrink-0">MGMT</span>}
                                                                {isSenior && !m.isManagement && <span className="text-[9px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-bold tracking-wider flex-shrink-0">SENIOR</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex-shrink-0 text-right">
                                                            {m.packageName ? (
                                                                <span className="text-[10px] bg-white/10 text-gray-300 px-1.5 py-0.5 rounded border border-white/10">{m.packageName}</span>
                                                            ) : (
                                                                <span className="text-[10px] text-gray-500 italic">No Package</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {unassignedNormalGroups.length === 0 && (
                                <p className="text-center text-sm text-gray-500 mt-10">All families assigned.</p>
                            )}
                        </div>

                        {/* Action Bar for Assignment */}
                        {selectedMembers.length > 0 && (
                            <div className="mt-4 p-4 bg-purple-900 border border-purple-500 rounded-xl shadow-2xl animate-slide-up flex-shrink-0 z-10">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-sm font-bold text-white">Assign {selectedMembers.length} Selected Member(s)</h4>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-purple-200">Capacity:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="10"
                                            value={roomCapacity}
                                            onChange={(e) => setRoomCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                                            className="w-16 bg-black/30 border border-purple-500/50 rounded px-2 py-1 text-white text-xs outline-none focus:border-purple-300"
                                        />
                                    </div>
                                </div>

                                {selectedMembers.length % roomCapacity !== 0 ? (
                                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-100 text-sm">
                                        <p className="font-bold flex items-center gap-1.5 mb-1 text-red-200">
                                            <AlertCircle className="w-4 h-4" />
                                            Incomplete Room
                                        </p>
                                        <p>Standard sharing requires exactly {roomCapacity} members per room. Please select <strong>{roomCapacity - (selectedMembers.length % roomCapacity)} more</strong> member(s), or deselect to reach a multiple of {roomCapacity}.</p>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={assignRoomInput}
                                            onChange={e => setAssignRoomInput(e.target.value)}
                                            placeholder={selectedMembers.length > roomCapacity ? "Starting Room No. (optional)" : "Room No. (optional)"}
                                            className="input-glass text-sm flex-1 font-bold text-white placeholder:text-white/30"
                                            onKeyDown={e => e.key === 'Enter' && handleAssignRoom(assignRoomInput)}
                                        />
                                        <button
                                            onClick={() => handleAssignRoom(assignRoomInput)}
                                            disabled={isUpdating}
                                            className="bg-white text-purple-900 hover:bg-gray-100 disabled:opacity-50 px-4 py-2 rounded-lg font-bold shadow-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                                        >
                                            Assign {selectedMembers.length / roomCapacity} Room(s)
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Assigned Rooms Grid */}
                <div className="md:col-span-8 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-300 flex items-center gap-2">
                            <BedDouble className="w-5 h-5" /> Assigned Rooms ({assignedRooms.length})
                        </h3>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {assignedRooms.map(room => (
                                <div
                                    key={room.roomNumber}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-purple-500', 'bg-white/10'); }}
                                    onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-purple-500', 'bg-white/10'); }}
                                    onDrop={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-purple-500', 'bg-white/10'); handleDropIntoRoom(e, room.roomNumber); }}
                                    className={cn(
                                        "rounded-xl border p-3 flex flex-col gap-2 shadow-sm relative overflow-hidden transition-all",
                                        room.isTwoSharingRoom
                                            ? "bg-indigo-900/10 border-indigo-500/20"
                                            : "bg-gray-800/40 border-white/10"
                                    )}
                                >
                                    {room.isTwoSharingRoom && (
                                        <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                                            2 SHARING
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-lg text-white flex items-center gap-2">
                                            Room {room.roomNumber}
                                            <span className="text-xs font-normal text-gray-500 bg-black/40 px-1.5 py-0.5 rounded">{room.members.length}</span>
                                        </h4>
                                    </div>
                                    <div className="space-y-1.5 mt-2">
                                        {room.members.map(m => {
                                            const { bgStyle, textStyle, badgeStyle, genderLabel, isSenior } = getMemberStyles(m.gender, m.age);
                                            return (
                                                <div 
                                                    key={`${m.registrationId}_${m.memberIndex}`} 
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, m)}
                                                    className={cn("flex items-center justify-between text-sm p-1.5 rounded border cursor-grab active:cursor-grabbing hover:brightness-110", bgStyle)}
                                                >
                                                    <div className="flex-1 min-w-0 pr-2 flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            <span className={cn("text-[10px] px-1 py-[1px] rounded border font-bold flex-shrink-0", badgeStyle)}>{genderLabel}</span>
                                                            <p className={cn("truncate shrink", textStyle)}>
                                                                {m.name}
                                                                {m.isManagement && <span className="ml-1.5 text-[9px] bg-amber-500/90 text-black px-1 py-[1px] rounded font-bold inline-block">MGMT</span>}
                                                                {isSenior && !m.isManagement && <span className="ml-1.5 text-[9px] bg-amber-500/90 text-black px-1 py-[1px] rounded font-bold inline-block">55+</span>}
                                                            </p>
                                                        </div>
                                                        <span className="text-[9px] bg-white/5 text-gray-400 px-1 py-[1px] border border-white/10 rounded flex-shrink-0 ml-2">
                                                            {m.packageName || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveFromRoom(m)}
                                                        className="text-gray-500 hover:text-red-400 p-1 transition-colors flex-shrink-0"
                                                        title="Remove from room"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {assignedRooms.length === 0 && (
                                <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-white/10 rounded-xl">
                                    <BedDouble className="w-10 h-10 mb-2 opacity-50" />
                                    <p>No rooms assigned yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
