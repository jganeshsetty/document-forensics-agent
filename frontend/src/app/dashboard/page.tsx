"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import HeaderTaskbar from "@/components/HeaderTaskbar";
import UploadDashboard from "@/components/UploadDashboard";
import AnalysisReport from "@/components/AnalysisReport";
import DocumentConnections from "@/components/DocumentConnections";
import AssistantChat from "@/components/AssistantChat";
import SettingsModal from "@/components/SettingsModal";
import DiagnosticsModal from "@/components/DiagnosticsModal";
import { fetchDocuments, isAuthenticated, getStoredUser } from "@/lib/api";

const emptySubscribe = () => () => {};

export default function DashboardPage() {
  const router = useRouter();

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("uploads");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Auditor Account Profile State
  const [investigatorName, setInvestigatorName] = useState(() => {
    if (typeof window !== "undefined") {
      const u = getStoredUser();
      if (u?.full_name) return u.full_name;
    }
    return "Forensic Investigator";
  });

  const [investigatorRole, setInvestigatorRole] = useState(() => {
    if (typeof window !== "undefined") {
      const u = getStoredUser();
      if (u?.role) return u.role;
    }
    return "Lead Forensic Investigator";
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // Direct access: No login gating required
  useEffect(() => {
    // Direct platform access enabled
  }, [router]);

  // Export audit log
  const handleExportAuditLog = async () => {
    try {
      const docs = await fetchDocuments();
      const logData = {
        session_id: `SES-${Date.now().toString(36).toUpperCase()}`,
        auditor: investigatorName,
        role: investigatorRole,
        generated_at: new Date().toISOString(),
        total_documents_in_corpus: docs.length,
        documents: docs.map((d) => ({
          document_id: d.document_id,
          filename: d.filename,
          document_type: d.document_type,
          entities: d.total_entities,
          status: d.status,
        })),
      };

      const blob = new Blob([JSON.stringify(logData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `officedocuments_Session_Audit_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export audit log failed:", err);
    }
  };

  // Reset session
  const handleResetSession = () => {
    if (confirm("Reset current forensic workspace session and clear local filters?")) {
      setSelectedDocId("");
      setSearchQuery("");
      setActiveTab("uploads");
    }
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center select-none" suppressHydrationWarning>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-2xs animate-pulse">
            <span className="material-symbols-outlined text-[20px]">shield</span>
          </div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Initializing Efferd Forensics Console...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/70 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex antialiased" suppressHydrationWarning>
      {/* Collapsible Left Sidebar */}
      <Sidebar
        collapsed={!sidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedDocId={selectedDocId}
        onSelectDocument={(docId, tab) => {
          setSelectedDocId(docId);
          if (tab) setActiveTab(tab);
        }}
      />

      {/* Main App Container */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          sidebarOpen ? "pl-64" : "pl-16"
        }`}
      >
        {/* Sticky Taskbar Header */}
        <HeaderTaskbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeTab={activeTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          investigatorName={investigatorName}
          investigatorRole={investigatorRole}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDiagnostics={() => setDiagnosticsOpen(true)}
          onExportAuditLog={handleExportAuditLog}
          onResetSession={handleResetSession}
        />

        {/* Tab View Canvas */}
        <main className="flex-1 w-full pb-10">
          {activeTab === "uploads" && (
            <UploadDashboard
              onSelectDocument={(docId, tab) => {
                setSelectedDocId(docId);
                if (tab) setActiveTab(tab);
              }}
              searchFilter={searchQuery}
            />
          )}

          {activeTab === "analysis-report" && (
            <AnalysisReport
              selectedDocId={selectedDocId}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === "document-map" && (
            <DocumentConnections
              onSelectDocument={(docId) => {
                setSelectedDocId(docId);
                setActiveTab("analysis-report");
              }}
            />
          )}

          {activeTab === "assistant" && (
            <AssistantChat
              initialDocId={selectedDocId}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        investigatorName={investigatorName}
        onUpdateName={setInvestigatorName}
        investigatorRole={investigatorRole}
        onUpdateRole={setInvestigatorRole}
      />

      <DiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
      />
    </div>
  );
}
