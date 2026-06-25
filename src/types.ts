export enum NumberingStyle {
  NONE = "NONE", // Normal text (no question numbers)
  Q_DOT = "Q_DOT", // Q1.
  HASH = "HASH", // #1.
  QUESTION_DOT = "QUESTION_DOT", // Question 1.
  NUMBER_DOT = "NUMBER_DOT", // 1.
}

export enum OptionArrangement {
  VERTICAL = "VERTICAL", // One option per line
  HORIZONTAL = "HORIZONTAL", // All options on one line
  GRID = "GRID", // Two options per line (A B then C D)
}

export enum OptionPatternFormat {
  A_B_C_D = "A_B_C_D", // A, B, C, D
  a_b_c_d = "a_b_c_d", // a, b, c, d
  NUM_1_2_3_4 = "NUM_1_2_3_4", // 1, 2, 3, 4
  ROMAN_i_ii_iii_iv = "ROMAN_i_ii_iii_iv", // i, ii, iii, iv
  ROMAN_I_II_III_IV = "ROMAN_I_II_III_IV", // I, II, III, IV
}

export enum AnswerLength {
  SHORT = "SHORT",
  DETAILED = "DETAILED",
  CUSTOM = "CUSTOM",
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface ExtractedElement {
  type: "text" | "image" | "table";
  content?: string;
  imageB64?: string;
  bbox?: BoundingBox;
  id: string;
  style?: {
    color?: string;
    fontSize?: number;
    isBold?: boolean;
    isItalic?: boolean;
    backgroundColor?: string;
  };
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  durationDays: number; // 30, 365, etc.
  limits: PlanLimits;
  tokensCount?: number; // Credited tokens count
  isActive: boolean; // if Admin deactivated it
  createdAt: number;
  historyValidityDays?: number; // History validity period in days
}

export interface PlanLimits {
  pdfDailySystemApi: number;
  pdfDailyPersonalApi: number;
  chatDailySystemApi: number;
  chatDailyPersonalApi: number;
}

export interface UserUsage {
  dateId: string; // "YYYY-MM-DD"
  pdfSystemApiCount: number;
  pdfPersonalApiCount: number;
  chatSystemApiCount: number;
  chatPersonalApiCount: number;
}

export interface UserSubscription {
  planId: string;
  planName: string;
  startedAt: number;
  expiresAt: number | null; // null for lifetime
  isActive: boolean;
}

export interface UserProfileExtensions {
  subscription?: UserSubscription;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyName: string;
  keyValue: string;
  isShared: boolean;
  createdAt: number;
}

export enum AppState {
  IDLE = "IDLE",
  UPLOAD = "UPLOAD",
  PROCESSING_PDF = "PROCESSING_PDF", // Converting PDF to images
  ANALYZING = "ANALYZING", // Sending to Gemini
  CROPPING = "CROPPING", // Extracting image regions
  COMPLETED = "COMPLETED",
  ERROR = "ERROR",
}

export interface ScannedPage {
  id: string;
  imageUrl: string; // Base64 or Blob URL
  pageNumber: number;
  status: "pending" | "processing" | "done" | "error";
  errorMessage?: string;
  extractedText?: string; // Legacy support
  elements?: ExtractedElement[];
  isSelected: boolean;
  documentId?: string;
  documentName?: string;
  documentPageNumber?: number;
  questions?: McqQuestion[];
}

export interface ConversionConfig {
  prompt: string;
}

export interface HistoryItem {
  id: string;
  fileName: string;
  timestamp: number;
  pagesCount: number;
  elements: ExtractedElement[];
  mcqQuestions?: McqQuestion[];
  mcqCount?: number;
  extractedText?: string;
}

export interface ChatFile {
  id: string;
  name: string;
  size: number;
  type: string;
  mimeType: string;
  base64?: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: ChatFile[];
  isStreaming?: boolean;
  statusText?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

export interface McqOption {
  label: string;
  text: string;
  text_hin?: string;
  text_eng?: string;
}

export interface McqQuestion {
  id: string;
  questionText: string;
  question_hin?: string;
  question_eng?: string;
  options: McqOption[];
  answer?: string;
  pageNumber?: number;
  status?: "Draft" | "Published";
  difficulty?: "Easy" | "Medium" | "Hard";
  subject?: string;
  type?: string; 
  passageText?: string;
  solution?: string;
  solution_hin?: string;
  solution_eng?: string;
  topic?: string; 

  // Additional Metadata for Question Bank / CSV Export
  chapter?: string;
  exam?: string;
  related_exam?: string;
  collection?: string;
  previous_of?: string;
  set_name?: string;
  section?: string;
  year?: string;
  tags?: string[];
  shift?: string;
  date?: string;
  level?: string;
  video?: string;
  imageUrl?: string;

  // New Intelligent Extraction Metadata
  questionImage?: string;
  solutionImage?: string;
  subSubject?: string;
  subTopic?: string;
  aiVerifiedFields?: string[];
  
  examName?: string;
  examCategory?: string;
  examYear?: string;
  examDate?: string;
  session?: string;
  stage?: string;
  pyqStatus?: string | boolean;
  org?: string;

  bookName?: string;
  sourceBook?: string;
  publisher?: string;
  pdfName?: string;
  importBatch?: string;
  sourceType?: string;

  difficultyLevel?: string;
  questionType?: string;
  language?: string;
  labels?: string[];

  confidenceScores?: Record<string, number>;
  createdDate?: string;
  updatedDate?: string;
}

export const getCleanDisplayName = (
  displayName?: string,
  email?: string,
): string => {
  if (displayName && displayName.trim()) {
    return displayName.trim();
  }
  if (!email) return "Unnamed User";

  // Extract part before @
  const parts = email.split("@")[0];

  // Split on symbols or transitions between lowercase/uppercase/digits
  const words = parts
    .replace(/[^a-zA-Z]/g, " ") // replace all numbers & special characters with spaces for a nice clean human name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "User";

  // Capitalize each word
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export interface ToolRate {
  system: number;
  custom: number;
}

export interface ToolRates {
  pdfConverter: ToolRate;
  mcqExtractor: ToolRate;
  youtubeSeo: ToolRate;
  chatApp: ToolRate;
}

export function stripQuestionNumberPrefix(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();
  
  // Apply a regex iteratively to catch double-prefixes or layered prefixes
  let previous = "";
  while (cleaned !== previous) {
    previous = cleaned;
    // Strip patterns like "Q.1.", "Question 1:", "प्रश्न 1", "S.N. 1", "SN 1.", etc.
    cleaned = cleaned.replace(/^\s*(?:Question|Q|Q\.|Prashn|प्रश्न|S\.N\.|SN\.?)\s*:?\s*\d+\s*[\.\s\:\-\/\)]\s*/i, "").trim();
    // Strip leading "1." or "1)" or "1 -" or "[1]" or "13."
    cleaned = cleaned.replace(/^\s*[\(\[]?\d+[\)\]\.\-\:\/,]\s*/, "").trim();
    // Strip leading standalone numbers if followed by space (e.g. "13 " but safely, only at start)
    cleaned = cleaned.replace(/^\s*\d+\s+/, "").trim();
  }
  return cleaned;
}

export function stripOptionPrefix(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();
  
  let previous = "";
  while (cleaned !== previous) {
    previous = cleaned;
    // Strip (A), A), A., A-, A: or a), a., [A], etc.
    cleaned = cleaned.replace(/^\s*[\(\[]?[a-zA-Z][\)\]\.\-\:\/,]\s*/, "").trim();
    // Strip roman numerals like (iv), iv., iv), IV)
    cleaned = cleaned.replace(/^\s*[\(\[]?(?:iv|iii|ii|i|ix|viii|vii|vi|v|x|IV|III|II|I|IX|VIII|VII|VI|V|X)[\)\]\.\-\:\/,]\s*/, "").trim();
    // Strip leading numbers for options like 1), 1., (1)
    cleaned = cleaned.replace(/^\s*[\(\[]?\d+[\)\]\.\-\:\/,]\s*/, "").trim();
    // Strip stray alphabet letter at the start with space "A " or "C "
    cleaned = cleaned.replace(/^\s*[a-zA-Z]\s+/, "").trim();
  }
  return cleaned;
}

