import type { BusinessContext } from '../../modules/funnels/interfaces/generate-funnel-job.interface';
import type { LlmStageData } from '../../modules/funnels/interfaces/llm-stage-data.interface';

// BE-304 provides the concrete implementation (Gemini + Groq).
// API keys (GEMINI_API_KEY, GROQ_API_KEY) must NEVER appear in logs — enforce in concrete impl.
export abstract class LlmService {
  abstract generateWithGemini(ctx: BusinessContext): Promise<LlmStageData[]>;
  abstract generateWithGroq(ctx: BusinessContext): Promise<LlmStageData[]>;
  abstract extractBusinessNameWithGemini(description: string): Promise<string>;
  abstract extractBusinessNameWithGroq(description: string): Promise<string>;
}

// Placeholder until BE-304 lands — always throws, forcing template fallback.
export class NullLlmService extends LlmService {
  generateWithGemini(): Promise<LlmStageData[]> {
    return Promise.reject(new Error('LLM not configured — awaiting BE-304'));
  }

  generateWithGroq(): Promise<LlmStageData[]> {
    return Promise.reject(new Error('LLM not configured — awaiting BE-304'));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  extractBusinessNameWithGemini(description: string): Promise<string> {
    return Promise.reject(new Error('LLM not configured — awaiting BE-304'));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  extractBusinessNameWithGroq(description: string): Promise<string> {
    return Promise.reject(new Error('LLM not configured — awaiting BE-304'));
  }
}
