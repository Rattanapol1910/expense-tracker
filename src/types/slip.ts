export interface ParsedSlip {
  refNo: string;
  amount: number;
  transferredAt: string; // ISO
  senderName?: string;
  senderAccount?: string;
  receiverName?: string;
  receiverAccount?: string;
}

export interface MatchCandidate {
  userId: string;
  displayName: string;
  confidence: "high" | "low";
}

export interface SlipTokenPayload extends ParsedSlip {
  uid: string; // คนที่อัพโหลด
  slipPath: string;
  exp: number; // ms
}