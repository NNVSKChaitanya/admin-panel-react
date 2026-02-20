import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LayoutDashboard, PlusCircle, ChevronsLeft, Map, Settings, LogOut, KeyRound, Users, Banknote, BedDouble } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LoginModal } from '../components/Auth/LoginModal';
import { EditYatraSettingsModal } from '../components/EditYatraSettingsModal';
import { AddYatraModal } from '../components/AddYatraModal';

export const MainLayout = () => {
    const { yatras, currentYatraId, setCurrentYatra, loadYatrasFromMaster, currentYatra, user, logout } = useAppStore();
    const [collapsed, setCollapsed] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAddYatraOpen, setIsAddYatraOpen] = useState(false);
    const location = useLocation();

    const isActive = (path: string) => location.pathname.includes(path);

    useEffect(() => {
        const unsub = loadYatrasFromMaster();
        return () => unsub();
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-900 text-gray-100 font-sans selection:bg-purple-500/30">
            {/* Login Modal */}
            <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />

            {/* Sidebar */}
            <aside
                className={cn(
                    "flex flex-col border-r border-white/10 bg-gray-900/95 backdrop-blur-xl transition-all duration-300 relative z-20 shadow-2xl",
                    collapsed ? "w-20" : "w-64"
                )}
            >
                <div className="flex h-20 items-center justify-between px-6 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-xl shadow-lg shadow-purple-500/20 animate-float">
                            <Map className="text-white w-5 h-5 shrink-0" />
                        </div>
                        <span className={cn("font-bold tracking-wide text-lg text-gradient transition-opacity", collapsed ? "opacity-0 hidden" : "opacity-100")}>
                            ISKCON
                        </span>
                    </div>
                    <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 hover:text-white transition-colors">
                        <ChevronsLeft className={cn("w-5 h-5 transition-transform duration-300", collapsed && "rotate-180")} />
                    </button>
                </div>

                <div className="p-4">
                    {/* Add Yatra Button - Only visible if Admin */}
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => setIsAddYatraOpen(true)}
                            className={cn(
                                "flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all active:scale-95 group border border-white/10",
                                collapsed ? "px-0" : "px-4"
                            )}>
                            <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                            <span className={cn("transition-all", collapsed ? "hidden w-0" : "block")}>New Yatra</span>
                        </button>
                    )}
                </div>

                <div className="px-6 py-2">
                    <p className={cn("text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 transition-opacity", collapsed && "opacity-0 invisible")}>
                        Yatras
                    </p>
                    <nav className="flex-1 overflow-y-auto space-y-1">
                        {yatras.map(yatra => (
                            <button
                                key={yatra.id}
                                onClick={() => setCurrentYatra(yatra.id)}
                                className={cn(
                                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all group relative border border-transparent",
                                    currentYatraId === yatra.id
                                        ? "bg-white/5 text-white border-white/10 shadow-inner"
                                        : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                                )}
                            >
                                <LayoutDashboard className={cn("w-5 h-5 shrink-0 transition-colors", currentYatraId === yatra.id ? "text-purple-400" : "text-gray-500 group-hover:text-gray-300")} />
                                <span className={cn("truncate transition-opacity", collapsed ? "opacity-0 w-0 hidden" : "opacity-100")}>
                                    {yatra.name}
                                </span>

                                {collapsed && (
                                    <div className="absolute left-full top-2 ml-4 hidden whitespace-nowrap rounded-md bg-gray-800 border border-white/10 px-3 py-2 text-xs text-white shadow-xl group-hover:block z-50">
                                        {yatra.name}
                                    </div>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="mt-auto border-t border-white/5 p-4 bg-black/20">
                    {user ? (
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-xs font-bold shadow-lg ring-2 ring-black/50">
                                {user.name[0].toUpperCase()}
                            </div>
                            <div className={cn("flex-1 overflow-hidden", collapsed ? "hidden" : "block")}>
                                <p className="text-sm font-medium truncate text-white">{user.name}</p>
                                <button onClick={logout} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-0.5 transition-colors">
                                    <LogOut className="w-3 h-3" /> Sign Out
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsLoginOpen(true)}
                            className={cn("text-sm text-gray-400 hover:text-white w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors", collapsed && "justify-center")}
                        >
                            <KeyRound className="w-5 h-5 text-gray-500" />
                            <span className={cn(collapsed ? "hidden" : "block")}>Admin Login</span>
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-black">
                {/* Dynamic Background */}
                <div
                    className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
                    style={{
                        backgroundImage: currentYatra?.bgImage ? `url('${currentYatra.bgImage}')` : 'none',
                    }}
                >
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-[2px]" />
                </div>

                {/* Top Navigation Tabs */}
                <div className="relative z-20 px-4 md:px-8 pt-6 pb-2 flex items-center justify-between">
                    <div className="inline-flex p-1 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                        <Link
                            to="/dashboard"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                                isActive('/dashboard')
                                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            Overview
                        </Link>
                        <Link
                            to="/registrations"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                                isActive('/registrations')
                                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Users className="w-4 h-4" />
                            Registrations
                        </Link>
                        <Link
                            to="/payments"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                                isActive('/payments')
                                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Banknote className="w-4 h-4" />
                            Payments
                        </Link>
                        <Link
                            to="/rooms"
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                                isActive('/rooms')
                                    ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <BedDouble className="w-4 h-4" />
                            Rooms
                        </Link>
                    </div>

                    {/* Yatra Settings Button (Admin Only) */}
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
                        >
                            <Settings className="w-4 h-4" />
                            <span className="hidden md:inline">Settings</span>
                        </button>
                    )}
                </div>

                <div className="relative z-10 flex-1 overflow-y-auto px-4 md:px-8 pb-8 scroll-smooth">
                    <Outlet />
                </div>
            </main>

            {/* Settings Modal */}
            <EditYatraSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            {/* Add Yatra Modal */}
            <AddYatraModal
                isOpen={isAddYatraOpen}
                onClose={() => setIsAddYatraOpen(false)}
            />
        </div>
    );
};
