export type WatermarkType = "TEXT_PATTERN" | "TEXT_INLINE" | "IMAGE_REPEATED" | "AI_DETECTED";

export interface DetectedWatermark {
  id: string;
  type: WatermarkType;
  text?: string | null;
  description?: string | null;
  source: "structure" | "ai";
  xref?: number | null;
  pagesAffected: number[];
  confidence: number;
  position?: "top-left" | "top-right" | "bottom-center" | "diagonal" | "center" | "full-page" | "unknown";
  allRelatedXrefs?: number[];
}

export interface ScanResponse {
  sessionId: string;
  totalPages: number;
  watermarks: DetectedWatermark[];
  fileName?: string;
}

export type ToolState =
  | "idle"
  | "scanning"
  | "results"
  | "removing"
  | "done"
  | "error";
