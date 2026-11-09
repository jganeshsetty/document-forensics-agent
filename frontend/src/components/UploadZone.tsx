"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE, getAuthHeaders } from "@/lib/api";

interface JobResult {
  job_id: string;
  document_id: string;
  filename?: string;
  status: string;
  result?: {
    document_type: string;
    template_signature: string;
    total_pages: number;
    total_entities: number;
    total_rag_chunks: number;
    pii_findings_count: number;
  };
  error?: string;
}

export default function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [jobResult, setJobResult] = useState<JobResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJob = useCallback(async (jobId: string) => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();

        if (data.status === "completed") {
          setJobResult(data);
          setUploadProgress("Complete");
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === "failed") {
          setJobResult(data);
          setUploadProgress("Failed");
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    };
    poll();
    pollingRef.current = setInterval(poll, 2000);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setUploadProgress("Uploading...");
    setJobResult(null);

    try {
      const res = await fetch(`${API_BASE}/extract`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      const data = await res.json();

      if (data.job_id) {
        setUploadProgress("Processing in background...");
        pollJob(data.job_id);
      }
    } catch (err) {
      setUploadProgress(`Error: ${err}`);
    }
  }, [pollJob]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div
        className={`upload-zone relative p-12 text-center cursor-pointer transition-all duration-300 ${isDragging ? "drag-active" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpeg,.jpg,.png,.tiff,.bmp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <AnimatePresence mode="wait">
          {!jobResult ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="w-18 h-18 mx-auto rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-red-500/10 transition-colors">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400 group-hover:text-red-300 transition-colors">
                  <path d="M16 4v16M8 12l8-8 8 8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 24v2a2 2 0 002 2h20a2 2 0 002-2v-2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p className="text-lg font-medium text-gray-100">
                  Drop document here or click to browse
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  PDF, JPEG, PNG, TIFF up to 200MB
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className={`w-18 h-18 mx-auto rounded-2xl flex items-center justify-center ${
                jobResult.error ? "bg-red-500/10" : "bg-green-500/10"
              }`}>
                {jobResult.error ? (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                    <circle cx="16" cy="16" r="13"/>
                    <path d="M16 9v7M16 19v1" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-green-400">
                    <path d="M7 16l5 5L25 7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <div>
                <p className="text-lg font-medium text-gray-100">
                  {jobResult.error ? "Processing Failed" : "Document Processed"}
                </p>
                <p className="text-sm text-gray-500 mt-1">{jobResult.error || jobResult.filename}</p>
              </div>
              {jobResult.result && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-md mx-auto">
                  {[
                    { label: "Type", value: jobResult.result.document_type, icon: (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M11 4h1a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M7 10h6M7 14h4" strokeLinecap="round"/>
                      </svg>
                    )},
                    { label: "Pages", value: String(jobResult.result.total_pages), icon: (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 3h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2z" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M9 3v8" strokeLinecap="round"/>
                      </svg>
                    )},
                    { label: "Entities", value: String(jobResult.result.total_entities), icon: (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M7 3v8M3 7h8" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="7" cy="11" r="1" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="7" cy="3" r="1" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )},
                    { label: "Chunks", value: String(jobResult.result.total_rag_chunks), icon: (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="2" width="4" height="10" rx="1" strokeLinecap="round" strokeLinejoin="round"/>
                        <rect x="8" y="2" width="4" height="10" rx="1" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )},
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="glass-strong p-4 text-center group-hover:border-white/12 transition-colors">
                      <div className="w-6 h-6 mx-auto mb-2 flex items-center justify-center text-gray-500 group-hover:text-gray-300 transition-colors">{icon}</div>
                      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
                      <p className="text-sm font-semibold text-gray-100 truncate">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {uploadProgress && !jobResult && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex items-center justify-center gap-3"
          >
            <span className="pulse-dot red" />
            <span className="text-sm text-gray-400">{uploadProgress}</span>
          </motion.div>
        )}
      </div>

      {jobResult?.result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                <path d="M12 4h1a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 10h6M7 14h4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-100">{jobResult.filename}</p>
              <p className="text-xs text-gray-500 mt-0.5">ID: {jobResult.document_id}</p>
            </div>
          </div>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("nav-tab", { detail: "dossier" }));
            }}
            className="px-5 py-2.5 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all duration-200"
          >
            View Dossier
          </button>
        </motion.div>
      )}
    </div>
  );
}