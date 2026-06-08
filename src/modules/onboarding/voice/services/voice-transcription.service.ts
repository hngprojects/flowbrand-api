import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import { env } from '../../../../config/env';
import { VoiceProvider } from '../enums/voice-onboarding.enums';

@Injectable()
export class VoiceTranscriptionService {
  private readonly logger = new Logger(VoiceTranscriptionService.name);
  private readonly groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  async transcribe(audioBuffer: Buffer, fileName: string): Promise<{ transcript: string; provider: VoiceProvider }> {
    try {
      const transcript = await this.transcribeWithGroq(audioBuffer, fileName);
      return { transcript, provider: VoiceProvider.GROQ };
    } catch (error: unknown) {
      this.logger.error('Groq transcription failed', error instanceof Error ? error.stack : 'Unknown error');
      
      // Fallback to AssemblyAI
      if (!env.ASSEMBLYAI_API_KEY) {
        throw new Error('AssemblyAI fallback unavailable: Missing API key');
      }
      
      try {
        const transcript = await this.transcribeWithAssemblyAI(audioBuffer);
        return { transcript, provider: VoiceProvider.ASSEMBLYAI };
      } catch (fallbackError: unknown) {
        this.logger.error('AssemblyAI transcription failed', fallbackError instanceof Error ? fallbackError.stack : 'Unknown error');
        throw new Error('Transcription failed on both providers');
      }
    }
  }

  private async transcribeWithGroq(audioBuffer: Buffer, fileName: string): Promise<string> {
    const file = new File([new Uint8Array(audioBuffer)], fileName, { type: 'audio/webm' }); // Type is ignored by Groq for Buffer/File blobs usually, but required for SDK signature.
    
    const transcription = await this.groq.audio.transcriptions.create({
      file,
      model: env.GROQ_WHISPER_MODEL,
    });
    
    return transcription.text;
  }

  private async transcribeWithAssemblyAI(audioBuffer: Buffer): Promise<string> {
    // Note: To avoid installing a new SDK just for fallback, using native fetch
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        authorization: env.ASSEMBLYAI_API_KEY!,
      },
      body: audioBuffer,
    });

    if (!uploadRes.ok) {
      throw new Error(`AssemblyAI upload failed: ${uploadRes.status}`);
    }

    const { upload_url } = (await uploadRes.json()) as { upload_url: string };

    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        authorization: env.ASSEMBLYAI_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ audio_url: upload_url }),
    });

    if (!transcriptRes.ok) {
      throw new Error(`AssemblyAI transcript request failed: ${transcriptRes.status}`);
    }

    const { id } = (await transcriptRes.json()) as { id: string };

    return this.pollAssemblyAITranscript(id);
  }

  private async pollAssemblyAITranscript(id: string): Promise<string> {
    const maxAttempts = 30;
    const delayMs = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: env.ASSEMBLYAI_API_KEY! },
      });

      const data = (await res.json()) as { status: string; text?: string; error?: string };

      if (data.status === 'completed' && data.text) {
        return data.text;
      }
      if (data.status === 'error') {
        throw new Error(`AssemblyAI error: ${data.error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('AssemblyAI polling timed out');
  }
}