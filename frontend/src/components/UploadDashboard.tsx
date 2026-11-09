"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  DocumentRecord,
  fetchDocuments,
  fetchDocument,
  uploadDocument,
  pollJob,
  formatBytes,
  API_BASE,
} from "@/lib/api";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Eye,
  Layers,
  KeyRound,
  Type,
  Stamp,
  Table as TableIcon,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  FileCheck,
  Info,
  Search,
} from "lucide-react";

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
  const [loadingInspector, setLoadingInspector] = useState(false);

  // Inspector tab & pagination states
  const [inspectorTab, setInspectorTab] = useState<string>("default");
  const [activePageNum, setActivePageNum] = useState<number>(1);
  const [activeSheetName, setActiveSheetName] = useState<string>("");
  const [sheetSearch, setSheetSearch] = useState<string>("");

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
          if (!isMounted) return;
          setInspectorDoc(data);
          setActivePageNum(1);
          if (!data) return;
          // Set initial sheet or tab
          if (data.spreadsheet_data?.sheets?.length) {
            setActiveSheetName(data.spreadsheet_data.sheets[0].name);
            setInspectorTab("grid");
          } else if (data.docx_data) {
            setInspectorTab("structure");
          } else if (data.json_info) {
            setInspectorTab("json");
          } else if ((data.total_pages && data.total_pages > 1) || data.file_type === "pdf") {
            setInspectorTab("pages");
          } else {
            setInspectorTab("credentials");
          }
        })
        .finally(() => {
          if (isMounted) setLoadingInspector(false);
        });
    });
    return () => {
      isMounted = false;
    };
  }, [selectedInspectorId]);

  // Clean up polling interval
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Upload handler with live status polling
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploadStatus(`Uploading ${file.name}...`);
    try {
      const response = await uploadDocument(file);
      setUploadStatus(`Uploaded. Dispatching multi-format forensics engine...`);

      // Begin polling job status
      const jobId = response.job_id;
      const startTime = Date.now();
      const MAX_POLL_TIME = 90000;

      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          if (Date.now() - startTime > MAX_POLL_TIME) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setUploadStatus("Processing timeout. File will appear once completed.");
            await reloadDocuments();
            return;
          }

          const statusData = await pollJob(jobId);
          if (statusData.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setUploadStatus("Forensic analysis completed!");
            await reloadDocuments();
            if (statusData.document_id) {
              setSelectedInspectorId(statusData.document_id);
            }
            setTimeout(() => setUploadStatus(""), 3500);
          } else if (statusData.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setUploadStatus(`Extraction notice: ${statusData.error || "File indexed with fallback metadata."}`);
            await reloadDocuments();
            setTimeout(() => setUploadStatus(""), 4500);
          } else {
            setUploadStatus(`Analyzing pages, layout & forensic data...`);
          }
        } catch {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setUploadStatus("");
          await reloadDocuments();
        }
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadStatus(`Upload failed: ${msg}`);
      setTimeout(() => setUploadStatus(""), 5000);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Metrics computation
  const totalDocs = documents.length;
  const verifiedReady = documents.filter((d) => d.status === "ready").length;
  const flaggedCount = documents.filter((d) => (d.pii_findings_count || 0) > 0).length;
  const totalEntities = useMemo(
    () => documents.reduce((acc, d) => acc + (d.total_entities || 0), 0),
    [documents]
  );

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      !searchFilter ||
      doc.filename.toLowerCase().includes(searchFilter.toLowerCase()) ||
      doc.document_type.toLowerCase().includes(searchFilter.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "ready" && doc.status === "ready") ||
      (statusFilter === "review" && (doc.pii_findings_count || 0) > 0);

    return matchesSearch && matchesStatus;
  });

  // Determine current document type
  const isSpreadsheet = useMemo(() => {
    if (!inspectorDoc) return false;
    const ext = inspectorDoc.filename.split(".").pop()?.toLowerCase();
    return Boolean(
      inspectorDoc.spreadsheet_data ||
      ext === "xlsx" ||
      ext === "xls" ||
      ext === "csv"
    );
  }, [inspectorDoc]);

  const isDocx = useMemo(() => {
    if (!inspectorDoc) return false;
    const ext = inspectorDoc.filename.split(".").pop()?.toLowerCase();
    return Boolean(inspectorDoc.docx_data || ext === "docx");
  }, [inspectorDoc]);

  const isJson = useMemo(() => {
    if (!inspectorDoc) return false;
    const ext = inspectorDoc.filename.split(".").pop()?.toLowerCase();
    return Boolean(inspectorDoc.json_info || ext === "json");
  }, [inspectorDoc]);

  const isPdf = useMemo(() => {
    if (!inspectorDoc) return false;
    const ext = inspectorDoc.filename.split(".").pop()?.toLowerCase();
    return ext === "pdf" || (inspectorDoc.total_pages && inspectorDoc.total_pages > 1);
  }, [inspectorDoc]);

  // Entities split for active inspector
  const allEntities = inspectorDoc?.entities || [];
  const textEntities = allEntities.filter((e) => e.text_type === "Heading" || e.text_type === "Body");
  const visualEntities = allEntities.filter(
    (e) => e.text_type === "Stamp" || e.text_type === "Signature" || e.text_type === "Logo"
  );
  const credentialEntities = allEntities.filter((e) => e.pii_tagged || e.confidence > 0.85);

  // Active page object for multi-page documents
  const activePageRecord = useMemo(() => {
    if (!inspectorDoc?.pages || inspectorDoc.pages.length === 0) return null;
    return (
      inspectorDoc.pages.find((p) => p.page_number === activePageNum) ||
      inspectorDoc.pages[0]
    );
  }, [inspectorDoc, activePageNum]);

  // Active spreadsheet sheet
  const activeSheet = useMemo(() => {
    if (!inspectorDoc?.spreadsheet_data?.sheets) return null;
    return (
      inspectorDoc.spreadsheet_data.sheets.find((s) => s.name === activeSheetName) ||
      inspectorDoc.spreadsheet_data.sheets[0]
    );
  }, [inspectorDoc, activeSheetName]);

  // Filtered rows in active sheet
  const filteredSheetRows = useMemo(() => {
    if (!activeSheet?.sample_rows) return [];
    if (!sheetSearch.trim()) return activeSheet.sample_rows;
    const q = sheetSearch.toLowerCase();
    return activeSheet.sample_rows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(q))
    );
  }, [activeSheet, sheetSearch]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 4-Column KPI Stat Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-zinc-800 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Documents</span>
            <span className="p-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <FileText className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mt-2">
            {totalDocs}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">In forensic corpus</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Verified Original</span>
            <span className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mt-2">
            {verifiedReady}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">Pass integrity checks</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Flagged for Review</span>
            <span className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mt-2">
            {flaggedCount}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">Anomalies or credentials</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Extracted Entities</span>
            <span className="p-1 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <Layers className="w-3.5 h-3.5" />
            </span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mt-2">
            {totalEntities}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">Indexed in ChromaDB</p>
        </div>
      </div>

      {/* Dashed Universal Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group relative flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          isDragging
            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/50"
        } shadow-2xs`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.xlsx,.xls,.csv,.docx,.txt,.json,.md"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3 group-hover:scale-105 transition-transform">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Upload Forensic Document or Dataset
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mt-1 mb-4 leading-relaxed">
          Accepts any file: Multi-page PDFs, Excel spreadsheets (.xlsx, .csv), Word docs (.docx), marks cards, high-res photos, or JSON
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Browse Files
          </button>
        </div>

        {uploadStatus && (
          <div className="mt-4 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            {uploadStatus}
          </div>
        )}
      </div>

      {/* Recent Uploads Table Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs overflow-hidden">
        {/* Table Filter Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Audited Files &amp; Ingestion Queue
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Multi-format corpus processed with full-page scanning &amp; tabular extraction
            </p>
          </div>

          {/* Segmented Filter */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg self-start sm:self-auto">
            {(
              [
                { id: "all", label: "All Files" },
                { id: "ready", label: "Verified Ready" },
                { id: "review", label: "Needs Review" },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === filter.id
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Documents Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/75 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-medium">
                <th className="py-3 px-5">Document Name</th>
                <th className="py-3 px-5">Format &amp; Scope</th>
                <th className="py-3 px-5">Classification</th>
                <th className="py-3 px-5">Entities</th>
                <th className="py-3 px-5">File Size</th>
                <th className="py-3 px-5">Integrity</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-normal">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400">
                    No matching files in ingestion queue.
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => {
                  const isSelected = selectedInspectorId === doc.document_id;
                  const ext = doc.filename.split(".").pop()?.toLowerCase();
                  const isDocSpreadsheet = ext === "xlsx" || ext === "xls" || ext === "csv";

                  return (
                    <tr
                      key={doc.document_id}
                      onClick={() => setSelectedInspectorId(doc.document_id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-50/40 dark:bg-blue-950/20"
                          : "hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg border ${
                              isDocSpreadsheet
                                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400"
                                : ext === "pdf"
                                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400"
                                : "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
                            }`}
                          >
                            {isDocSpreadsheet ? (
                              <FileSpreadsheet className="w-4 h-4" />
                            ) : ext === "docx" ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <FileCheck className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                              {doc.filename}
                            </p>
                            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                              {doc.document_id.slice(0, 14)}...
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {ext || "DOC"}
                          {doc.total_pages > 1 && (
                            <span className="text-blue-600 dark:text-blue-400 font-normal">
                              ({doc.total_pages} {isDocSpreadsheet ? "sheets" : "pages"})
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-zinc-600 dark:text-zinc-400">
                        <span className="inline-block px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-700 dark:text-zinc-300">
                          {doc.document_type || "General Document"}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-zinc-600 dark:text-zinc-400 font-mono">
                        {doc.total_entities}
                      </td>

                      <td className="py-3.5 px-5 text-zinc-500 font-mono">
                        {formatBytes(doc.file_size)}
                      </td>

                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            doc.status === "ready"
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          <span
                            className={`w-1 h-1 rounded-full ${
                              doc.status === "ready" ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                          />
                          {doc.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onSelectDocument(doc.document_id, "analysis-report")}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            Report
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
      </div>

      {/* DYNAMIC FORMAT-SPECIFIC FORENSIC INSPECTOR */}
      {inspectorDoc && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs p-5 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {isSpreadsheet
                    ? "Spreadsheet Data Studio"
                    : isPdf
                    ? "Multi-Page Document Suite"
                    : isDocx
                    ? "Word Document Inspector"
                    : isJson
                    ? "Structured JSON Inspector"
                    : "Forensic Inspector"}
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span className="text-xs text-zinc-500 font-mono">{inspectorDoc.document_id.slice(0, 12)}...</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {inspectorDoc.filename}
              </h3>
            </div>

            {/* Specialized Format-Aware Sub-Tabs */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg self-start sm:self-auto overflow-x-auto">
              {isSpreadsheet ? (
                <>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("grid")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "grid"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <TableIcon className="w-3 h-3" />
                    Data Grid ({activeSheet?.row_count || 0} rows)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("formulas")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "formulas"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    Formula Audit ({inspectorDoc.spreadsheet_data?.total_formulas || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("credentials")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "credentials"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <KeyRound className="w-3 h-3" />
                    Credentials ({credentialEntities.length})
                  </button>
                </>
              ) : isPdf ? (
                <>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("pages")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "pages"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    Page Explorer ({inspectorDoc.total_pages} pgs)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("credentials")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "credentials"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <KeyRound className="w-3 h-3" />
                    Credentials ({credentialEntities.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("catalog")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "catalog"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <Info className="w-3 h-3" />
                    PDF Metadata
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("layout")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "layout"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <Type className="w-3 h-3" />
                    Typography
                  </button>
                </>
              ) : isDocx ? (
                <>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("structure")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "structure"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    Paragraphs ({inspectorDoc.docx_data?.paragraph_count || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("tables")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "tables"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <TableIcon className="w-3 h-3" />
                    Tables ({inspectorDoc.docx_data?.table_count || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("credentials")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "credentials"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <KeyRound className="w-3 h-3" />
                    Credentials
                  </button>
                </>
              ) : (
                /* Standard Image / Text */
                <>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("credentials")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "credentials"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <KeyRound className="w-3 h-3" />
                    Credentials ({credentialEntities.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("layout")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "layout"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <Type className="w-3 h-3" />
                    Typography ({textEntities.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("visual")}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      inspectorTab === "visual"
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    }`}
                  >
                    <Stamp className="w-3 h-3" />
                    Signatures &amp; Visuals ({visualEntities.length})
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Inspector Content */}
          {loadingInspector ? (
            <div className="py-12 text-center text-xs text-zinc-400">Loading extracted attributes...</div>
          ) : (
            <div>
              {/* ------------------------------------------------------------- */}
              {/* SPREADSHEET TAB 1: DATA GRID TABLE                            */}
              {/* ------------------------------------------------------------- */}
              {isSpreadsheet && inspectorTab === "grid" && (
                <div className="space-y-3">
                  {/* Sheet Selector & Search Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {inspectorDoc.spreadsheet_data?.sheets.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => setActiveSheetName(s.name)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            activeSheet?.name === s.name
                              ? "bg-emerald-600 text-white shadow-2xs"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200"
                          }`}
                        >
                          {s.name} ({s.row_count} rows)
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search sheet rows..."
                        value={sheetSearch}
                        onChange={(e) => setSheetSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Sheet Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Active Sheet</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{activeSheet?.name || "Sheet"}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Row Count</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{activeSheet?.row_count || 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Column Count</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{activeSheet?.col_count || 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Formulas Detected</span>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{activeSheet?.formula_count || 0}</p>
                    </div>
                  </div>

                  {/* Data Grid */}
                  <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg max-h-96 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800 z-10">
                        <tr className="border-b border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                          <th className="py-2 px-3 w-12 font-mono text-[10px] text-zinc-400 border-r border-zinc-200 dark:border-zinc-700">#</th>
                          {activeSheet?.headers && activeSheet.headers.length > 0 ? (
                            activeSheet.headers.map((h, i) => (
                              <th key={i} className="py-2 px-3 font-semibold whitespace-nowrap border-r border-zinc-200 dark:border-zinc-700 last:border-r-0">
                                {h || `Col ${i + 1}`}
                              </th>
                            ))
                          ) : (
                            <th className="py-2 px-3">Data</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                        {filteredSheetRows.length === 0 ? (
                          <tr>
                            <td colSpan={(activeSheet?.headers?.length || 1) + 1} className="py-8 text-center text-zinc-400">
                              No matching rows found in this sheet.
                            </td>
                          </tr>
                        ) : (
                          filteredSheetRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                              <td className="py-2 px-3 font-mono text-[10px] text-zinc-400 border-r border-zinc-100 dark:border-zinc-800">
                                {rIdx + 1}
                              </td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="py-2 px-3 truncate max-w-xs border-r border-zinc-100 dark:border-zinc-800 last:border-r-0 font-mono text-[11px] text-zinc-800 dark:text-zinc-200">
                                  {cell || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SPREADSHEET TAB 2: FORMULA AUDIT */}
              {isSpreadsheet && inspectorTab === "formulas" && (
                <div className="space-y-3">
                  {inspectorDoc.spreadsheet_data?.anomalies && inspectorDoc.spreadsheet_data.anomalies.length > 0 ? (
                    <div className="space-y-2">
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Security Warning: Found {inspectorDoc.spreadsheet_data.anomalies.length} suspicious external references or executable formula patterns.</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {inspectorDoc.spreadsheet_data.anomalies.map((anom, idx) => (
                          <div key={idx} className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 text-xs space-y-1">
                            <div className="flex items-center justify-between font-semibold text-rose-700 dark:text-rose-400">
                              <span>{anom.type}</span>
                              <span className="font-mono text-[10px]">{anom.sheet}!{anom.coordinate}</span>
                            </div>
                            <p className="font-mono text-zinc-800 dark:text-zinc-200 bg-white/70 dark:bg-zinc-900/70 p-1.5 rounded border border-rose-200 dark:border-rose-800">
                              {anom.formula}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                      <p className="font-medium text-zinc-700 dark:text-zinc-300">Clean Formula Environment</p>
                      <p>No dangerous external links, shell executions, or formula injection vectors detected.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* PDF TAB 1: MULTI-PAGE EXPLORER                                */}
              {/* ------------------------------------------------------------- */}
              {isPdf && inspectorTab === "pages" && (
                <div className="space-y-4">
                  {/* Multi-Page Pagination Bar */}
                  <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={activePageNum <= 1}
                        onClick={() => setActivePageNum((p) => Math.max(1, p - 1))}
                        className="p-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-100"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Page {activePageNum} of {inspectorDoc.total_pages}
                      </span>

                      <button
                        type="button"
                        disabled={activePageNum >= inspectorDoc.total_pages}
                        onClick={() => setActivePageNum((p) => Math.min(inspectorDoc.total_pages, p + 1))}
                        className="p-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-100"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>Method: <span className="font-mono text-zinc-700 dark:text-zinc-300">{activePageRecord?.extraction_method || "Native PyMuPDF"}</span></span>
                      <span>Words: <span className="font-mono text-zinc-700 dark:text-zinc-300">{activePageRecord?.word_count || 0}</span></span>
                    </div>
                  </div>

                  {/* Page Preview + Extracted Text Split View */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Left: Rendered Page Preview */}
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-col items-center justify-center min-h-[350px]">
                      {activePageRecord?.preview_url ? (
                        <div className="relative group max-h-[420px] overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 shadow-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              activePageRecord.preview_url.startsWith("http://") ||
                              activePageRecord.preview_url.startsWith("https://")
                                ? activePageRecord.preview_url
                                : `${API_BASE}${activePageRecord.preview_url}`
                            }
                            alt={`Page ${activePageNum}`}
                            className="max-h-[420px] object-contain"
                          />
                        </div>
                      ) : (
                        <div className="text-center text-xs text-zinc-400">
                          <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                          <p>Digital vector page extracted directly</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Extracted Text for this exact page */}
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-col">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Page {activePageNum} Extracted Text &amp; OCR Tokens
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {activePageRecord?.entities?.length || 0} entities
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap overflow-y-auto max-h-[360px] leading-relaxed p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-800">
                        {activePageRecord?.text || inspectorDoc.raw_text?.slice(0, 2000) || "No text available for this page."}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PDF TAB 3: METADATA CATALOG */}
              {isPdf && inspectorTab === "catalog" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {inspectorDoc.pdf_metadata && Object.keys(inspectorDoc.pdf_metadata).length > 0 ? (
                    Object.entries(inspectorDoc.pdf_metadata).map(([key, val]) => (
                      <div key={key} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850/50">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400">{key}</span>
                        <p className="font-mono text-zinc-900 dark:text-zinc-100 truncate mt-0.5">{String(val)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-8 text-center text-xs text-zinc-400">
                      Standard PDF stream with zero embedded XMP catalog tampering.
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* WORD DOCX TAB: STRUCTURE & TABLES                             */}
              {/* ------------------------------------------------------------- */}
              {isDocx && inspectorTab === "structure" && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Author</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{String(inspectorDoc.docx_data?.properties?.author || "Unknown")}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Revision</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{String(inspectorDoc.docx_data?.properties?.revision || 1)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Paragraphs</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{inspectorDoc.docx_data?.paragraph_count || 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">Embedded Tables</span>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">{inspectorDoc.docx_data?.table_count || 0}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 rounded-lg border border-zinc-200 dark:border-zinc-800 font-mono text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">
                    {inspectorDoc.raw_text || "No text available."}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* UNIVERSAL TAB: CREDENTIALS (ACROSS ANY FORMAT)                */}
              {/* ------------------------------------------------------------- */}
              {inspectorTab === "credentials" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {credentialEntities.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-xs text-zinc-400">
                      No high-confidence credential fields flagged in this record.
                    </div>
                  ) : (
                    credentialEntities.map((cred, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span className="uppercase tracking-wider font-semibold">
                            {cred.pii_type || cred.text_type}
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                            {Math.round(cred.confidence * 100)}%
                          </span>
                        </div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{cred.text}</p>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                          <span>Size: {cred.font_size}pt</span>
                          <span className="font-mono">[{cred.bounding_box.join(", ")}]</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* UNIVERSAL TAB: TYPOGRAPHY & LAYOUT                            */}
              {/* ------------------------------------------------------------- */}
              {inspectorTab === "layout" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-400 text-[11px]">
                        <th className="py-2 px-3">Text Sample</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Font Size</th>
                        <th className="py-2 px-3">Alignment</th>
                        <th className="py-2 px-3">Intensity</th>
                        <th className="py-2 px-3">Bounding Box</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                      {textEntities.slice(0, 10).map((entity, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                          <td className="py-2.5 px-3 font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-xs">
                            {entity.text}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 font-mono">
                              {entity.text_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">{entity.font_size}pt</td>
                          <td className="py-2.5 px-3 capitalize">{entity.alignment}</td>
                          <td className="py-2.5 px-3 font-mono">{entity.pixel_intensity}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                            [{entity.bounding_box.join(", ")}]
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* IMAGE TAB: SIGNATURES & VISUALS                               */}
              {/* ------------------------------------------------------------- */}
              {inspectorTab === "visual" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visualEntities.length === 0 ? (
                      <div className="col-span-full py-8 text-center text-xs text-zinc-400">
                        No standalone non-text stamps or signatory bounding boxes registered.
                      </div>
                    ) : (
                      visualEntities.map((vis, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <Stamp className="w-3.5 h-3.5 text-blue-600" />
                              {vis.text_type} Region
                            </span>
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                              {Math.round(vis.confidence * 100)}% match
                            </span>
                          </div>
                          <p className="text-zinc-600 dark:text-zinc-400 text-xs italic">&ldquo;{vis.text}&rdquo;</p>
                          <p className="text-[10px] text-zinc-400 font-mono pt-1">
                            Coordinates: [{vis.bounding_box.join(", ")}]
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
