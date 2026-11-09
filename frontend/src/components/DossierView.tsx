"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RiskGauge from "./RiskGauge";
import { API_BASE, getAuthHeaders, riskColor, riskLabel, type InvestigationDossier } from "@/lib/api";

export default function DossierView() {
  const [docIds, setDocIds] = useState<string[]>([""]);
  const [dossier, setDossier] = useState<InvestigationDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);

  const addDocId = () => setDocIds([...docIds, ""]);
  const removeDocId = (idx: number) => setDocIds(docIds.filter((_, i) => i !== idx));
  const updateDocId = (idx: number, val: string) => {
    const next = [...docIds];
    next[idx] = val;
    setDocIds(next);
  };

  const analyze = useCallback(async () => {
    const ids = docIds.filter(Boolean);
    if (!ids.length) return;
    setLoading(true);
    setError(null);
    setDossier(null);
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ document_ids: ids }),
      });
      const data = await res.json();
      if (res.ok) {
        setDossier(data);
      } else {
        setError(data.error || "Analysis failed");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [docIds]);

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="glass-strong p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
            <path d="M11 4h1a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 10h6M7 14h4" strokeLinecap="round"/>
          </svg>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Document IDs for Analysis</h2>
        </div>
        <div className="space-y-3">
          {docIds.map((id, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                placeholder="Enter document ID..."
                value={id}
                onChange={(e) => updateDocId(idx, e.target.value)}
                className="flex-1 bg-[#0f0f13] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all"
              />
              {docIds.length > 1 && (
                <button
                  onClick={() => removeDocId(idx)}
                  className="p-3 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-xl"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addDocId}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M7 1v12M1 7h12" strokeLinecap="round"/>
            </svg>
            Add another document
          </button>
        </div>
        <button
          onClick={analyze}
          disabled={loading || !docIds.filter(Boolean).length}
          className="mt-5 w-full px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:bg-gray-800 disabled:text-gray-500 text-white text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
        >
          {loading && <span className="pulse-dot white" />}
          {loading ? "Analyzing..." : "Run Forensic Analysis"}
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-strong p-4 border border-red-500/20 glow-red"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-red-400 flex-shrink-0">
                <circle cx="8" cy="8" r="7"/>
                <path d="M8 5v3M8 11v1" strokeLinecap="round"/>
              </svg>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dossier && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Composite Risk Score */}
            <div className="glass-strong p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
              <div className="relative w-36 h-36 sm:w-40 sm:h-40">
                <RiskGauge score={dossier.composite_risk_score} size={160} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="text-sm font-medium text-gray-500 mb-2">Composite Risk Score</p>
                <p className="text-4xl sm:text-5xl font-bold" style={{ color: riskColor(dossier.composite_risk_score) }}>
                  {dossier.composite_risk_score}/100
                </p>
                <p className="text-sm mt-2" style={{ color: riskColor(dossier.composite_risk_score) }}>
                  <span className="badge" style={{
                    background: riskColor(dossier.composite_risk_score).replace("rgb", "rgba").replace(")", ",0.12)").replace(")", ",0.12)"),
                    color: riskColor(dossier.composite_risk_score),
                    borderColor: riskColor(dossier.composite_risk_score)
                  }}>
                    {riskLabel(dossier.composite_risk_score)}
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-4">
                  Dossier ID: <span className="font-mono text-gray-400">{dossier.dossier_id}</span>
                </p>
              </div>
              <div className="text-xs text-gray-500 text-right sm:text-left">
                <p className="font-medium text-gray-400">Documents</p>
                <p className="text-gray-100 text-lg font-semibold mt-1">{dossier.analyzed_documents.length}</p>
              </div>
            </div>

            {/* Cross Verification */}
            {dossier.cross_verification && (
              <div className="glass-strong p-6">
                <div className="flex items-center gap-2 mb-5">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-400">
                    <path d="M9 3v12M3 9h12" strokeLinecap="round"/>
                    <circle cx="9" cy="9" r="5" strokeLinecap="round"/>
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Cross-Verification Analysis</h3>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed mb-5">
                  {dossier.cross_verification.auditor_summary}
                </p>
                {dossier.cross_verification.flagged_discrepancies.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2">Flagged Discrepancies</p>
                    {dossier.cross_verification.flagged_discrepancies.map((d, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex gap-3 items-start p-4 bg-red-500/5 border border-red-500/15 rounded-xl"
                      >
                        <div className="w-2 h-2 rounded-full bg-red-400 mt-2.5 flex-shrink-0 animate-pulse" />
                        <p className="text-sm text-gray-300">{d}</p>
                      </motion.div>
                    ))}
                  </div>
                )}
                {dossier.cross_verification.metadata_warnings.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-2">Metadata Warnings</p>
                    {dossier.cross_verification.metadata_warnings.map((w, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex gap-3 items-start p-4 bg-orange-500/5 border border-orange-500/15 rounded-xl"
                      >
                        <div className="w-2 h-2 rounded-full bg-orange-400 mt-2.5 flex-shrink-0" />
                        <p className="text-sm text-gray-400">{w}</p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ELA Visual Forensics */}
            {dossier.visual_forensics_ela.length > 0 && (
              <div className="glass-strong p-6">
                <div className="flex items-center gap-2 mb-5">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-400">
                    <path d="M9 2v14M2 9h14" strokeLinecap="round"/>
                    <circle cx="9" cy="9" r="6" strokeLinecap="round"/>
                  </svg>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Visual Forensics — Error Level Analysis</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {dossier.visual_forensics_ela.map((report, idx) => (
                    report.ela_analysis ? (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          report.ela_analysis.tampering_detected
                            ? "border-red-500/20 bg-red-500/5 hover:border-red-500/40 hover:bg-red-500/10"
                            : "border-green-500/20 bg-green-500/5 hover:border-green-500/40 hover:bg-green-500/10"
                        }`}
                        onClick={() => setSelectedRegion(selectedRegion === idx ? null : idx)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-200 truncate">
                            {report.document_id}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-full ${
                            report.ela_analysis.tampering_detected
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-green-500/20 text-green-400 border border-green-500/30"
                          }`}>
                            {report.ela_analysis.tampering_detected ? "Tampering Detected" : "Clean"}
                          </span>
                        </div>
                        <div className="space-y-2 text-xs text-gray-500">
                          <div className="flex justify-between">
                            <span>Tampering Area</span>
                            <span className="text-gray-300 font-mono">{report.ela_analysis.tampering_area_percentage}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Suspicious Regions</span>
                            <span className="text-gray-300 font-mono">{report.ela_analysis.suspicious_regions_count}</span>
                          </div>
                        </div>
                        {selectedRegion === idx && report.ela_analysis.suspicious_regions.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-3 pt-3 border-t border-white/5"
                          >
                            <p className="text-xs text-gray-500 mb-2">Top Suspicious Regions</p>
                            {report.ela_analysis.suspicious_regions.slice(0, 5).map((region, ri) => (
                              <div key={ri} className="flex justify-between text-xs text-gray-600 py-1.5">
                                <span>Region {ri + 1}: [{region.bounding_box.join(",")}]</span>
                                <span className="font-mono">variance: {region.variance}</span>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    ) : (
                      <div key={idx} className="p-4 rounded-xl border border-orange-500/15 bg-orange-500/5">
                        <div className="flex items-center gap-2 text-sm text-orange-400/80">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="7" cy="7" r="6"/>
                            <path d="M7 4v6M4 7h6" strokeLinecap="round"/>
                          </svg>
                          {report.error || "No ELA data available"}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}