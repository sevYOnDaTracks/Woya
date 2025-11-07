export interface ConversationSummary {
  id: string;
  participantIds: string[];
  updatedAt?: number;
  lastMessage?: {
    body: string;
    senderId: string;
    createdAt?: number;
  } | null;
  readBy?: string[];
}

export interface Message {
  id: string;
  body: string;
  senderId: string;
  createdAt?: number;
  readBy?: string[];
}
