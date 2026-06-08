export interface VoiceSessionRound {
  transcript: string;
}

export interface VoiceTranscriptionJobData {
  userId: string;
  voiceSessionId: string;
  storagePath: string;
  mimeType: string;
  originalName?: string;
}