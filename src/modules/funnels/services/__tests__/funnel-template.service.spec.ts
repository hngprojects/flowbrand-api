import { Test, TestingModule } from '@nestjs/testing';
import { TEMPLATE_LIBRARY } from '../../data/funnel-templates.data';
import type { BusinessContext } from '../../interfaces/generate-funnel-job.interface';
import { FunnelTemplateService } from '../funnel-template.service';

const CANONICAL_STAGE_NAMES = ['Get Noticed', 'Spark Interest', 'Make First Sale', 'Bring Them Back'] as const;

// Stage name is implicit by position in the LlmStageData output (matches the
// shape the AI service returns). The template engine maps position -> name
// internally; tests assert via this mapping.
const POSITION_TO_NAME: Record<number, string> = {
  1: 'Get Noticed',
  2: 'Spark Interest',
  3: 'Make First Sale',
  4: 'Bring Them Back',
};

// BusinessContext is { businessType, discoveryChannel, [key: string]: unknown }
// so extra fields are typed as unknown. The AI service uses snake_case for
// these (business_description, target_customer); the template service tolerates
// both case styles via readString().
const BASE_CONTEXT = {
  businessType: 'restaurant',
  discoveryChannel: 'Instagram',
  business_name: 'Mama Adunni Kitchen',
  business_description: 'Casual jollof rice and grilled fish spot',
  target_customer: 'busy office workers',
  userId: 'user-1',
} as unknown as BusinessContext;

describe('FunnelTemplateService - getTemplate', () => {
  let service: FunnelTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FunnelTemplateService],
    }).compile();

    service = module.get<FunnelTemplateService>(FunnelTemplateService);
  });

  describe('AC-01: stage shape and canonical naming', () => {
    it('AC-01: returns 4 stages with positions mapping to canonical stage names ["Get Noticed","Spark Interest","Make First Sale","Bring Them Back"]', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        businessType: 'restaurant',
        discoveryChannel: 'Instagram',
      } as unknown as BusinessContext);

      expect(result).toHaveLength(4);
      expect(result.map((s) => POSITION_TO_NAME[s.position])).toEqual(Array.from(CANONICAL_STAGE_NAMES));
    });

    it('AC-01: stage positions are 1, 2, 3, 4 in order', () => {
      const result = service.getTemplate(BASE_CONTEXT);
      expect(result.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('AC-02: business_name substitution', () => {
    it('AC-02: replaces {{business_name}} with context.business_name everywhere', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        business_name: 'Acme Bakery',
      } as unknown as BusinessContext);

      const allText = serializeAllText(result);
      expect(allText).toContain('Acme Bakery');
    });

    it('AC-02: replaces {{business_name}} with "your business" when context.business_name is null', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        business_name: null,
      } as unknown as BusinessContext);

      const allText = serializeAllText(result);
      expect(allText).toContain('your business');
    });
  });

  describe('AC-03: no unreplaced variable tokens', () => {
    it('AC-03: output contains no {{variable}} tokens for a fully populated context', () => {
      const result = service.getTemplate(BASE_CONTEXT);
      expect(serializeAllText(result)).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('AC-03: output contains no {{variable}} tokens even when every context field is missing', () => {
      const result = service.getTemplate({
        businessType: '',
        discoveryChannel: '',
      });
      expect(serializeAllText(result)).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('AC-03: unknown {{tokens}} are humanized rather than leaked', () => {
      // Use a real template (no synthetic injection); confirm sweep handles
      // the universe of tokens our PMs wrote.
      for (const template of TEMPLATE_LIBRARY) {
        const result = service.getTemplate({
          businessType: template.businessType[0],
          discoveryChannel: 'Facebook',
          business_name: 'Test',
          target_customer: 'shoppers',
          business_description: 'cakes and pastries',
        } as unknown as BusinessContext);
        expect(serializeAllText(result)).not.toMatch(/\{\{[^}]+\}\}/);
      }
    });
  });

  describe('AC-04: unmapped businessType falls back to a valid 4-stage array', () => {
    it('AC-04: getTemplate() with businessType="unknown_type" returns a valid 4-stage array', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        businessType: 'unknown_type',
      });

      expect(result).toHaveLength(4);
      expect(result.every((s) => s.tasks.length >= 2 && s.tasks.length <= 3)).toBe(true);
    });
  });

  describe('AC-05: never throws regardless of input', () => {
    it('AC-05: does not throw on null businessType', () => {
      expect(() =>
        service.getTemplate({
          ...BASE_CONTEXT,
          businessType: null as unknown as string,
        }),
      ).not.toThrow();
    });

    it('AC-05: does not throw on undefined businessType', () => {
      expect(() =>
        service.getTemplate({
          ...BASE_CONTEXT,
          businessType: undefined as unknown as string,
        }),
      ).not.toThrow();
    });

    it('AC-05: does not throw on empty-string businessType', () => {
      expect(() => service.getTemplate({ ...BASE_CONTEXT, businessType: '' })).not.toThrow();
    });

    it('AC-05: does not throw on null discoveryChannel', () => {
      expect(() =>
        service.getTemplate({
          ...BASE_CONTEXT,
          discoveryChannel: null as unknown as string,
        }),
      ).not.toThrow();
    });

    it('AC-05: does not throw on completely empty context', () => {
      expect(() => service.getTemplate({} as unknown as BusinessContext)).not.toThrow();
    });

    it('AC-05: does not throw on null context', () => {
      expect(() => service.getTemplate(null as unknown as BusinessContext)).not.toThrow();
    });
  });

  describe('AC-06: under 100ms', () => {
    it('AC-06: getTemplate completes in under 100ms', () => {
      const start = Date.now();
      service.getTemplate(BASE_CONTEXT);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it('AC-06: 100 sequential getTemplate calls complete in under 100ms total', () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        service.getTemplate(BASE_CONTEXT);
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('AC-07: every template in the library is reachable and renders non-empty stages', () => {
    it.each(TEMPLATE_LIBRARY.map((t) => [t.id, t.businessType[0]] as const))(
      'AC-07: template %s renders non-empty for businessType "%s"',
      (_id, businessType) => {
        const result = service.getTemplate({
          ...BASE_CONTEXT,
          businessType,
        });

        expect(result).toHaveLength(4);
        for (const stage of result) {
          expect(stage.explanation.length).toBeGreaterThan(0);
          expect(stage.actionPrompt.length).toBeGreaterThan(0);
          expect(stage.tasks.length).toBeGreaterThanOrEqual(2);
          expect(stage.tasks.length).toBeLessThanOrEqual(3);
        }
      },
    );
  });

  describe('AC-08: emergency fallback', () => {
    it('AC-08: emergency template fires and logs when renderTemplate throws', () => {
      const loggerError = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      // Force the substitution stage to throw by stubbing a private method.
      const renderSpy = jest
        .spyOn(service as unknown as { renderTemplate: (...args: unknown[]) => unknown }, 'renderTemplate')
        .mockImplementation(() => {
          throw new Error('forced render failure');
        });

      const result = service.getTemplate(BASE_CONTEXT);

      expect(result).toHaveLength(4);
      expect(result.every((s) => s.tasks.length >= 2 && s.tasks.length <= 3)).toBe(true);

      const logCall = loggerError.mock.calls.at(-1)?.[0];
      const logJson = typeof logCall === 'string' ? logCall : JSON.stringify(logCall);
      expect(logJson).toContain('emergency_template_used');

      renderSpy.mockRestore();
      loggerError.mockRestore();
    });
  });

  describe('AC-09: shape matches LlmStageData', () => {
    it('AC-09: every stage has position, channel, explanation, actionPrompt, tasks with taskText (same shape AI service emits)', () => {
      const result = service.getTemplate(BASE_CONTEXT);
      const ALLOWED_KEYS = new Set(['position', 'channel', 'explanation', 'actionPrompt', 'tasks']);
      for (const stage of result) {
        expect(typeof stage.position).toBe('number');
        expect(typeof stage.channel).toBe('string');
        expect(typeof stage.explanation).toBe('string');
        expect(typeof stage.actionPrompt).toBe('string');
        expect(Array.isArray(stage.tasks)).toBe(true);
        for (const task of stage.tasks) {
          expect(typeof task.taskText).toBe('string');
          expect(task.taskText.length).toBeGreaterThan(0);
        }
        // Guards against accidental extra fields that the processor would reject.
        for (const key of Object.keys(stage)) {
          expect(ALLOWED_KEYS.has(key)).toBe(true);
        }
      }
    });
  });

  describe('AC-10: task count is 2-3 per stage', () => {
    it.each(TEMPLATE_LIBRARY.map((t) => [t.id, t.businessType[0]] as const))(
      'AC-10: template %s produces 2-3 tasks per stage',
      (_id, businessType) => {
        const result = service.getTemplate({
          ...BASE_CONTEXT,
          businessType,
        });

        for (const stage of result) {
          expect(stage.tasks.length).toBeGreaterThanOrEqual(2);
          expect(stage.tasks.length).toBeLessThanOrEqual(3);
        }
      },
    );
  });

  describe('EC-01: businessType is null', () => {
    it('EC-01: null businessType defaults to a valid template without exception', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        businessType: null as unknown as string,
      });
      expect(result).toHaveLength(4);
    });
  });

  describe('EC-02: business_name is null', () => {
    it('EC-02: null business_name produces output with "your business" and no {{business_name}}', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        business_name: null,
      } as unknown as BusinessContext);
      const allText = serializeAllText(result);
      expect(allText).not.toContain('{{business_name}}');
      expect(allText).toContain('your business');
    });
  });

  describe('EC-04: literal braces in copy', () => {
    it('EC-04: emergency template contains no double-brace literals', () => {
      // Force fallback path
      jest
        .spyOn(service as unknown as { renderTemplate: (...args: unknown[]) => unknown }, 'renderTemplate')
        .mockImplementation(() => {
          throw new Error('forced');
        });
      const result = service.getTemplate(BASE_CONTEXT);
      expect(serializeAllText(result)).not.toMatch(/\{\{|\}\}/);
    });
  });

  describe('EC-05: discoveryChannel unknown to template', () => {
    it('EC-05: an unmapped discoveryChannel still resolves to the businessType-level template', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        businessType: 'restaurant',
        discoveryChannel: 'CarrierPigeon',
      });
      expect(result).toHaveLength(4);
    });
  });

  describe('SEC-02: XSS sanitisation of context values', () => {
    it('SEC-02: strips dangerous characters from business_name before substitution', () => {
      const result = service.getTemplate({
        ...BASE_CONTEXT,
        business_name: '<script>alert(1)</script>Acme',
      } as unknown as BusinessContext);
      const allText = serializeAllText(result);
      expect(allText).not.toContain('<script>');
      expect(allText).not.toContain('</script>');
      expect(allText).toContain('Acme');
    });
  });
});

function serializeAllText(
  stages: ReadonlyArray<{
    channel: string;
    explanation: string;
    actionPrompt: string;
    tasks: ReadonlyArray<{ taskText: string }>;
  }>,
): string {
  return stages
    .map((s) => [s.channel, s.explanation, s.actionPrompt, ...s.tasks.map((t) => t.taskText)].join('\n'))
    .join('\n');
}
