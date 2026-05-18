import { Injectable } from '@nestjs/common';
import type { BusinessContext } from '../interfaces/generate-funnel-job.interface';
import type { LlmStageData } from '../interfaces/llm-stage-data.interface';

@Injectable()
export class FunnelTemplateService {
  getTemplate(ctx: BusinessContext): LlmStageData[] {
    const { businessType: biz, discoveryChannel: ch } = ctx;

    return [
      {
        position: 1,
        channel: ch,
        explanation:
          `Help ${biz} businesses get noticed on ${ch} by showing up consistently ` +
          `where your ideal customers spend time. Focus on visibility before conversion.`,
        actionPrompt:
          `Post 3 times on ${ch} this week showcasing what makes your ${biz} business unique. ` +
          `Use local hashtags and engage with 5 accounts in your niche each day.`,
        tasks: [
          { taskText: `Create 3 posts for ${ch} highlighting your ${biz} offer` },
          { taskText: `Engage with 5 accounts in your niche daily for 7 days` },
          { taskText: `Add your ${ch} handle to all customer-facing materials` },
        ],
      },
      {
        position: 2,
        channel: ch,
        explanation:
          `Spark interest with content that shows the value behind your ${biz} business. ` +
          `Stories, testimonials, and behind-the-scenes content build trust.`,
        actionPrompt:
          `Share one customer success story or testimonial on ${ch}. ` +
          `If you don't have one yet, document your journey and show the transformation you deliver.`,
        tasks: [
          { taskText: `Collect or create one customer testimonial to share` },
          { taskText: `Post a behind-the-scenes look at how your ${biz} business operates` },
          { taskText: `Add a clear call-to-action to your ${ch} profile or bio` },
        ],
      },
      {
        position: 3,
        channel: ch,
        explanation:
          `Turn interested followers into paying customers for your ${biz} business. ` +
          `Make the first purchase as easy and low-risk as possible.`,
        actionPrompt:
          `Create a starter offer this week and share it twice on ${ch} ` +
          `with a direct link or clear instruction on how to buy.`,
        tasks: [
          { taskText: `Define a clear starter offer or entry-level product/service` },
          { taskText: `Post the offer on ${ch} with a direct purchase path` },
          { taskText: `Follow up with anyone who showed interest in the last 14 days` },
        ],
      },
      {
        position: 4,
        channel: ch,
        explanation:
          `Your best customers already bought from you. Bring them back to your ${biz} ` +
          `business with consistent follow-up, loyalty touches, and new offers.`,
        actionPrompt:
          `Reach out to your last 5 customers — a thank-you, a check-in, ` +
          `or an exclusive returning-customer offer. Retention is cheaper than acquisition.`,
        tasks: [
          { taskText: `Message your last 5 customers with a personalised thank-you or update` },
          { taskText: `Create a simple loyalty incentive (discount, early access, or bonus)` },
          { taskText: `Post a returning-customer offer on ${ch}` },
        ],
      },
    ];
  }
}
