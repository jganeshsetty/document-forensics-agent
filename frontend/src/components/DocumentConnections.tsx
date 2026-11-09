"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DocumentRecord, DocumentEntity, fetchDocuments, fetchDocument } from "@/lib/api";
import MindmapView from "@/components/MindmapView";
import {
  Network,
  Folder,
  FileText,
  KeyRound,
  Stamp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Search,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
  RotateCw,
} from "lucide-react";

interface DocumentConnectionsProps {
  documents?: DocumentRecord[];
  onSelectDocument?: (docId: string) => void;
}

type SelectedNodeItem =
  | { type: "root" }
  | { type: "category"; name: string; count: number }
  | { type: "document"; doc: DocumentRecord }
  | { type: "entity"; entity: DocumentEntity; docName: string; docId: string };

export default function DocumentConnections({
  documents: initialDocs = [],
  onSelectDocument,
}: DocumentConnectionsProps) {
  const [docs, setDocs] = useState<DocumentRecord[]>(initialDocs);
  const [loading, setLoading] = useState(false);
  const [isError, setIsError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "mindmap">("tree");
  const [zoom, setZoom] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchNodeQuery, setSearchNodeQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<SelectedNodeItem | null>(null);
  const [fullDocsMap, setFullDocsMap] = useState<Record<string, DocumentRecord>>({});

  // Reload function
  const reloadMapData = () => {
    setLoading(true);
    setIsError(null);
    fetchDocuments()
      .then((list) => {
        setDocs(list);
        if (list.length > 0) {
          setSelectedItem({ type: "document", doc: list[0] });
          const firstCat = list[0].document_type || "General Document";
          setExpandedNodes({
            [`cat-${firstCat}`]: true,
            [`doc-${list[0].document_id}`]: true,
          });
          fetchDocument(list[0].document_id).then((fullDoc) => {
            if (fullDoc) {
              setFullDocsMap((prev) => ({ ...prev, [fullDoc.document_id]: fullDoc }));
              setSelectedItem({ type: "document", doc: fullDoc });
            }
          });
        }
      })
      .catch((err) => {
        setIsError(err instanceof Error ? err.message : "Failed to load document knowledge map");
      })
      .finally(() => setLoading(false));
  };

  // Fetch documents if not passed
  useEffect(() => {
    let isMounted = true;
    if (initialDocs.length === 0) {
      Promise.resolve().then(() => {
        if (!isMounted) return;
        setLoading(true);
        setIsError(null);
        fetchDocuments()
          .then((list) => {
            if (!isMounted) return;
            setDocs(list);
            if (list.length > 0) {
              setSelectedItem({ type: "document", doc: list[0] });
              const firstCat = list[0].document_type || "General Document";
              setExpandedNodes({
                [`cat-${firstCat}`]: true,
                [`doc-${list[0].document_id}`]: true,
              });
              fetchDocument(list[0].document_id).then((fullDoc) => {
                if (isMounted && fullDoc) {
                  setFullDocsMap((prev) => ({ ...prev, [fullDoc.document_id]: fullDoc }));
                  setSelectedItem({ type: "document", doc: fullDoc });
                }
              });
            }
          })
          .catch((err) => {
            if (isMounted) setIsError(err instanceof Error ? err.message : "Network error");
          })
          .finally(() => {
            if (isMounted) setLoading(false);
          });
      });
    } else {
      Promise.resolve().then(() => {
        if (!isMounted) return;
        setDocs(initialDocs);
        if (initialDocs.length > 0) {
          setSelectedItem({ type: "document", doc: initialDocs[0] });
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [initialDocs]);

  const handleSelectDoc = async (doc: DocumentRecord) => {
    if (!fullDocsMap[doc.document_id]) {
      try {
        const full = await fetchDocument(doc.document_id);
        if (full) {
          setFullDocsMap((prev) => ({ ...prev, [doc.document_id]: full }));
          setSelectedItem({ type: "document", doc: full });
        } else {
          setSelectedItem({ type: "document", doc });
        }
      } catch {
        setSelectedItem({ type: "document", doc });
      }
    } else {
      setSelectedItem({ type: "document", doc: fullDocsMap[doc.document_id] });
    }
  };

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    docs.forEach((d) => {
      allExpanded[`cat-${d.document_type || "General Document"}`] = true;
      allExpanded[`doc-${d.document_id}`] = true;
    });
    setExpandedNodes(allExpanded);
  };

  // Group by categories
  const categories = useMemo(() => {
    const map: Record<string, DocumentRecord[]> = {};
    docs.forEach((d) => {
      const cat = d.document_type || "General Document";
      if (!map[cat]) map[cat] = [];
      map[cat].push(d);
    });
    return map;
  }, [docs]);

  const categoryNames = Object.keys(categories);
  const totalEntities = docs.reduce((acc, d) => acc + (d.total_entities || 0), 0);

  const filteredCategories = useMemo(() => {
    let base = categories;
    if (filterCategory !== "all") {
      base = { [filterCategory]: categories[filterCategory] || [] };
    }
    if (!searchNodeQuery.trim()) return base;

    const q = searchNodeQuery.toLowerCase();
    const result: Record<string, DocumentRecord[]> = {};
    Object.entries(base).forEach(([cat, catDocs]) => {
      const matching = catDocs.filter(
        (d) => d.filename.toLowerCase().includes(q) || cat.toLowerCase().includes(q)
      );
      if (matching.length > 0) result[cat] = matching;
    });
    return result;
  }, [categories, filterCategory, searchNodeQuery]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header & Graph Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Interactive Forensic Map
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <span className="text-xs text-zinc-500">
              {docs.length} Documents · {totalEntities} Extracted Nodes
            </span>
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
            Document &amp; Entity Knowledge Map
          </h2>
        </div>

        {/* Segmented Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "tree"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              Tree Map
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mindmap")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === "mindmap"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              Radial Graph
            </button>
          </div>

          {/* Search Node */}
          <div className="relative w-40 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchNodeQuery}
              onChange={(e) => setSearchNodeQuery(e.target.value)}
              placeholder="Filter nodes..."
              className="w-full h-8 pl-8 pr-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Category Filter */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-8 px-2.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-600"
          >
            <option value="all">All Groups ({categoryNames.length})</option>
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Expand All */}
          <button
            type="button"
            onClick={expandAll}
            className="px-2.5 h-8 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 rounded-lg transition-colors shadow-2xs"
          >
            Expand All
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
              className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono text-zinc-600 dark:text-zinc-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
              className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="w-6 h-6 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded"
              title="Reset"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split: Interactive Dot-Grid Canvas (Left) & Inspector Drawer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Canvas Area */}
        <div className="lg:col-span-8 bg-zinc-50/70 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 min-h-[580px] overflow-auto relative shadow-2xs">
          {/* Efferd Adaptable Dot-Grid SVG Pattern */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
            <defs>
              <pattern id="efferd-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" className="fill-zinc-400 dark:fill-zinc-700" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#efferd-dots)" />
          </svg>

          {isError ? (
            <div className="relative py-28 text-center text-xs text-rose-600 dark:text-rose-400 flex flex-col items-center justify-center gap-2 z-10">
              <AlertTriangle className="w-7 h-7 text-rose-500 mb-1" />
              <span className="font-semibold text-sm">Failed to Load Knowledge Graph</span>
              <p className="text-zinc-500 max-w-sm">{isError}</p>
              <button
                type="button"
                onClick={reloadMapData}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-2xs hover:bg-zinc-100 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry Connection
              </button>
            </div>
          ) : viewMode === "mindmap" ? (
            <div className="relative z-10 w-full">
              <MindmapView
                filename={selectedItem?.type === "document" ? selectedItem.doc.filename : docs[0]?.filename}
                entities={
                  selectedItem?.type === "document"
                    ? fullDocsMap[selectedItem.doc.document_id]?.entities || selectedItem.doc.entities
                    : docs[0]?.entities
                }
              />
            </div>
          ) : loading ? (
            <div className="relative py-28 text-center text-xs text-zinc-400 flex flex-col items-center justify-center gap-2">
              <Network className="w-6 h-6 animate-pulse text-blue-600" />
              <span>Constructing knowledge hierarchy...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="relative py-28 text-center text-xs text-zinc-400">
              No files in the repository. Upload a document to map relationships.
            </div>
          ) : (
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
              className="relative transition-transform duration-150 space-y-6"
            >
              {/* Workspace Root Node */}
              <div
                onClick={() => setSelectedItem({ type: "root" })}
                className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold shadow-2xs cursor-pointer hover:opacity-90 transition-opacity"
              >
                <ShieldCheck className="w-4 h-4 text-blue-400 dark:text-blue-600" />
                <span>Forensic Repository Root ({docs.length} Files)</span>
              </div>

              {/* Category Branches */}
              <div className="pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 ml-4 space-y-5">
                {Object.entries(filteredCategories).map(([catName, catDocs]) => {
                  const catKey = `cat-${catName}`;
                  const isCatExpanded = !!expandedNodes[catKey];

                  return (
                    <div key={catKey} className="space-y-3">
                      {/* Category Node */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleNode(catKey)}
                          className="w-6 h-6 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-2xs"
                        >
                          {isCatExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>

                        <div
                          onClick={() => {
                            toggleNode(catKey);
                            setSelectedItem({ type: "category", name: catName, count: catDocs.length });
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                        >
                          <Folder className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>{catName}</span>
                          <span className="px-1.5 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded text-[10px]">
                            {catDocs.length}
                          </span>
                        </div>
                      </div>

                      {/* Documents under Category */}
                      {isCatExpanded && (
                        <div className="pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 ml-3 space-y-3">
                          {catDocs.map((doc) => {
                            const docKey = `doc-${doc.document_id}`;
                            const isDocExpanded = !!expandedNodes[docKey];
                            const fullDoc = fullDocsMap[doc.document_id] || doc;
                            const entities = fullDoc.entities || [];

                            const credentials = entities.filter(
                              (e) => e.pii_tagged || e.text_type === "Heading" || e.confidence > 0.85
                            );
                            const visuals = entities.filter(
                              (e) => e.text_type === "Stamp" || e.text_type === "Signature" || e.text_type === "Logo"
                            );

                            return (
                              <div key={docKey} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleNode(docKey);
                                      handleSelectDoc(doc);
                                    }}
                                    className="w-5 h-5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 shadow-2xs"
                                  >
                                    {isDocExpanded ? (
                                      <ChevronDown className="w-3 h-3" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3" />
                                    )}
                                  </button>

                                  <div
                                    onClick={() => handleSelectDoc(doc)}
                                    className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer shadow-2xs hover:border-blue-500 transition-colors"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-zinc-500" />
                                    <span>{doc.filename}</span>
                                    <span className="text-[10px] text-zinc-400">
                                      ({doc.total_entities || entities.length} nodes)
                                    </span>
                                  </div>
                                </div>

                                {/* Extracted Branch Sub-Nodes */}
                                {isDocExpanded && (
                                  <div className="pl-6 border-l-2 border-blue-500/30 ml-2.5 space-y-2 pt-1">
                                    {/* Credentials Branch */}
                                    <div className="space-y-1">
                                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                        <KeyRound className="w-3 h-3 text-blue-500" /> Credentials ({credentials.length})
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {credentials.slice(0, 5).map((cred, cIdx) => (
                                          <button
                                            key={cIdx}
                                            type="button"
                                            onClick={() =>
                                              setSelectedItem({
                                                type: "entity",
                                                entity: cred,
                                                docName: doc.filename,
                                                docId: doc.document_id,
                                              })
                                            }
                                            className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 text-[11px] text-zinc-700 dark:text-zinc-300 truncate max-w-[180px] shadow-2xs transition-colors"
                                          >
                                            {cred.text}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Signatures & Visual Contours */}
                                    {visuals.length > 0 && (
                                      <div className="space-y-1 pt-1">
                                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                          <Stamp className="w-3 h-3 text-emerald-500" /> Visual Elements ({visuals.length})
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                          {visuals.map((vis, vIdx) => (
                                            <button
                                              key={vIdx}
                                              type="button"
                                              onClick={() =>
                                                setSelectedItem({
                                                  type: "entity",
                                                  entity: vis,
                                                  docName: doc.filename,
                                                  docId: doc.document_id,
                                                })
                                              }
                                              className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-700 dark:text-emerald-300 shadow-2xs"
                                            >
                                              {vis.text_type}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right-Hand Inspector Drawer */}
        <div className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Entity Inspector
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">Live Node</span>
          </div>

          {selectedItem?.type === "document" && (
            <div className="space-y-3.5 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {selectedItem.doc.filename}
                  </h4>
                  <span className="text-[11px] text-zinc-500">{selectedItem.doc.document_type}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Pages:</span>
                  <span className="font-medium">{selectedItem.doc.total_pages || 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Indexed Nodes:</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{selectedItem.doc.total_entities}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Status:</span>
                  <span className="font-medium text-emerald-600 capitalize">{selectedItem.doc.status}</span>
                </div>
              </div>

              {onSelectDocument && (
                <button
                  type="button"
                  onClick={() => onSelectDocument(selectedItem.doc.document_id)}
                  className="w-full h-8 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Analysis Dossier
                </button>
              )}
            </div>
          )}

          {selectedItem?.type === "entity" && (
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-semibold text-blue-600 dark:text-blue-400">
                  {selectedItem.entity.text_type}
                </span>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-0.5">
                  &ldquo;{selectedItem.entity.text}&rdquo;
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">Source: {selectedItem.docName}</p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Confidence:</span>
                  <span className="font-mono text-emerald-600 font-medium">
                    {Math.round(selectedItem.entity.confidence * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Font Size:</span>
                  <span className="font-mono">{selectedItem.entity.font_size} pt</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Alignment:</span>
                  <span className="capitalize">{selectedItem.entity.alignment}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Bounding Box:</span>
                  <span className="font-mono text-[11px]">[{selectedItem.entity.bounding_box.join(", ")}]</span>
                </div>
              </div>

              {onSelectDocument && (
                <button
                  type="button"
                  onClick={() => onSelectDocument(selectedItem.docId)}
                  className="w-full h-8 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View Document Dossier
                </button>
              )}
            </div>
          )}

          {(!selectedItem || selectedItem.type === "root" || selectedItem.type === "category") && (
            <div className="py-12 text-center text-xs text-zinc-400 space-y-1">
              <Network className="w-6 h-6 mx-auto text-zinc-300 dark:text-zinc-700" />
              <p className="font-medium text-zinc-600 dark:text-zinc-400">Select any node in the tree</p>
              <p className="text-[11px]">Inspect coordinates, confidence scores, and layout metrics</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
