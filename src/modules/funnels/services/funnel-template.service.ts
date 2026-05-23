import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_TEMPLATE,
  TEMPLATE_LIBRARY,
  TemplateDefinition,
  TemplateStageDefinition,
} from '../data/funnel-templates.data';
import type { BusinessContext } from '../interfaces/generate-funnel-job.interface';
import type { LlmStageData, StageTaskData } from '../interfaces/llm-stage-data.interface';

const VARIABLE_TOKEN = /\{\{(\w+)\}\}/g;
const XSS_DANGEROUS_CHARS = /[<>"'`]|[\u200B-\u200F\u202A-\u202E]/g;

/**
 * BE-306 template fallback engine.
 *
 * Public contract:
 *   getTemplate(ctx): LlmStageData[]  // synchronous, never throws
 *
 * Selection priority:
 *   1. Exact businessType match (case-insensitive) against any template's businessType[]
 *   2. Industry-level match against any template's industry
 *   3. DEFAULT_TEMPLATE
 *
 * Personalisation:
 *   {{business_name}}      -> ctx.businessName       (or 'your business')
 *   {{product}} / {{service}} -> derived from ctx.businessDescription (or 'your product/service')
 *   {{target_customer}}    -> ctx.targetCustomer     (or 'your ideal customer')
 *   {{discovery_channel}}  -> ctx.discoveryChannel   (or 'your main channel')
 *   any other {{token}}    -> the token name as plain English (final sweep, never surfaces braces to the user)
 *
 * Performance: pure in-memory string ops. No I/O. No async. <100ms target (AC-06).
 * Safety: getTemplate() wraps the full pipeline in try/catch and returns an
 *         emergency template on any unexpected failure (AC-08).
 */
@Injectable()
export class FunnelTemplateService {
  private readonly logger = new Logger(FunnelTemplateService.name);

  getTemplate(ctx: BusinessContext, userId?: string): LlmStageData[] {
    try {
      const safeCtx = this.normalizeContext(ctx);
      const template = this.selectTemplate(safeCtx.businessType, safeCtx.discoveryChannel);
      return this.renderTemplate(template, safeCtx);
    } catch (err) {
      this.logger.error({
        event: 'emergency_template_used',
        userId: userId ?? null,
        error: (err as Error)?.message ?? 'unknown',
      });
      return this.emergencyTemplate(ctx);
    }
  }

  private selectTemplate(businessType: string, discoveryChannel: string): TemplateDefinition {
    const businessKey = (businessType ?? '').toLowerCase();
    const channelKey = (discoveryChannel ?? '').toLowerCase();

    if (businessKey) {
      // 1a: exact businessType + channelMatch when both present
      if (channelKey) {
        const channelHit = TEMPLATE_LIBRARY.find(
          (t) =>
            t.businessType.some((b) => b.toLowerCase() === businessKey) &&
            t.channelMatch?.some((c) => c.toLowerCase() === channelKey),
        );
        if (channelHit) return channelHit;
      }

      // 1b: exact businessType match without channel
      const businessHit = TEMPLATE_LIBRARY.find((t) =>
        t.businessType.some((b) => b.toLowerCase() === businessKey),
      );
      if (businessHit) return businessHit;

      // 2: industry-level match (treat businessType as an industry id)
      const industryHit = TEMPLATE_LIBRARY.find((t) => t.industry.toLowerCase() === businessKey);
      if (industryHit) return industryHit;
    }

    // 3: default
    return DEFAULT_TEMPLATE;
  }

  private renderTemplate(template: TemplateDefinition, ctx: NormalizedContext): LlmStageData[] {
    return template.stages.map((stage) => this.renderStage(stage, ctx));
  }

  private renderStage(stage: TemplateStageDefinition, ctx: NormalizedContext): LlmStageData {
    return {
      position: stage.position,
      channel: this.substitute(stage.channel, ctx),
      explanation: this.substitute(stage.explanation, ctx),
      actionPrompt: this.substitute(stage.actionPrompt, ctx),
      tasks: stage.tasks.map<StageTaskData>((t) => ({ taskText: this.substitute(t, ctx) })),
    };
  }

  private substitute(raw: string, ctx: NormalizedContext): string {
    if (!raw) return '';

    // Known variables first
    let out = raw
      .replace(/\{\{business_name\}\}/g, ctx.businessName)
      .replace(/\{\{product\}\}/g, ctx.product)
      .replace(/\{\{service\}\}/g, ctx.service)
      .replace(/\{\{target_customer\}\}/g, ctx.targetCustomer)
      .replace(/\{\{discovery_channel\}\}/g, ctx.discoveryChannel);

    // Final sweep: any remaining {{token}} becomes a readable fallback.
    // AC-03 requires no {{variable}} tokens in output.
    out = out.replace(VARIABLE_TOKEN, (_, token: string) =>
      this.humanizeToken(typeof token === 'string' ? token : ''),
    );

    return out;
  }

  private humanizeToken(token: string): string {
    if (!token) return 'your business';
    return token.replace(/_/g, ' ').toLowerCase();
  }

  private normalizeContext(ctx: BusinessContext | null | undefined): NormalizedContext {
    const safe = ctx ?? ({} as BusinessContext);
    // BusinessContext is { businessType, discoveryChannel, [key: string]: unknown },
    // so additional fields arrive via the index signature. The AI service uses
    // snake_case (business_description, target_customer) so we read both
    // snake_case and camelCase to be tolerant of either caller convention.
    const businessName = this.readString(safe, 'business_name', 'businessName') || 'your business';
    const targetCustomer =
      this.readString(safe, 'target_customer', 'targetCustomer') || 'your ideal customer';
    const discoveryChannel = this.sanitize(safe.discoveryChannel) || 'your main channel';
    const businessDescription = this.readString(
      safe,
      'business_description',
      'businessDescription',
    );
    const derivedProductService = this.deriveProductService(businessDescription);
    return {
      businessType: this.sanitize(safe.businessType) ?? '',
      discoveryChannel,
      businessName,
      targetCustomer,
      product: derivedProductService,
      service: derivedProductService,
    };
  }

  private readString(
    ctx: BusinessContext,
    snake: string,
    camel: string,
  ): string {
    const raw = ctx[snake] ?? ctx[camel];
    return typeof raw === 'string' ? this.sanitize(raw) : '';
  }

  private deriveProductService(description: string): string {
    if (!description || !description.trim()) return 'your product/service';
    const firstNoun = description
      .split(/[\s,.;:!?]+/)
      .find((word) => /^[A-Za-z][A-Za-z-]{2,}$/.test(word));
    return firstNoun ? firstNoun.toLowerCase() : 'your product/service';
  }

  private sanitize<T extends string | null | undefined>(value: T): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.replace(XSS_DANGEROUS_CHARS, '').slice(0, 200);
  }

  private emergencyTemplate(ctx: BusinessContext | null | undefined): LlmStageData[] {
    const safe = ctx ?? ({} as BusinessContext);
    const businessName =
      this.readString(safe, 'business_name', 'businessName') || 'your business';
    const channel = this.sanitize(safe.discoveryChannel) || 'your main channel';

    const toTasks = (lines: readonly string[]): StageTaskData[] =>
      lines.map((taskText) => ({ taskText }));

    return [
      {
        position: 1,
        channel,
        explanation:
          `Build visibility for ${businessName} where your potential customers already spend time. ` +
          'Post consistent, useful content and ask current customers to refer one person each week.',
        actionPrompt: `Post 3 pieces of content on ${channel} this week showing what you do and why it matters.`,
        tasks: toTasks([
          'Post 3 pieces of content this week showing what you do',
          'Ask 3 current customers to refer one person each',
          'Update your business profile with photos, contact, and a clear offer',
        ]),
      },
      {
        position: 2,
        channel,
        explanation:
          `Build trust around ${businessName} with stories, testimonials, and quick personal replies. ` +
          'People buy from businesses that feel responsive and credible.',
        actionPrompt: 'Reply to every enquiry within 2 hours this week and share one customer testimonial.',
        tasks: toTasks([
          'Reply to every enquiry within 2 hours during business hours',
          'Share one customer testimonial with a real photo or quote',
          'Post one behind-the-scenes story showing how your business operates',
        ]),
      },
      {
        position: 3,
        channel,
        explanation:
          `Make it easy for someone to buy from ${businessName} for the first time. ` +
          'Show clear prices, a simple ordering flow, and a small first-time incentive.',
        actionPrompt:
          'Pin a simple order flow to your business profile this week and offer a first-time customer incentive.',
        tasks: toTasks([
          'Pin a clear order flow (name, what they want, where to send it) on your business profile',
          'Show prices openly on every product or service post',
          'Offer a first-time customer incentive with a clear time limit',
        ]),
      },
      {
        position: 4,
        channel,
        explanation:
          `Retention beats acquisition. ${businessName} stands out by following up after the sale, ` +
          'rewarding referrals, and creating a small community of repeat customers.',
        actionPrompt: 'Send a personal check-in to every customer 7-10 days after their purchase this week.',
        tasks: toTasks([
          'Send a personal WhatsApp or email check-in 7-10 days after every purchase',
          'Launch a refer-a-friend reward (both parties benefit)',
          'Build a VIP customer group for exclusive offers and early access',
        ]),
      },
    ];
  }
}

interface NormalizedContext {
  businessType: string;
  discoveryChannel: string;
  businessName: string;
  targetCustomer: string;
  product: string;
  service: string;
}
