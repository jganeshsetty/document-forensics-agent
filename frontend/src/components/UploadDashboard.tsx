"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DocumentRecord,
  fetchDocuments,
  fetchDocument,
  uploadDocument,
  pollJob,
  formatBytes,
  formatDate,
} from "@/lib/api";

interface UploadDashboardProps {
  onSelectDocument: (docId: string, tab?: string) => void;
  searchFilter?: string;
}

export default function UploadDashboard({
  onSelectDocument,
  searchFilter = "",
}: UploadDashboardProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "review">("all");
  const [selectedInspectorId, setSelectedInspectorId] = useState<string>("");
  const [inspectorDoc, setInspectorDoc] = useState<DocumentRecord | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"credentials" | "layout" | "visual">("credentials");
  const [loadingInspector, setLoadingInspector] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load documents list
  const reloadDocuments = useCallback(async () => {
    const list = await fetchDocuments();
    setDocuments(list);
    if (list.length > 0 && !selectedInspectorId) {
      setSelectedInspectorId(list[0].document_id);
    }
  }, [selectedInspectorId]);

  useEffect(() => {
    let isMounted = true;
    fetchDocuments().then((list) => {
      if (!isMounted) return;
      setDocuments(list);
      if (list.length > 0) {
        setSelectedInspectorId(list[0].document_id);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch full details for the Inspector when active ID changes
  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (!isMounted) return;
      if (!selectedInspectorId) {
        setInspectorDoc(null);
        return;
      }
      setLoadingInspector(true);
      fetchDocument(selectedInspectorId)
        .then((data) => {
          if (isMounted) setInspectorDoc(data);
        })
        .finally(() => {
          if (isMounted) setLoadingInspector(false);
        });
    });
    return () => {
      isMounted = false;
    };
  }, [selectedInspectorId]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploadStatus(`Uploading ${file.name}...`);
    try {
      const resp = await uploadDocument(file);
      setUploadStatus("Processing background forensic extraction & RAG chunking...");

      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(async () => {
        try {
          const job = await pollJob(resp.job_id);
          if (job.status === "completed") {
            setUploadStatus(`✓ Verified & Processed: ${file.name}`);
            if (pollingRef.current) clearInterval(pollingRef.current);
            reloadDocuments();
            setSelectedInspectorId(resp.document_id);
            setTimeout(() => setUploadStatus(""), 4000);
          } else if (job.status === "failed") {
            setUploadStatus(`✗ Verification failed: ${job.error || "Unknown error"}`);
            if (pollingRef.current) clearInterval(pollingRef.current);
            reloadDocuments();
          }
        } catch (err) {
          console.error("Job poll error:", err);
        }
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadStatus(`Error: ${msg}`);
      setTimeout(() => setUploadStatus(""), 5000);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Filtered documents (Strictly live backend data)
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      !searchFilter ||
      doc.filename.toLowerCase().includes(searchFilter.toLowerCase()) ||
      doc.document_id.toLowerCase().includes(searchFilter.toLowerCase()) ||
      doc.document_type.toLowerCase().includes(searchFilter.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === "ready") return doc.status === "ready";
    if (statusFilter === "review") return doc.status === "in_review" || doc.pii_findings_count > 0;
    return true;
  });

  const totalBytes = documents.reduce((acc, d) => acc + (d.file_size || 0), 0);
  const pendingCount = documents.filter((d) => d.status === "processing").length;

  // Compute key credential pairs from entities & pii_findings
  const allEntities = inspectorDoc?.entities || [];
  const textEntities = allEntities.filter((e) => e.text_type !== "Signature" && e.text_type !== "Stamp" && e.text_type !== "Logo");
  const visualEntities = allEntities.filter((e) => e.text_type === "Signature" || e.text_type === "Stamp" || e.text_type === "Logo");

  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-7xl mx-auto px-6 lg:px-12 py-8 space-y-10">
        {/* Top Analytical Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm flex items-center justify-between border border-outline-variant/20">
            <div>
              <span className="font-label-md text-label-md font-medium text-secondary">
                Verified Records
              </span>
              <p className="font-headline-lg text-headline-lg text-on-surface font-semibold mt-1">
                {documents.length}
              </p>
              <span className="font-body-sm text-body-sm text-secondary">
                Originality &amp; Tampering Check
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">task_alt</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm flex items-center justify-between border border-outline-variant/20">
            <div>
              <span className="font-label-md text-label-md font-medium text-secondary">
                Processing Queue
              </span>
              <p className="font-headline-lg text-headline-lg text-on-surface font-semibold mt-1">
                {pendingCount} Files
              </p>
              <span className="font-body-sm text-body-sm text-secondary">
                {pendingCount > 0 ? "Analyzing via Smart Routing..." : "Ready for Inspection"}
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
              <span className={`material-symbols-outlined text-[24px] ${pendingCount > 0 ? "animate-spin" : ""}`}>
                autorenew
              </span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm flex items-center justify-between border border-outline-variant/20">
            <div>
              <span className="font-label-md text-label-md font-medium text-secondary">
                Storage Used
              </span>
              <p className="font-headline-lg text-headline-lg text-on-surface font-semibold mt-1">
                {formatBytes(totalBytes)}
              </p>
              <span className="font-body-sm text-body-sm text-secondary">
                Storage Allocated
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">cloud_queue</span>
            </div>
          </div>
        </div>

        {/* Centerpiece: Dropzone Container */}
        <div className="bg-surface-container-lowest rounded-2xl p-8 lg:p-12 shadow-sm border border-outline-variant/20">
          <div
            id="dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ outline: "2px dashed #93c5fd", outlineOffset: "-4px" }}
            className={`group relative flex flex-col items-center justify-center text-center p-10 lg:p-14 rounded-2xl transition-all duration-200 cursor-pointer ${
              isDragging ? "bg-surface-container" : "bg-surface-container-low hover:bg-surface-container"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff"
              className="hidden"
              id="file-input"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            {/* Atmospheric Icon Target */}
            <div className="w-20 h-20 rounded-2xl bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary mb-5 transition-transform duration-200 group-hover:scale-105">
              <span className="material-symbols-outlined text-[36px]">cloud_upload</span>
            </div>

            <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
              Upload Document
            </h1>
            <p className="font-body-lg text-body-lg text-secondary max-w-md mt-2 mb-6">
              Drag your PDF, scanned document, or text-identifiable image here (.pdf, .png, .jpg, .jpeg, .tiff)
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-medium tracking-wide shadow-sm hover:shadow transition-all active:scale-95 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Choose File
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-5 py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md text-label-md font-medium transition-colors border border-outline-variant/30 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">folder_open</span>
                Select Folder
              </button>
            </div>

            {uploadStatus && (
              <div className="mt-5 px-4 py-2 bg-surface-container-lowest text-primary rounded-lg font-label-md text-label-md shadow-sm border border-outline-variant/20 flex items-center gap-2 animate-fade-in">
                <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                {uploadStatus}
              </div>
            )}
          </div>
        </div>

        {/* Recent Uploads Table */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Recent Uploads
              </h2>
              <p className="font-body-sm text-body-sm text-secondary">
                Select any document to inspect its extracted credentials and structural layout
              </p>
            </div>

            {/* Filter Pills */}
            <div className="inline-flex p-1 rounded-xl bg-surface-container-low border border-outline-variant/20 self-start sm:self-center">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
                  statusFilter === "all"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-xs"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                All Documents
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ready")}
                className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
                  statusFilter === "ready"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-xs"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                Verified Ready
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("review")}
                className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md transition-colors ${
                  statusFilter === "review"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-xs"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                Needs Review
              </button>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/20 font-label-md text-label-md text-secondary">
                    <th className="py-4 px-6 font-semibold" scope="col">Document Name</th>
                    <th className="py-4 px-6 font-semibold" scope="col">Category</th>
                    <th className="py-4 px-6 font-semibold" scope="col">Date Uploaded</th>
                    <th className="py-4 px-6 font-semibold" scope="col">File Size</th>
                    <th className="py-4 px-6 font-semibold" scope="col">Status</th>
                    <th className="py-4 px-6 font-semibold text-right" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-secondary font-body-md text-body-md">
                        <span className="material-symbols-outlined text-[32px] block mx-auto mb-2 text-outline">
                          folder_off
                        </span>
                        No documents found matching this view. Upload a document above to begin.
                      </td>
                    </tr>
                  ) : (
                    filteredDocuments.map((doc) => {
                      const { date, time } = formatDate(doc.created_at);
                      const isReady = doc.status === "ready";
                      const isSelected = selectedInspectorId === doc.document_id;
                      return (
                        <tr
                          key={doc.document_id}
                          onClick={() => setSelectedInspectorId(doc.document_id)}
                          className={`transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-surface-container-high/60"
                              : "hover:bg-surface-container-low/60"
                          }`}
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary flex-shrink-0">
                                <span className="material-symbols-outlined text-[20px]">
                                  {doc.filename.endsWith(".tiff") || doc.filename.endsWith(".jpeg") || doc.filename.endsWith(".jpg")
                                    ? "image"
                                    : "description"}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-body-md text-body-md font-semibold text-on-surface truncate">
                                  {doc.filename}
                                </p>
                                <p className="font-body-sm text-body-sm text-secondary">
                                  ID: #{doc.document_id.slice(0, 8)}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-6 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-md bg-surface-container text-primary font-label-sm text-label-sm font-medium">
                              {doc.document_type || "General Document"}
                            </span>
                          </td>

                          <td className="py-4 px-6 font-body-sm text-body-sm text-on-surface whitespace-nowrap">
                            {date} <span className="text-secondary ml-1">{time}</span>
                          </td>

                          <td className="py-4 px-6 font-body-sm text-body-sm text-secondary whitespace-nowrap">
                            {formatBytes(doc.file_size)}
                          </td>

                          <td className="py-4 px-6 whitespace-nowrap">
                            {isReady ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container font-label-sm text-label-sm text-primary font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low font-label-sm text-label-sm text-secondary font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                Processing
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div
                              className="inline-flex items-center justify-end gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => onSelectDocument(doc.document_id, "analysis-report")}
                                className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-medium transition-all shadow-xs"
                              >
                                View Report
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedInspectorId(doc.document_id)}
                                className="w-9 h-9 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container-low flex items-center justify-center transition-colors"
                                title="Inspect Extracted Metadata"
                              >
                                <span className="material-symbols-outlined text-[18px]">data_object</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="py-4 px-6 bg-surface-container-lowest flex items-center justify-between border-t border-outline-variant/10">
              <p className="font-body-sm text-body-sm text-secondary">
                Showing {filteredDocuments.length} of {documents.length} verified documents
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className="px-3.5 py-1.5 rounded-lg bg-surface-container-low text-secondary font-label-md text-label-md opacity-40 cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="px-3.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md font-medium transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* NEW SECTION: Document Metadata & Extracted Credentials Inspector */}
        {inspectorDoc && (
          <div className="bg-surface-container-lowest rounded-2xl p-6 lg:p-8 shadow-sm border border-outline-variant/20 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
                    Metadata Inspector
                  </span>
                  <span className="text-secondary text-xs">•</span>
                  <span className="text-secondary font-label-sm text-label-sm">
                    Doc ID: #{inspectorDoc.document_id}
                  </span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {inspectorDoc.filename}
                </h3>
              </div>

              {/* Sub-Tabs for Inspector */}
              <div className="inline-flex p-1 rounded-xl bg-surface-container-low border border-outline-variant/20 self-start md:self-center">
                <button
                  type="button"
                  onClick={() => setInspectorTab("credentials")}
                  className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-all ${
                    inspectorTab === "credentials"
                      ? "bg-surface-container-lowest text-primary font-semibold shadow-xs"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  Identified Credentials ({allEntities.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("layout")}
                  className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-all ${
                    inspectorTab === "layout"
                      ? "bg-surface-container-lowest text-primary font-semibold shadow-xs"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  Layout &amp; Font Metadata ({textEntities.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab("visual")}
                  className={`px-3.5 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-all ${
                    inspectorTab === "visual"
                      ? "bg-surface-container-lowest text-primary font-semibold shadow-xs"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  Signatures &amp; Visuals ({visualEntities.length})
                </button>
              </div>
            </div>

            {loadingInspector ? (
              <div className="py-12 text-center text-secondary font-body-sm">
                <span className="material-symbols-outlined text-[28px] animate-spin block mx-auto mb-2 text-primary">
                  refresh
                </span>
                Loading extracted metadata...
              </div>
            ) : (
              <div>
                {/* Tab A: Identified Credentials & Key Fields */}
                {inspectorTab === "credentials" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {textEntities.slice(0, 15).map((entity, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col justify-between gap-2"
                        >
                          <div>
                            <span className="text-[11px] uppercase tracking-wider text-secondary font-semibold block">
                              Field #{idx + 1} · {entity.text_type || "Body"}
                            </span>
                            <p className="font-body-md text-body-md font-semibold text-on-surface mt-1 break-words">
                              {entity.text}
                            </p>
                          </div>
                          <div className="flex items-center justify-between text-xs text-secondary pt-2 border-t border-outline-variant/10">
                            <span>Conf: {Math.round(entity.confidence * 100)}%</span>
                            <span>Size: {entity.font_size}px</span>
                            <span className="capitalize">{entity.alignment}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {textEntities.length === 0 && (
                      <p className="text-secondary text-center py-6">
                        No individual credential fields parsed yet.
                      </p>
                    )}
                  </div>
                )}

                {/* Tab B: Layout & Font Metadata Table */}
                {inspectorTab === "layout" && (
                  <div className="overflow-x-auto max-h-96 rounded-xl border border-outline-variant/20">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-surface-container-low sticky top-0 font-label-md text-label-md text-secondary">
                        <tr className="border-b border-outline-variant/20">
                          <th className="py-3 px-4">Line Text</th>
                          <th className="py-3 px-4">Font Size</th>
                          <th className="py-3 px-4">Text Type</th>
                          <th className="py-3 px-4">Alignment</th>
                          <th className="py-3 px-4">Coordinates [X, Y, W, H]</th>
                          <th className="py-3 px-4">Pixel Intensity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 font-body-sm text-body-sm text-on-surface">
                        {textEntities.map((ent, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-low/40">
                            <td className="py-2.5 px-4 font-medium max-w-xs truncate">{ent.text}</td>
                            <td className="py-2.5 px-4 text-secondary">{ent.font_size} px</td>
                            <td className="py-2.5 px-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                ent.text_type === "Heading"
                                  ? "bg-primary text-on-primary"
                                  : "bg-surface-container text-on-surface-variant"
                              }`}>
                                {ent.text_type}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 capitalize text-secondary">{ent.alignment}</td>
                            <td className="py-2.5 px-4 text-xs font-mono text-secondary">
                              [{ent.bounding_box.join(", ")}]
                            </td>
                            <td className="py-2.5 px-4 text-secondary">{ent.pixel_intensity ?? 128}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tab C: Signatures, Stamps & Logos */}
                {inspectorTab === "visual" && (
                  <div>
                    {visualEntities.length === 0 ? (
                      <div className="py-8 text-center bg-surface-container-low rounded-xl border border-outline-variant/20">
                        <span className="material-symbols-outlined text-[32px] text-primary block mx-auto mb-2">
                          verified
                        </span>
                        <p className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                          Standard Digital Text Layout
                        </p>
                        <p className="font-body-sm text-body-sm text-secondary max-w-md mx-auto mt-1">
                          No isolated non-text stamps or anomalous signature patches detected outside standard text blocks.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {visualEntities.map((elem, idx) => (
                          <div
                            key={idx}
                            className="p-5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed text-xs font-semibold">
                                {elem.text_type}
                              </span>
                              <span className="text-xs text-secondary">
                                Conf: {Math.round(elem.confidence * 100)}%
                              </span>
                            </div>
                            <p className="font-body-md text-body-md font-semibold text-on-surface">
                              {elem.text || `${elem.text_type} Element`}
                            </p>
                            <p className="text-xs font-mono text-secondary">
                              Bounding Box: [{elem.bounding_box.join(", ")}]
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
