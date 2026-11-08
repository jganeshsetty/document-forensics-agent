"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import UploadDashboard from "@/components/UploadDashboard";
import AnalysisReport from "@/components/AnalysisReport";
import DocumentConnections from "@/components/DocumentConnections";
import AssistantChat from "@/components/AssistantChat";

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>("uploads");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  return (
    <div className="min-h-screen bg-surface font-body-md text-body-md text-on-surface antialiased flex flex-col">
      {/* DocVerify Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Main View Port (With adequate top padding so content is never clipped) */}
      <main className="w-full pt-20 bg-surface min-h-[calc(100vh-4rem)] flex-1">
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

      {/* Enterprise Footer */}
      <footer className="w-full bg-surface-container-lowest border-t border-outline-variant/30 py-6">
        <div className="w-full px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            © 2026 DocVerify Security Operations. Authenticated Enterprise Node.
          </p>
          <div className="flex items-center gap-6">
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Integrity Standard: NIST FIPS 180-4
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Classification: Internal Forensics Only
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
