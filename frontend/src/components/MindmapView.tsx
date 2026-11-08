"use client";

import { useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";

interface EntityNode {
  text: string;
  type: string;
  alignment: string;
  font_size: number;
  confidence: number;
  pixel_intensity: number;
  pii_tagged?: boolean;
}

const nodeColors: Record<string, string> = {
  Heading: "#e63946",
  Body: "#457b9d",
  Stamp: "#f4a261",
  Signature: "#2a9d8f",
  Logo: "#9b5de5",
};

const nodeIcons: Record<string, string> = {
  Heading: "H",
  Body: "T",
  Stamp: "S",
  Signature: "Sig",
  Logo: "L",
};

export default function MindmapView({ filename, entities = [] }: { filename?: string; entities?: EntityNode[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!entities.length) return;

    const centerNode: Node = {
      id: "root",
      type: "default",
      position: { x: 0, y: 0 },
      data: {
        label: (
          <div className="text-center p-4 min-w-[140px]">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-red-500/25">
              F
            </div>
            <p className="text-xs font-semibold text-gray-200 truncate max-w-[140px] mb-1">
              {filename || "Document"}
            </p>
            <p className="text-[10px] text-gray-500">{entities.length} entities</p>
          </div>
        ),
      },
      style: {
        background: "rgba(22, 22, 28, 0.95)",
        border: "2px solid rgba(230, 57, 70, 0.5)",
        borderRadius: "16px",
        padding: 0,
        width: 160,
        boxShadow: "0 0 40px rgba(230, 57, 70, 0.3)",
      },
    };

    const entityNodes: Node[] = [];
    const entityEdges: Edge[] = [];
    const groupedByType: Record<string, EntityNode[]> = {};

    entities.forEach((ent) => {
      const type = ent.type || "Body";
      if (!groupedByType[type]) groupedByType[type] = [];
      groupedByType[type].push(ent);
    });

    const types = Object.keys(groupedByType);
    const angleStep = (2 * Math.PI) / Math.max(types.length, 1);
    const radius = 280;

    types.forEach((type, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;

      // Type cluster node
      const clusterNode: Node = {
        id: `cluster-${type}`,
        position: { x: cx, y: cy },
        data: {
          label: (
            <div className="text-center p-3 min-w-[100px]">
              <div
                className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-lg"
                style={{ backgroundColor: nodeColors[type] || "#457b9d" }}
              >
                {nodeIcons[type] || "T"}
              </div>
              <p className="text-xs font-medium text-gray-300">{type}</p>
              <p className="text-[10px] text-gray-600">{groupedByType[type].length} items</p>
            </div>
          ),
        },
        style: {
          background: "rgba(22, 22, 28, 0.95)",
          border: `1px solid ${nodeColors[type]}60`,
          borderRadius: "14px",
          padding: 0,
          width: 110,
          boxShadow: `0 0 24px ${nodeColors[type]}20`,
        },
      };

      entityEdges.push({
        id: `edge-root-${type}`,
        source: "root",
        target: `cluster-${type}`,
        animated: true,
        style: { stroke: nodeColors[type] || "#457b9d", strokeWidth: 1.5, strokeDasharray: "4,4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: nodeColors[type] || "#457b9d", width: 12, height: 12 },
      });

      // Sub-nodes around cluster
      const items = groupedByType[type];
      const subAngleStep = (2 * Math.PI) / Math.max(items.length, 1);
      const subRadius = 140;

      items.slice(0, 8).forEach((ent, j) => {
        const subAngle = j * subAngleStep;
        const sx = cx + Math.cos(subAngle) * subRadius;
        const sy = cy + Math.sin(subAngle) * subRadius;

        const node: Node = {
          id: `node-${i}-${j}`,
          position: { x: sx, y: sy },
          data: {
            label: (
              <div className="p-3 max-w-[150px]">
                <p className="text-[11px] text-gray-300 truncate" title={ent.text}>
                  {ent.text}
                </p>
                <div className="flex gap-2 mt-2">
                  {ent.pii_tagged && (
                    <span className="text-[9px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      PII
                    </span>
                  )}
                  <span className="text-[9px] text-gray-600">
                    conf: {ent.confidence}%
                  </span>
                </div>
              </div>
            ),
          },
          style: {
            background: "rgba(22, 22, 28, 0.9)",
            border: `1px solid ${nodeColors[type]}40`,
            borderRadius: "10px",
            padding: 0,
            width: 140,
            boxShadow: `0 4px 16px ${nodeColors[type]}15`,
          },
        };

        entityNodes.push(node);
        entityEdges.push({
          id: `edge-${i}-${j}`,
          source: `cluster-${type}`,
          target: `node-${i}-${j}`,
          style: { stroke: `${nodeColors[type]}70`, strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: `${nodeColors[type]}80`, width: 8, height: 8 },
        });
      });

      setNodes([...entityNodes, clusterNode, centerNode]);
      setEdges(entityEdges);
    });
  }, [entities, filename, setNodes, setEdges]);

  if (!entities.length) {
    return (
      <div className="glass-strong p-12 text-center h-[600px] flex items-center justify-center">
        <div className="max-w-md">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" className="mx-auto mb-4 text-gray-600">
            <circle cx="32" cy="32" r="24"/>
            <path d="M32 16v16M16 32h16" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="32" cy="32" r="8"/>
          </svg>
          <p className="text-gray-400 text-sm leading-relaxed">
            Upload and process a document to see its entity mindmap
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-strong p-4 h-[600px] overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        attributionPosition="bottom-right"
        nodeTypes={{
          default: ({ data }: { data: { label: React.ReactNode } }) => (
            <div className="group">
              {data.label}
            </div>
          ),
        }}
      >
        <Background
          color="rgba(255, 255, 255, 0.02)"
          gap={20}
          size={1}
          style={{ opacity: 0.6 }}
        />
        <Controls
          className="text-gray-400"
          style={{
            background: "rgba(22, 22, 28, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        />
      </ReactFlow>
    </div>
  );
}