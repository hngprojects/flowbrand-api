import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { BusinessContext } from '../../modules/funnels/interfaces/generate-funnel-job.interface';
import type { LlmStageData, StageTaskData } from '../funnels/interfaces/llm-stage-data.interface';
import { LlmService } from '../../queue/interfaces/llm.service.interface';
import * as SYS_MSG from '../../constants/system.messages';

const SYSTEM_PROMPT = `You are a marketing strategist for SEIL, a guided marketing product for small businesses in Sub-Saharan Africa.
Generate a 4-stage marketing funnel tailored to the business context supplied by the user.
Return ONLY the JSON object described below. No text before or after. No markdown. No code fences.

Output schema (strict):
{
  "stages": [
    {
      "position": 1,
      "channel": "<string>",
      "explanation": "<2-3 sentences, 10-2000 chars>",
      "actionPrompt": "<1 clear action, 10-500 chars>",
      "tasks": [
        { "name": "<short punchy title, 2-5 words>", "taskText": "<comprehensive how-to guide, 4-6 full sentences, about 350-700 characters; see Rules>" },
        { "name": "<short punchy title, 2-5 words>", "taskText": "<comprehensive how-to guide, 4-6 full sentences, about 350-700 characters; see Rules>" },
        { "name": "<short punchy title, 2-5 words>", "taskText": "<comprehensive how-to guide, 4-6 full sentences, about 350-700 characters; see Rules>" }
      ]
    }
  ]
}

Rules:
- stages array must have EXACTLY 4 items (positions 1, 2, 3, 4).
- Each tasks array must have EXACTLY 3 items.
- All string fields must be non-empty.
- Each taskText must be a detailed, comprehensive guide of 4-6 full sentences (roughly 350-700 characters). Never return a single short sentence.
- In each taskText cover: what to do, the concrete step-by-step actions, why it matters for this specific business and its customers, and what a good result looks like.
- Keep name a short punchy 2-5 word title; put all the detail in taskText, not the name.
- Write taskText in a clear, encouraging, coaching tone for the business owner.
- Plain text only inside field values — no nested JSON, no HTML.
- Return ONLY the JSON object. No text before or after. No markdown.`;

const MAX_FUNNEL_NAME_LENGTH = 60;

const EXPECTED_STAGE_COUNT = 4;
const TASKS_MIN = 2;
const TASKS_MAX = 3;
const EXPLANATION_MIN = 10;
const EXPLANATION_MAX = 2000;
const ACTION_PROMPT_MIN = 10;
const ACTION_PROMPT_MAX = 500;

interface GeminiCandidate {
  content: { parts: Array<{ text?: string }> };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GroqChoice {
  message: { content: string | null };
}

interface GroqResponse {
  choices?: GroqChoice[];
}

interface LlmStageDataWithTasks extends LlmStageData {
  tasks: StageTaskData[];
}

@Injectable()
export class LlmServiceImpl extends LlmService {
  private readonly logger = new Logger(LlmServiceImpl.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async generateWithGemini(ctx: BusinessContext): Promise<LlmStageData[]> {
    const apiKey = this.config.get<string>('llm.geminiApiKey');
    const model = this.config.get<string>('llm.geminiModel') ?? 'gemini-2.5-flash';
    const timeoutMs = this.config.get<number>('llm.geminiTimeoutMs') ?? 60_000;

    if (!apiKey) {
      throw new Error(SYS_MSG.AI_GEMINI_API_KEY_MISSING);
    }

    const prompt = this.buildPrompt(ctx);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096, temperature: 0.4 },
    });

    let raw: string;
    try {
      raw = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
        timeoutMs,
        'Gemini',
      );
    } catch (err) {
      this.logger.error({
        provider: 'Gemini',
        error: (err as Error).message,
        context: { businessType: ctx.businessType, discoveryChannel: ctx.discoveryChannel },
      });
      throw err;
    }

    const text = this.extractGeminiText(raw);
    const stages = this.validateLlmOutput(text);

    if (!stages) {
      throw new Error(SYS_MSG.AI_GEMINI_OUTPUT_FAILED_SCHEMA_VALIDATION);
    }

    return stages;
  }

  async generateWithGroq(ctx: BusinessContext): Promise<LlmStageData[]> {
    const apiKey = this.config.get<string>('llm.groqApiKey');
    const model = this.config.get<string>('llm.groqModel') ?? 'llama-3.3-70b-versatile';
    const timeoutMs = this.config.get<number>('llm.groqTimeoutMs') ?? 60_000;

    if (!apiKey) {
      throw new Error(SYS_MSG.AI_GROQ_API_KEY_MISSING);
    }

    const prompt = this.buildPrompt(ctx);

    const body = JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    });

    let raw: string;
    try {
      raw = await this.fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        },
        timeoutMs,
        'Groq',
      );
    } catch (err) {
      this.logger.error({
        provider: 'Groq',
        error: (err as Error).message,
        context: { businessType: ctx.businessType, discoveryChannel: ctx.discoveryChannel },
      });
      throw err;
    }

    const text = this.extractGroqText(raw);
    const stages = this.validateLlmOutput(text);

    if (!stages) {
      throw new Error(SYS_MSG.AI_GROQ_OUTPUT_FAILED_SCHEMA_VALIDATION);
    }

    return stages;
  }

  async generateFunnelNameWithGemini(description: string, discoveryChannel: string): Promise<string> {
    const apiKey = this.config.get<string>('llm.geminiApiKey');
    const model = this.config.get<string>('llm.geminiModel') ?? 'gemini-2.5-flash';
    const timeoutMs = this.config.get<number>('llm.geminiTimeoutMs') ?? 60_000;

    if (!apiKey) {
      throw new Error(SYS_MSG.AI_GEMINI_API_KEY_MISSING);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const systemPrompt =
      `Generate a short, memorable name (≤ ${MAX_FUNNEL_NAME_LENGTH} chars) for a marketing funnel based on the business context. ` +
      'Make it specific and brandable. ' +
      'Return ONLY the name. No quotes, no markdown, no punctuation unless part of the name.';
    const userMessage = [
      `Business description: ${description}`,
      discoveryChannel && discoveryChannel !== 'unknown' ? `Primary channel: ${discoveryChannel}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 100, temperature: 0.4 },
    });

    let raw: string;
    try {
      raw = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        },
        timeoutMs,
        'Gemini-FunnelName',
      );
    } catch (err) {
      this.logger.error({
        provider: 'Gemini-FunnelName',
        error: (err as Error).message,
        context: { descriptionLength: description.length, hasDiscoveryChannel: discoveryChannel !== 'unknown' },
      });
      throw err;
    }

    const text = this.extractGeminiText(raw);
    const cleaned = text.replace(/["']/g, '').trim();
    if (!cleaned) {
      throw new Error('Empty funnel name generated');
    }
    return cleaned.slice(0, MAX_FUNNEL_NAME_LENGTH);
  }

  async generateFunnelNameWithGroq(description: string, discoveryChannel: string): Promise<string> {
    const apiKey = this.config.get<string>('llm.groqApiKey');
    const model = this.config.get<string>('llm.groqModel') ?? 'llama-3.3-70b-versatile';
    const timeoutMs = this.config.get<number>('llm.groqTimeoutMs') ?? 60_000;

    if (!apiKey) {
      throw new Error(SYS_MSG.AI_GROQ_API_KEY_MISSING);
    }

    const systemPrompt =
      `Generate a short, memorable name (≤ ${MAX_FUNNEL_NAME_LENGTH} chars) for a marketing funnel based on the business context. ` +
      'Make it specific and brandable. ' +
      'Return ONLY the name. No quotes, no markdown, no punctuation unless part of the name.';
    const userMessage = [
      `Business description: ${description}`,
      discoveryChannel && discoveryChannel !== 'unknown' ? `Primary channel: ${discoveryChannel}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const body = JSON.stringify({
      model,
      max_tokens: 100,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    let raw: string;
    try {
      raw = await this.fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        },
        timeoutMs,
        'Groq-FunnelName',
      );
    } catch (err) {
      this.logger.error({
        provider: 'Groq-FunnelName',
        error: (err as Error).message,
        context: { descriptionLength: description.length, hasDiscoveryChannel: discoveryChannel !== 'unknown' },
      });
      throw err;
    }

    const text = this.extractGroqText(raw);
    const cleaned = text.replace(/["']/g, '').trim();
    if (!cleaned) {
      throw new Error('Empty funnel name generated');
    }
    return cleaned.slice(0, MAX_FUNNEL_NAME_LENGTH);
  }

  buildPrompt(ctx: BusinessContext): string {
    return [
      ctx.business_name ? `Business name: ${ctx.business_name as string}` : null,
      `Business type: ${ctx.businessType}`,
      `Primary discovery channel: ${ctx.discoveryChannel}`,
      ctx.business_description ? `Business description: ${ctx.business_description as string}` : null,
      ctx.target_customer ? `Target customer: ${ctx.target_customer as string}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  validateLlmOutput(raw: string): LlmStageData[] | null {
    const stripped = this.stripCodeFences(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return null;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const root = parsed as Record<string, unknown>;

    if (!Array.isArray(root['stages'])) {
      return null;
    }

    const stages = root['stages'] as unknown[];

    if (stages.length !== EXPECTED_STAGE_COUNT) {
      return null;
    }

    const validated: LlmStageDataWithTasks[] = [];

    for (const item of stages) {
      const stage = this.validateStage(item);
      if (!stage) {
        return null;
      }
      validated.push(stage);
    }

    validated.sort((a, b) => a.position - b.position);

    return validated;
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, provider: string): Promise<string> {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });

      if (!res.ok) {
        const status = res.status;
        const errBody = await res.text().catch(() => '');
        this.logger.warn({
          provider,
          httpStatus: status,
          error: SYS_MSG.AI_PROVIDER_HTTP_ERROR(provider, status),
          context: errBody.slice(0, 200),
        });
        throw new Error(SYS_MSG.AI_PROVIDER_HTTP_ERROR(provider, status));
      }

      return res.text();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(SYS_MSG.AI_PROVIDER_TIMEOUT(provider, timeoutMs), { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timerId);
    }
  }

  private extractGeminiText(raw: string): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(SYS_MSG.AI_GEMINI_NON_JSON_RESPONSE_BODY);
    }

    const res = parsed as GeminiResponse;
    const text = res.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) {
      throw new Error(SYS_MSG.AI_GEMINI_RESPONSE_HAD_NO_TEXT_CONTENT);
    }

    return text;
  }

  private extractGroqText(raw: string): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(SYS_MSG.AI_GROQ_NON_JSON_RESPONSE_BODY);
    }

    const res = parsed as GroqResponse;
    const text = res.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error(SYS_MSG.AI_GROQ_RESPONSE_HAD_NO_TEXT_CONTENT);
    }

    return text;
  }

  private stripCodeFences(s: string): string {
    const t = s.trim();
    if (t.startsWith('```')) {
      return t
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
    }
    return t;
  }

  private validateStage(item: unknown): LlmStageDataWithTasks | null {
    if (typeof item !== 'object' || item === null) {
      return null;
    }

    const s = item as Record<string, unknown>;

    const position = s['position'];
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 1 || position > 4) {
      return null;
    }

    const channel = s['channel'];
    if (typeof channel !== 'string' || !channel.trim()) {
      return null;
    }

    const explanation = s['explanation'];
    if (
      typeof explanation !== 'string' ||
      explanation.length < EXPLANATION_MIN ||
      explanation.length > EXPLANATION_MAX
    ) {
      return null;
    }

    const actionPrompt = s['actionPrompt'];
    if (
      typeof actionPrompt !== 'string' ||
      actionPrompt.length < ACTION_PROMPT_MIN ||
      actionPrompt.length > ACTION_PROMPT_MAX
    ) {
      return null;
    }

    if (!Array.isArray(s['tasks'])) {
      return null;
    }

    const rawTasks = s['tasks'] as unknown[];

    if (rawTasks.length < TASKS_MIN || rawTasks.length > TASKS_MAX) {
      return null;
    }

    const tasks: StageTaskData[] = [];

    for (const t of rawTasks) {
      const task = this.validateTask(t);
      if (!task) {
        return null;
      }
      tasks.push(task);
    }

    return { position, channel, explanation, actionPrompt, tasks };
  }

  private validateTask(item: unknown): StageTaskData | null {
    if (typeof item !== 'object' || item === null) {
      return null;
    }

    const t = item as Record<string, unknown>;
    const name = t['name'];
    const taskText = t['taskText'];

    if (typeof name !== 'string' || !name.trim() || typeof taskText !== 'string' || !taskText.trim()) {
      return null;
    }

    return { name, taskText };
  }
}
