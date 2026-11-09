export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface DocumentEntity {
  text: string;
  bounding_box: [number, number, number, number];
  confidence: number;
  font_size: number;
  text_type: "Heading" | "Body" | "Stamp" | "Signature" | "Logo";
  alignment: "left" | "center" | "right";
  pixel_intensity: number;
  pii_tagged?: boolean;
  pii_type?: string;
}

export interface ELAResult {
  file_path: string;
  image_dimensions: [number, number];
  tampering_detected: boolean;
  tampering_area_percentage: number;
  suspicious_regions_count: number;
  suspicious_regions: Array<{
    bounding_box: [number, number, number, number];
    area: number;
    error_intensity: number;
    variance: number;
  }>;
}

export interface CrossVerification {
  overall_risk_score: number;
  flagged_discrepancies: string[];
  metadata_warnings: string[];
  auditor_summary: string;
  compared_documents: string[];
  error?: string;
}

export interface InvestigationDossier {
  dossier_id: string;
  generated_at: string;
  analyzed_documents: string[];
  composite_risk_score: number;
  overall_risk_score?: number;
  verdict?: string;
  executive_summary?: string;
  page_image_url?: string;
  annotated_image_url?: string;
  cross_verification: CrossVerification;
  visual_forensics_ela: Array<{
    document_id: string;
    document_type?: string;
    filename?: string;
    ela_analysis?: ELAResult;
    error?: string;
  }>;
}

export interface DocumentPageRecord {
  page_number: number;
  text: string;
  word_count?: number;
  preview_url?: string;
  entities?: DocumentEntity[];
  extraction_method?: string;
  sheet_name?: string;
}

export interface SpreadsheetSheet {
  name: string;
  row_count: number;
  col_count: number;
  headers: string[];
  sample_rows: string[][];
  formula_count: number;
}

export interface SpreadsheetAnomaly {
  sheet: string;
  coordinate: string;
  type: string;
  formula: string;
  severity: string;
}

export interface SpreadsheetData {
  sheets: SpreadsheetSheet[];
  total_sheets: number;
  total_rows: number;
  total_cols: number;
  total_formulas: number;
  anomalies: SpreadsheetAnomaly[];
}

export interface DocxData {
  paragraph_count: number;
  table_count: number;
  tables: Array<{
    table_index: number;
    row_count: number;
    col_count: number;
    headers: string[];
    rows_sample: string[][];
  }>;
  properties: Record<string, unknown>;
}

export interface JsonInfo {
  is_valid_json: boolean;
  root_type?: string;
  keys_count?: number;
  top_keys?: string[];
  error?: string;
}

export interface DocumentRecord {
  document_id: string;
  job_id?: string;
  filename: string;
  file_path: string;
  file_type?: string;
  document_type: string;
  template_signature: string;
  created_at?: string;
  total_pages: number;
  processed_pages?: number;
  total_entities: number;
  total_rag_chunks: number;
  pii_findings_count: number;
  pii_findings?: Array<{
    type?: string;
    text?: string;
    field_type?: string;
    value?: string;
    [key: string]: unknown;
  }>;
  file_size: number;
  status: "ready" | "processing" | "failed" | "in_review";
  raw_text?: string;
  page_image_url?: string;
  annotated_image_url?: string;
  entities?: DocumentEntity[];
  pages?: DocumentPageRecord[];
  spreadsheet_data?: SpreadsheetData;
  docx_data?: DocxData;
  pdf_metadata?: Record<string, string>;
  json_info?: JsonInfo;
  layout_fingerprint?: Record<string, unknown>;
}

export interface ChatResponse {
  question: string;
  answer: string;
  context_used: Array<{
    chunk_id: string;
    text: string;
    metadata: Record<string, unknown>;
    distance: number;
  }>;
  source_document_id: string;
}

export interface JobStatusResponse {
  job_id: string;
  document_id: string;
  filename?: string;
  status: "processing" | "completed" | "failed";
  submitted_at?: string;
  completed_at?: string;
  error?: string;
  result?: {
    document_id: string;
    document_type: string;
    template_signature: string;
    total_pages: number;
    total_entities: number;
    total_rag_chunks: number;
    pii_findings_count: number;
  };
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(dateString?: string): { date: string; time: string } {
  if (!dateString) return { date: "Just now", time: "" };
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return { date: dateString, time: "" };
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    return { date, time };
  } catch {
    return { date: dateString, time: "" };
  }
}

export const riskColor = (score: number): string => {
  if (score < 30) return "#004ac6";
  if (score < 60) return "#bc4800";
  return "#ba1a1a";
};

export const riskLabel = (score: number): string => {
  if (score < 30) return "High Confidence Match";
  if (score < 60) return "Minor Variances Flagged";
  return "Suspicious / Critical Breaches";
};

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch documents:", err);
    return [];
  }
}

export async function fetchDocument(documentId: string): Promise<DocumentRecord | null> {
  try {
    const res = await fetch(`${API_BASE}/documents/${documentId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch document ${documentId}:`, err);
    return null;
  }
}

export async function uploadDocument(file: File): Promise<{ job_id: string; document_id: string; status: string; message: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Upload failed with status ${res.status}`);
  }
  return await res.json();
}

export async function pollJob(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Failed to poll job status: ${res.statusText}`);
  }
  return await res.json();
}

export async function analyzeDocuments(documentIds: string[]): Promise<InvestigationDossier> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Analysis failed with status ${res.status}`);
  }
  return await res.json();
}

export async function askAssistant(documentId: string, question: string, nResults = 5): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId, question, n_results: nResults }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Assistant query failed with status ${res.status}`);
  }
  return await res.json();
}
