import { registerAs } from '@nestjs/config';
import { env } from './env';

export const llmConfig = registerAs('llm', () => ({
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
  geminiTimeoutMs: env.GEMINI_TIMEOUT_MS,
  groqApiKey: env.GROQ_API_KEY,
  groqModel: env.GROQ_MODEL,
  groqTimeoutMs: env.GROQ_TIMEOUT_MS,
}));
