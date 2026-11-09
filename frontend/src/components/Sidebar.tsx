"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  UploadCloud,
  FileSearch,
  Network,
  MessageSquareCode,
  FileText,
  Clock,
  Database,
  Server,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { DocumentRecord, fetchDocuments } from "@/lib/api";

interface SidebarProps {
  collapsed: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedDocId: string;
  onSelectDocument: (docId: string, tab?: string) => void;
}

export default function Sidebar({
  collapsed,
  activeTab,
  setActiveTab,
  selectedDocId,
  onSelectDocument,
}: SidebarProps) {
  const [recentDocs, setRecentDocs] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetchDocuments().then((docs) => {
      if (isMounted) {
        setRecentDocs(docs.slice(0, 5));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [selectedDocId]);

  const navItems = [
    {
      id: "uploads",
      label: "Uploads & Metadata",
      icon: UploadCloud,
      desc: "Dropzone, queue & inspector",
    },
    {
      id: "analysis-report",
      label: "Analysis Report",
      icon: FileSearch,
      desc: "Authenticity & ELA visual comparator",
    },
    {
      id: "document-map",
      label: "Document Map",
      icon: Network,
      desc: "Interactive knowledge tree",
    },
    {
      id: "assistant",
      label: "Forensic Assistant",
      icon: MessageSquareCode,
      desc: "Full-page RAG query intelligence",
    },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen bg-white dark:bg-zinc-900 border-r border-zinc-200/80 dark:border-zinc-800 flex flex-col justify-between transition-all duration-300 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Top Header / Branding */}
      <div className="flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight truncate leading-tight">
                  DocVerify
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate leading-tight font-medium">
                  Enterprise Node v2.4
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Group 1: Core Workspace */}
        <div className="p-3">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Core Workspace
            </p>
          )}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white dark:text-zinc-900" : ""}`} />
                  {!collapsed && (
                    <span className="truncate text-left flex-1 font-medium">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Navigation Group 2: Quick Filter / Recent Documents */}
        {!collapsed && recentDocs.length > 0 && (
          <div className="p-3 pt-0">
            <div className="flex items-center justify-between px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <span>Recent Files</span>
              <Clock className="w-3 h-3 text-zinc-400" />
            </div>
            <div className="space-y-0.5">
              {recentDocs.map((doc) => {
                const isSelected = selectedDocId === doc.document_id;
                return (
                  <button
                    key={doc.document_id}
                    type="button"
                    onClick={() => onSelectDocument(doc.document_id, "analysis-report")}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors text-left group ${
                      isSelected
                        ? "bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-zinc-400"}`} />
                    <span className="truncate flex-1">{doc.filename}</span>
                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Footer: System Status Card */}
      <div className="p-3 border-t border-zinc-200/80 dark:border-zinc-800">
        {!collapsed ? (
          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Node Status
              </span>
              <span className="text-[10px] font-mono text-zinc-400">100% OK</span>
            </div>

            <div className="space-y-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Server className="w-2.5 h-2.5" /> FastAPI Engine
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">8000</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Database className="w-2.5 h-2.5" /> ChromaDB Vector
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Synced</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Cpu className="w-2.5 h-2.5" /> OpenCV ELA
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Ready</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center" title="System Status: All Engines Operational">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-emerald-500">
              <Server className="w-4 h-4" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

