import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { BusinessContext } from '../funnels/interfaces/generate-funnel-job.interface';
import { LlmServiceImpl } from './llm.service';
import * as SYS_MSG from '../../constants/system.messages';

const VALID_CTX: BusinessContext = {
  businessType: 'food vendor',
  discoveryChannel: 'WhatsApp',
};

const VALID_STAGES_JSON = JSON.stringify({
  stages: [1, 2, 3, 4].map((position) => ({
    position,
    channel: 'WhatsApp',
    explanation: 'This is a valid explanation with enough characters to pass.',
    actionPrompt: 'Do this one clear action right now.',
    tasks: [{ name: 'N1', taskText: 'Task one' }, { name: 'N2', taskText: 'Task two' }, { name: 'N3', taskText: 'Task three' }],
  })),
});

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: (key: string) => {
      const defaults: Record<string, unknown> = {
        'llm.geminiApiKey': 'test-gemini-key',
        'llm.geminiModel': 'gemini-2.5-flash',
        'llm.geminiTimeoutMs': 60_000,
        'llm.groqApiKey': 'test-groq-key',
        'llm.groqModel': 'llama-3.3-70b-versatile',
        'llm.groqTimeoutMs': 60_000,
      };
      return overrides[key] ?? defaults[key];
    },
  } as unknown as ConfigService;
}

describe('LlmServiceImpl', () => {
  let service: LlmServiceImpl;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LlmServiceImpl, { provide: ConfigService, useValue: makeConfigService() }],
    })
      .compile();

    service = module.get(LlmServiceImpl);
    // Silences the expected LlmServiceImpl error and warn logs during tests
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  });

  describe('validateLlmOutput', () => {
    it('AC-01/AC-02: returns 4 stages for valid JSON', () => {
      const result = service.validateLlmOutput(VALID_STAGES_JSON);
      expect(result).toHaveLength(4);
    });

    it('AC-07: strips markdown code fences before parsing', () => {
      const fenced = '```json\n' + VALID_STAGES_JSON + '\n```';
      const result = service.validateLlmOutput(fenced);
      expect(result).toHaveLength(4);
    });

    it('EC-01: rejects when stages count is 3', () => {
      const bad = JSON.stringify({
        stages: [1, 2, 3].map((position) => ({
          position,
          channel: 'WhatsApp',
          explanation: 'Valid explanation text here.',
          actionPrompt: 'Do this action now.',
          tasks: [{ name: 'N1', taskText: 'T1' }, { name: 'N2', taskText: 'T2' }],
        })),
      });
      expect(service.validateLlmOutput(bad)).toBeNull();
    });

    it('AC-03: rejects when stages key is missing', () => {
      expect(service.validateLlmOutput(JSON.stringify({ foo: [] }))).toBeNull();
    });

    it('AC-04: rejects explanation > 2000 chars', () => {
      const stages = JSON.parse(VALID_STAGES_JSON);
      stages.stages[0].explanation = 'x'.repeat(2001);
      expect(service.validateLlmOutput(JSON.stringify(stages))).toBeNull();
    });

    it('EC-02: rejects tasks array with 1 item', () => {
      const stages = JSON.parse(VALID_STAGES_JSON);
      stages.stages[0].tasks = [{ name: 'N1', taskText: 'Only one' }];
      expect(service.validateLlmOutput(JSON.stringify(stages))).toBeNull();
    });

    it('returns null for invalid JSON string', () => {
      expect(service.validateLlmOutput('not json at all')).toBeNull();
    });

    it('EC-06: sorts stages by position', () => {
      const shuffled = JSON.parse(VALID_STAGES_JSON);
      shuffled.stages.reverse();
      const result = service.validateLlmOutput(JSON.stringify(shuffled));
      expect(result?.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('generateWithGemini', () => {
    it('AC-01: returns 4 stages on valid response', async () => {
      const geminiWrapped = JSON.stringify({
        candidates: [{ content: { parts: [{ text: VALID_STAGES_JSON }] } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(geminiWrapped),
      } as unknown as Response);

      const result = await service.generateWithGemini(VALID_CTX);
      expect(result).toHaveLength(4);
    });

    it('AC-03: throws when Gemini output fails schema validation', async () => {
      const geminiWrapped = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"stages":[]}' }] } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(geminiWrapped),
      } as unknown as Response);

      await expect(service.generateWithGemini(VALID_CTX)).rejects.toThrow(
        SYS_MSG.AI_GEMINI_OUTPUT_FAILED_SCHEMA_VALIDATION,
      );
    });

    it('AC-05: throws timeout error when fetch exceeds timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = jest.fn().mockRejectedValueOnce(abortError);

      await expect(service.generateWithGemini(VALID_CTX)).rejects.toThrow(
        SYS_MSG.AI_PROVIDER_TIMEOUT('Gemini', 60_000),
      );
    });

    it('AC-10: maxOutputTokens=4096 is in the request body', async () => {
      const geminiWrapped = JSON.stringify({
        candidates: [{ content: { parts: [{ text: VALID_STAGES_JSON }] } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(geminiWrapped),
      } as unknown as Response);

      await service.generateWithGemini(VALID_CTX);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.generationConfig.maxOutputTokens).toBe(4096);
    });
  });

  describe('generateWithGroq', () => {
    it('AC-02: returns 4 stages on valid response', async () => {
      const groqWrapped = JSON.stringify({
        choices: [{ message: { content: VALID_STAGES_JSON } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(groqWrapped),
      } as unknown as Response);

      const result = await service.generateWithGroq(VALID_CTX);
      expect(result).toHaveLength(4);
    });

    it('throws when Groq API returns non-JSON body', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('<html>502 Bad Gateway</html>'),
      } as unknown as Response);

      await expect(service.generateWithGroq(VALID_CTX)).rejects.toThrow(SYS_MSG.AI_GROQ_NON_JSON_RESPONSE_BODY);
    });

    it('throws when Groq output fails schema validation', async () => {
      const groqWrapped = JSON.stringify({
        choices: [{ message: { content: 'not json' } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(groqWrapped),
      } as unknown as Response);

      await expect(service.generateWithGroq(VALID_CTX)).rejects.toThrow(
        SYS_MSG.AI_GROQ_OUTPUT_FAILED_SCHEMA_VALIDATION,
      );
    });

    it('AC-10: max_tokens=4096 is in the request body', async () => {
      const groqWrapped = JSON.stringify({
        choices: [{ message: { content: VALID_STAGES_JSON } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(groqWrapped),
      } as unknown as Response);

      await service.generateWithGroq(VALID_CTX);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.max_tokens).toBe(4096);
    });
  });

  describe('generateFunnelNameWithGemini', () => {
    it('returns generated and sanitized name on valid response', async () => {
      const geminiWrapped = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '"My Awesome Store"' }] } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(geminiWrapped),
      } as unknown as Response);

      const result = await service.generateFunnelNameWithGemini('We sell great custom clothes', 'Instagram');
      expect(result).toBe('My Awesome Store');
    });

    it('throws error when generated name is empty', async () => {
      const geminiWrapped = JSON.stringify({
        candidates: [{ content: { parts: [{ text: '""' }] } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(geminiWrapped),
      } as unknown as Response);

      await expect(service.generateFunnelNameWithGemini('text', 'unknown')).rejects.toThrow('Empty funnel name generated');
    });
  });

  describe('generateFunnelNameWithGroq', () => {
    it('returns generated and sanitized name on valid response', async () => {
      const groqWrapped = JSON.stringify({
        choices: [{ message: { content: 'My Awesome Cafe' } }],
      });

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(groqWrapped),
      } as unknown as Response);

      const result = await service.generateFunnelNameWithGroq('Delicious coffee shop', 'WhatsApp');
      expect(result).toBe('My Awesome Cafe');
    });
  });

  describe('buildPrompt', () => {
    it('includes business_name as first line when present', () => {
      const prompt = service.buildPrompt({
        ...VALID_CTX,
        business_name: 'TechCorp',
        business_description: 'We sell software',
        target_customer: 'SMEs',
      });
      const lines = prompt.split('\n');
      expect(lines[0]).toBe('Business name: TechCorp');
      expect(prompt).toContain('Business type: food vendor');
      expect(prompt).toContain('Business description: We sell software');
      expect(prompt).toContain('Target customer: SMEs');
    });

    it('omits Business name line when business_name is absent', () => {
      const prompt = service.buildPrompt(VALID_CTX);
      expect(prompt).not.toContain('Business name:');
      expect(prompt.split('\n')[0]).toBe('Business type: food vendor');
    });
  });
});
