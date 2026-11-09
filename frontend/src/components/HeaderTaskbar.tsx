"use client";

import React, { useState, useRef, useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  PanelLeft,
  Search,
  Sun,
  Moon,
  Bell,
  ChevronDown,
  Sliders,
  Activity,
  Download,
  LogOut,
  Laptop,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface HeaderTaskbarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  activeTab: string;
  activeDocName?: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  investigatorName: string;
  investigatorRole: string;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
  onExportAuditLog: () => void;
  onResetSession: () => void;
}

const emptySubscribe = () => () => {};

export default function HeaderTaskbar({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  activeDocName,
  searchQuery,
  setSearchQuery,
  investigatorName,
  investigatorRole,
  onOpenSettings,
  onOpenDiagnostics,
  onExportAuditLog,
  onResetSession,
}: HeaderTaskbarProps) {
  const { theme, setTheme, systemTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentTheme = theme === "system" ? systemTheme : theme;

  const tabLabels: Record<string, string> = {
    uploads: "Uploads & Metadata",
    "analysis-report": "Analysis Report",
    "document-map": "Document Map",
    assistant: "Forensic Assistant",
  };

  const notifications = [
    {
      id: 1,
      title: "Hall Ticket.pdf extraction complete",
      time: "2m ago",
      type: "success",
      icon: CheckCircle2,
    },
    {
      id: 2,
      title: "High variance region flagged in page 1",
      time: "14m ago",
      type: "alert",
      icon: AlertTriangle,
    },
  ];

  return (
    <header className="sticky top-0 z-30 h-14 w-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800 transition-colors">
      <div className="h-full px-4 flex items-center justify-between gap-4">
        {/* Left: Sidebar Toggle + Divider + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle Sidebar"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition-colors flex-shrink-0"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block flex-shrink-0" />

          {/* Breadcrumb Trail */}
          <nav className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
            <span className="hover:text-zinc-800 dark:hover:text-zinc-200 font-medium">DocVerify</span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate">
              {tabLabels[activeTab] || "Workspace"}
            </span>
            {activeDocName && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700">/</span>
                <span className="text-blue-600 dark:text-blue-400 font-medium truncate max-w-[160px]">
                  {activeDocName}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* Center / Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Global Search Bar */}
          <div className="relative hidden md:block w-48 lg:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents, credentials..."
              className="w-full h-8 pl-8 pr-10 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:bg-white dark:focus:bg-zinc-900 transition-all"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 pointer-events-none">
              ⌘K
            </kbd>
          </div>

          {/* Light / Dark Mode Toggle */}
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle Theme"
              className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition-colors flex-shrink-0"
              title={`Switch to ${currentTheme === "dark" ? "Light" : "Dark"} Mode`}
            >
              {currentTheme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-700" />
              )}
            </button>
          )}

          {/* Notifications Popover */}
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative w-8 h-8 rounded-md flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition-colors flex-shrink-0"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-zinc-900" />
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-2 text-xs z-50 animate-in fade-in duration-100">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 font-semibold text-zinc-900 dark:text-zinc-100">
                  <span>Forensic Audit Alerts</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">2 new</span>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {notifications.map((n) => {
                    const Icon = n.icon;
                    return (
                      <div key={n.id} className="p-2.5 flex items-start gap-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 rounded-lg transition-colors">
                        <Icon className={`w-4 h-4 mt-0.5 ${n.type === "alert" ? "text-amber-500" : "text-emerald-500"}`} />
                        <div>
                          <p className="font-medium text-zinc-800 dark:text-zinc-200">{n.title}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{n.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block mx-0.5" />

          {/* User Account Profile Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
            >
              <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center font-semibold text-xs shadow-2xs">
                {investigatorName.charAt(0) || "A"}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {investigatorName}
                </p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                  {investigatorRole}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 hidden sm:block" />
            </button>

            {/* Profile Dropdown Menu */}
            {profileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-1.5 text-xs z-50 animate-in fade-in duration-100">
                {/* Account Header */}
                <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center font-semibold text-xs">
                    {investigatorName.charAt(0)}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate">
                      {investigatorName}
                    </p>
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium text-[9px] rounded uppercase tracking-wider">
                      Lead Forensic Investigator
                    </span>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors text-left"
                  >
                    <Sliders className="w-4 h-4 text-zinc-400" />
                    <span>Profile &amp; Workspace Settings</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenDiagnostics();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors text-left"
                  >
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span>API &amp; Engine Diagnostics</span>
                  </button>

                  {/* Segmented Theme Switcher */}
                  <div className="px-3 py-2 border-t border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                      Theme Preference
                    </p>
                    <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setTheme("light")}
                        className={`py-1 text-[11px] rounded flex items-center justify-center gap-1 font-medium transition-colors ${
                          theme === "light"
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                        }`}
                      >
                        <Sun className="w-3 h-3" /> Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("dark")}
                        className={`py-1 text-[11px] rounded flex items-center justify-center gap-1 font-medium transition-colors ${
                          theme === "dark"
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                        }`}
                      >
                        <Moon className="w-3 h-3" /> Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => setTheme("system")}
                        className={`py-1 text-[11px] rounded flex items-center justify-center gap-1 font-medium transition-colors ${
                          theme === "system"
                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                            : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                        }`}
                      >
                        <Laptop className="w-3 h-3" /> Auto
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onExportAuditLog();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors text-left"
                  >
                    <Download className="w-4 h-4 text-zinc-400" />
                    <span>Export Session Audit Log</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onResetSession();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Reset Forensic Session</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
