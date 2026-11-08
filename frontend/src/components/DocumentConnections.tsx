"use client";

import { useState, useEffect, useMemo } from "react";
import { DocumentRecord, DocumentEntity, fetchDocuments, fetchDocument } from "@/lib/api";

interface DocumentConnectionsProps {
  documents?: DocumentRecord[];
  onSelectDocument?: (docId: string) => void;
}

type SelectedItem =
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
  const [zoom, setZoom] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [fullDocsMap, setFullDocsMap] = useState<Record<string, DocumentRecord>>({});

  // Fetch documents if not provided
  useEffect(() => {
    let isMounted = true;
    if (initialDocs.length === 0) {
      Promise.resolve().then(() => {
        if (!isMounted) return;
        setLoading(true);
        fetchDocuments()
          .then((list) => {
            if (!isMounted) return;
            setDocs(list);
            if (list.length > 0) {
              setSelectedItem({ type: "document", doc: list[0] });
              // Pre-expand first category and first document
              const firstCat = list[0].document_type || "General Document";
              setExpandedNodes({
                [`cat-${firstCat}`]: true,
                [`doc-${list[0].document_id}`]: true,
              });
              // Fetch detailed entity info for the first document
              fetchDocument(list[0].document_id).then((fullDoc) => {
                if (isMounted && fullDoc) {
                  setFullDocsMap((prev) => ({ ...prev, [fullDoc.document_id]: fullDoc }));
                  setSelectedItem({ type: "document", doc: fullDoc });
                }
              });
            }
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

  // Load detailed document data when a doc node is expanded/clicked
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

  // Group documents by category
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
  const totalEntitiesCount = docs.reduce((acc, d) => acc + (d.total_entities || 0), 0);

  const filteredCategories = useMemo(() => {
    if (filterCategory === "all") return categories;
    return { [filterCategory]: categories[filterCategory] || [] };
  }, [categories, filterCategory]);

  return (
    <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-8 flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
              Forensic Knowledge Tree
            </span>
            <span className="text-secondary font-label-sm text-label-sm">
              Live ChromaDB & MongoDB Graph
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
            Document & Entity Knowledge Map
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Explore hierarchical relationships between verified documents, extracted credentials, and structural layout nodes.
          </p>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto bg-surface-container-lowest p-1.5 rounded-xl shadow-xs border border-outline-variant/30">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 0.1, 1.4))}
            className="w-9 h-9 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            title="Zoom In"
          >
            <span className="material-symbols-outlined text-[19px]">zoom_in</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.7))}
            className="w-9 h-9 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            title="Zoom Out"
          >
            <span className="material-symbols-outlined text-[19px]">zoom_out</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="px-3 h-9 rounded-lg hover:bg-surface-container flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md"
            title="Reset View"
          >
            <span className="material-symbols-outlined text-[17px]">restart_alt</span>
            <span>Reset</span>
          </button>
          <div className="w-px h-5 bg-outline-variant/40 mx-1" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 h-9 rounded-lg bg-surface-container text-on-surface font-label-md text-label-md border-none focus:outline-none focus:ring-1 focus:ring-primary font-medium"
          >
            <option value="all">All Categories ({categoryNames.length})</option>
            {categoryNames.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({categories[cat]?.length || 0})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Real Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex items-center gap-3.5 border border-outline-variant/20">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">description</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Indexed Files</p>
            <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              {docs.length} Documents
            </p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex items-center gap-3.5 border border-outline-variant/20">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary-container">
            <span className="material-symbols-outlined text-[20px]">hub</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Extracted Entities</p>
            <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              {totalEntitiesCount} Nodes
            </p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex items-center gap-3.5 border border-outline-variant/20">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
            <span className="material-symbols-outlined text-[20px]">category</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Classifications</p>
            <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">
              {categoryNames.length} Groups
            </p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex items-center gap-3.5 border border-outline-variant/20">
          <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined text-[20px]">verified</span>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">Integrity Pipeline</p>
            <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">Audited & Ready</p>
          </div>
        </div>
      </div>

      {/* Main Split View: Tree Explorer (Left) & Node Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tree Canvas */}
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/20 p-6 min-h-[620px] overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-secondary gap-3">
              <span className="material-symbols-outlined text-[36px] animate-spin text-primary">refresh</span>
              <span className="font-label-md text-label-md">Loading forensic knowledge graph...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-secondary mb-3">
                <span className="material-symbols-outlined text-[28px]">folder_off</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">No Documents in Repository</h3>
              <p className="font-body-md text-body-md text-secondary mt-1">Upload a document to generate its entity connection tree.</p>
            </div>
          ) : (
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
              className="flex flex-col gap-6 transition-transform duration-200"
            >
              {/* Root Node */}
              <div
                onClick={() => setSelectedItem({ type: "root" })}
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md font-semibold shadow-xs cursor-pointer hover:bg-primary transition-colors max-w-fit"
              >
                <span className="material-symbols-outlined text-[20px]">corporate_fare</span>
                <span>Verified Forensic Repository ({docs.length} Documents)</span>
              </div>

              {/* Category Branches */}
              <div className="pl-6 border-l-2 border-primary/20 flex flex-col gap-5 ml-4">
                {Object.entries(filteredCategories).map(([catName, catDocs]) => {
                  const catKey = `cat-${catName}`;
                  const isCatExpanded = !!expandedNodes[catKey];

                  return (
                    <div key={catKey} className="flex flex-col gap-3">
                      {/* Category Header */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleNode(catKey)}
                          className="w-7 h-7 rounded-md bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {isCatExpanded ? "expand_more" : "chevron_right"}
                          </span>
                        </button>

                        <div
                          onClick={() => {
                            toggleNode(catKey);
                            setSelectedItem({ type: "category", name: catName, count: catDocs.length });
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 cursor-pointer transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px] text-primary">folder</span>
                          <span className="font-label-md text-label-md font-semibold text-on-surface">
                            {catName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-secondary font-label-sm text-label-sm">
                            {catDocs.length}
                          </span>
                        </div>
                      </div>

                      {/* Documents under Category */}
                      {isCatExpanded && (
                        <div className="pl-8 border-l-2 border-outline-variant/30 flex flex-col gap-4 ml-3.5">
                          {catDocs.map((doc) => {
                            const docKey = `doc-${doc.document_id}`;
                            const isDocExpanded = !!expandedNodes[docKey];
                            const fullDoc = fullDocsMap[doc.document_id] || doc;
                            const entities = fullDoc.entities || [];

                            const credentials = entities.filter(
                              (e) =>
                                e.pii_tagged ||
                                e.text_type === "Heading" ||
                                e.confidence > 0.8
                            );
                            const visuals = entities.filter(
                              (e) => e.text_type === "Stamp" || e.text_type === "Signature" || e.text_type === "Logo"
                            );

                            return (
                              <div key={docKey} className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleNode(docKey);
                                      handleSelectDoc(doc);
                                    }}
                                    className="w-6 h-6 rounded bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      {isDocExpanded ? "expand_more" : "chevron_right"}
                                    </span>
                                  </button>

                                  <div
                                    onClick={() => handleSelectDoc(doc)}
                                    className="inline-flex items-center gap-3 px-3.5 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/30 cursor-pointer shadow-xs transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[18px] text-secondary">
                                      article
                                    </span>
                                    <div className="flex flex-col">
                                      <span className="font-label-md text-label-md font-medium text-on-surface">
                                        {doc.filename}
                                      </span>
                                      <span className="font-label-sm text-label-sm text-secondary">
                                        {doc.total_pages || 1} page(s) · {doc.total_entities || entities.length} entities
                                      </span>
                                    </div>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-primary font-label-sm text-label-sm font-semibold ml-2">
                                      {doc.status}
                                    </span>
                                  </div>
                                </div>

                                {/* Expanded Entities Sub-Tree */}
                                {isDocExpanded && (
                                  <div className="pl-7 border-l-2 border-primary/20 flex flex-col gap-2 ml-3 mt-1">
                                    {/* Credentials Branch */}
                                    <div className="flex flex-col gap-1.5">
                                      <span className="font-label-sm text-label-sm font-semibold text-secondary uppercase flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">badge</span>
                                        Identified Key Credentials ({Math.min(credentials.length, 6)})
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {credentials.slice(0, 6).map((cred, cIdx) => (
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
                                            className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-primary-container hover:text-on-primary text-on-surface font-label-sm text-label-sm transition-colors border border-outline-variant/20 truncate max-w-[200px]"
                                          >
                                            {cred.text}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Visual Artifacts Branch if present */}
                                    {visuals.length > 0 && (
                                      <div className="flex flex-col gap-1.5 mt-1">
                                        <span className="font-label-sm text-label-sm font-semibold text-secondary uppercase flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[14px]">draw</span>
                                          Signatures & Visuals ({visuals.length})
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
                                              className="px-2.5 py-1 rounded-lg bg-tertiary-container/30 hover:bg-tertiary text-on-surface font-label-sm text-label-sm transition-colors border border-outline-variant/20"
                                            >
                                              {vis.text_type}: {vis.text.slice(0, 20)}
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

        {/* Node Detail Inspector Panel (Right) */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl shadow-xs border border-outline-variant/20 p-6 flex flex-col gap-5 sticky top-24">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">troubleshoot</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Entity & Node Inspector
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-secondary font-label-sm text-label-sm uppercase font-semibold">
              Live Details
            </span>
          </div>

          {selectedItem?.type === "document" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">description</span>
                </div>
                <div className="flex flex-col">
                  <h4 className="font-label-md text-label-md font-semibold text-on-surface">
                    {selectedItem.doc.filename}
                  </h4>
                  <span className="font-label-sm text-label-sm text-secondary">
                    {selectedItem.doc.document_type || "General Document"}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Document ID:</span>
                  <span className="font-mono text-on-surface text-[12px] truncate max-w-[150px]">
                    {selectedItem.doc.document_id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Total Pages:</span>
                  <span className="text-on-surface font-medium">{selectedItem.doc.total_pages || 1}</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Extracted Nodes:</span>
                  <span className="text-primary font-medium font-semibold">{selectedItem.doc.total_entities}</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Status:</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-primary font-label-sm text-label-sm font-semibold">
                    {selectedItem.doc.status}
                  </span>
                </div>
              </div>

              {onSelectDocument && (
                <button
                  type="button"
                  onClick={() => onSelectDocument(selectedItem.doc.document_id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-md text-label-md font-semibold flex items-center justify-center gap-2 shadow-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  View Full Forensic Report
                </button>
              )}
            </div>
          )}

          {selectedItem?.type === "entity" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[22px]">badge</span>
                </div>
                <div className="flex flex-col">
                  <h4 className="font-label-md text-label-md font-semibold text-on-surface truncate max-w-[200px]">
                    {selectedItem.entity.text}
                  </h4>
                  <span className="font-label-sm text-label-sm text-secondary">
                    {selectedItem.entity.text_type} · {selectedItem.docName}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 bg-surface-container-low rounded-xl p-4 border border-outline-variant/20">
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Type:</span>
                  <span className="text-on-surface font-medium">{selectedItem.entity.text_type}</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Confidence:</span>
                  <span className="text-primary font-medium font-semibold">
                    {Math.round(selectedItem.entity.confidence * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Font Size:</span>
                  <span className="text-on-surface font-medium">{selectedItem.entity.font_size} pt</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Alignment:</span>
                  <span className="text-on-surface font-medium capitalize">{selectedItem.entity.alignment}</span>
                </div>
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-secondary">Bounding Box:</span>
                  <span className="font-mono text-on-surface text-[12px]">
                    [{selectedItem.entity.bounding_box.join(", ")}]
                  </span>
                </div>
              </div>

              {onSelectDocument && (
                <button
                  type="button"
                  onClick={() => onSelectDocument(selectedItem.docId)}
                  className="w-full py-2.5 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors font-label-md text-label-md font-semibold flex items-center justify-center gap-2 border border-outline-variant/30"
                >
                  <span className="material-symbols-outlined text-[18px]">visibility</span>
                  Inspect in Analysis Report
                </button>
              )}
            </div>
          )}

          {(!selectedItem || selectedItem.type === "root" || selectedItem.type === "category") && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-secondary">
              <span className="material-symbols-outlined text-[32px] mb-2 text-outline">touch_app</span>
              <p className="font-body-md text-body-md text-on-surface-variant font-medium">
                Click any document node or credential tag
              </p>
              <p className="font-body-sm text-body-sm text-secondary mt-1">
                Inspect coordinates, confidence scores, and layout metrics in real time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
