import type { BusinessContext } from '../../modules/funnels/interfaces/generate-funnel-job.interface';
import type { LlmStageData } from '../../modules/funnels/interfaces/llm-stage-data.interface';

// Abstract class used as the DI token so NestJS can inject it.
// BE-304 provides the concrete implementation (Gemini + Groq).
// API keys (GEMINI_API_KEY, GROQ_API_KEY) must NEVER appear in logs — enforce in concrete impl.
export abstract class LlmService {
  abstract generateWithGemini(ctx: BusinessContext): Promise<LlmStageData[]>;
  abstract generateWithGroq(ctx: BusinessContext): Promise<LlmStageData[]>;
}

// Placeholder until BE-304 lands — always throws, forcing template fallback.
export class NullLlmService extends LlmService {
  generateWithGemini(): Promise<LlmStageData[]> {
    return Promise.reject(new Error('LLM not configured — awaiting BE-304'));
  }

  generateWithGroq(): Promise<LlmStageData[]> {
    return Promise.reject(new Error('LLM not configured — awaiting BE-304'));
  }
}
