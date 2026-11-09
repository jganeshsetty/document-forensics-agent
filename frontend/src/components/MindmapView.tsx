"use client";

import React, { useEffect, Component, ErrorInfo, ReactNode } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle, RotateCcw, Network } from "lucide-react";
import { DocumentEntity } from "@/lib/api";

export interface EntityNode {
  text?: string;
  type?: string;
  text_type?: string;
  alignment?: string;
  font_size?: number;
  confidence?: number;
  pixel_intensity?: number;
  pii_tagged?: boolean;
  bounding_box?: number[] | [number, number, number, number];
  page_number?: number;
  [key: string]: unknown;
}

interface MindmapErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface MindmapErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// React Error Boundary to prevent ReactFlow crashes from taking down the page
export class MindmapErrorBoundary extends Component<MindmapErrorBoundaryProps, MindmapErrorBoundaryState> {
  constructor(props: MindmapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): MindmapErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Mindmap caught render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-8 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900 text-center flex flex-col items-center justify-center min-h-[420px] space-y-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Graph Layout Degraded Gracefully
            </h4>
            <p className="text-xs text-zinc-500 max-w-sm">
              Some entity nodes had incomplete or irregular coordinate data. The graph has been isolated to prevent page failure.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Graph Canvas
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

const nodeColors: Record<string, string> = {
  Heading: "#2563eb",
  Body: "#64748b",
  Stamp: "#d97706",
  Signature: "#059669",
  Logo: "#7c3aed",
};

const nodeIcons: Record<string, string> = {
  Heading: "H",
  Body: "T",
  Stamp: "S",
  Signature: "Sig",
  Logo: "L",
};

function InnerMindmapView({
  filename = "Document",
  entities = [],
}: {
  filename?: string;
  entities?: (EntityNode | DocumentEntity)[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Validate and construct nodes safely
  useEffect(() => {
    if (!entities || entities.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    try {
      const centerNode: Node = {
        id: "root-doc",
        type: "default",
        position: { x: 0, y: 0 },
        data: {
          label: (
            <div className="text-center p-3 min-w-[130px]">
              <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-blue-600 text-white font-bold text-base flex items-center justify-center shadow-md shadow-blue-500/20">
                <Network className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[130px]">
                {filename || "Document"}
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{entities.length} entities</p>
            </div>
          ),
        },
        style: {
          background: "var(--card-bg, #ffffff)",
          border: "2px solid #2563eb",
          borderRadius: "14px",
          padding: 0,
          width: 150,
          boxShadow: "0 4px 20px rgba(37, 99, 235, 0.15)",
        },
      };

      const entityNodes: Node[] = [];
      const entityEdges: Edge[] = [];
      const groupedByType: Record<string, (EntityNode | DocumentEntity)[]> = {};

      entities.forEach((rawEnt, idx) => {
        if (!rawEnt) return;
        const ent: EntityNode =
          typeof rawEnt === "string"
            ? { text: rawEnt, text_type: "Body" }
            : (rawEnt as EntityNode);
        const type =
          ent.text_type ||
          (typeof ent.type === "string" ? ent.type : "Body");
        if (!groupedByType[type]) groupedByType[type] = [];
        groupedByType[type].push(ent);
      });

      const types = Object.keys(groupedByType);
      const angleStep = (2 * Math.PI) / Math.max(types.length, 1);
      const radius = 260;

      types.forEach((type, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const cx = Math.cos(angle) * radius;
        const cy = Math.sin(angle) * radius;

        const clusterId = `cluster-${type}`;
        const clusterNode: Node = {
          id: clusterId,
          position: { x: cx, y: cy },
          data: {
            label: (
              <div className="text-center p-2.5 min-w-[100px]">
                <div
                  className="w-8 h-8 mx-auto mb-1.5 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm"
                  style={{ backgroundColor: nodeColors[type] || "#64748b" }}
                >
                  {nodeIcons[type] || "T"}
                </div>
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{type}</p>
                <p className="text-[10px] text-zinc-400">{groupedByType[type].length} items</p>
              </div>
            ),
          },
          style: {
            background: "var(--card-bg, #ffffff)",
            border: `1px solid ${nodeColors[type] || "#64748b"}60`,
            borderRadius: "12px",
            padding: 0,
            width: 110,
          },
        };
        entityNodes.push(clusterNode);

        entityEdges.push({
          id: `edge-root-${type}`,
          source: "root-doc",
          target: clusterId,
          animated: true,
          style: { stroke: nodeColors[type] || "#64748b", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: nodeColors[type] || "#64748b", width: 10, height: 10 },
        });

        const items = groupedByType[type];
        const subAngleStep = (2 * Math.PI) / Math.max(items.length, 1);
        const subRadius = 130;

        items.slice(0, 8).forEach((ent, j) => {
          const subAngle = j * subAngleStep;
          const sx = cx + Math.cos(subAngle) * subRadius;
          const sy = cy + Math.sin(subAngle) * subRadius;
          const leafId = `leaf-${i}-${j}`;

          const node: Node = {
            id: leafId,
            position: { x: sx, y: sy },
            data: {
              label: (
                <div className="p-2.5 max-w-[140px] text-left">
                  <p className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200 truncate" title={ent.text || "Field"}>
                    {ent.text || "Extracted Item"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {ent.pii_tagged && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold border border-rose-200 dark:border-rose-800">
                        PII
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-zinc-400">
                      {Math.round((ent.confidence || 0.9) * 100)}%
                    </span>
                  </div>
                </div>
              ),
            },
            style: {
              background: "var(--card-bg, #ffffff)",
              border: `1px solid ${nodeColors[type] || "#64748b"}40`,
              borderRadius: "8px",
              padding: 0,
              width: 130,
            },
          };
          entityNodes.push(node);

          entityEdges.push({
            id: `edge-${i}-${j}`,
            source: clusterId,
            target: leafId,
            style: { stroke: `${nodeColors[type] || "#64748b"}70`, strokeWidth: 1 },
          });
        });
      });

      // Filter to ensure all edge source and target IDs exist in nodes
      const allNodeIds = new Set([centerNode.id, ...entityNodes.map((n) => n.id)]);
      const validEdges = entityEdges.filter(
        (e) => allNodeIds.has(e.source) && allNodeIds.has(e.target)
      );

      // Single state update outside the loop
      setNodes([centerNode, ...entityNodes]);
      setEdges(validEdges);
    } catch (err) {
      console.warn("Failed to generate mindmap layout:", err);
    }
  }, [entities, filename, setNodes, setEdges]);

  if (!entities || entities.length === 0) {
    return (
      <div className="p-12 text-center h-[520px] flex items-center justify-center border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900">
        <div className="max-w-sm space-y-2">
          <Network className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No Entity Graph Available
          </h4>
          <p className="text-xs text-zinc-500">
            Upload and audit a document to generate its interactive structural mindmap.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[540px] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-950 relative shadow-2xs">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-right"
        className="w-full h-full"
      >
        <Background color="#71717a" gap={20} size={1} />
        <Controls className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden shadow-2xs" />
      </ReactFlow>
    </div>
  );
}

// Export wrapped in ErrorBoundary & ReactFlowProvider
export default function MindmapView(props: { filename?: string; entities?: (EntityNode | DocumentEntity)[] }) {
  return (
    <MindmapErrorBoundary>
      <ReactFlowProvider>
        <InnerMindmapView {...props} />
      </ReactFlowProvider>
    </MindmapErrorBoundary>
  );
}
