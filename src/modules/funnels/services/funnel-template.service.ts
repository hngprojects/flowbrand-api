import { Injectable } from '@nestjs/common';
import type { BusinessContext } from '../interfaces/generate-funnel-job.interface';
import type { LlmStageData } from '../interfaces/llm-stage-data.interface';

const STAGE_NAMES = [
  'Get Noticed',
  'Spark Interest',
  'Make First Sale',
  'Bring Them Back',
] as const;

@Injectable()
export class FunnelTemplateService {
  getTemplate(
    businessType: string,
    discoveryChannel: string,
    _ctx: BusinessContext,
  ): LlmStageData[] {
    return [
      {
        position: 1,
        channel: discoveryChannel,
        explanation: `Help ${businessType} businesses get noticed on ${discoveryChannel} by showing up consistently where your ideal customers already spend time. Focus on visibility before conversion
        actionPrompt: `This week, post 3 times on ${discoveryChannel} showcasing what makes your ${businessType} business unique. Use local hashtags and engage with 5 accounts in your niche each day.`
        tasks: [
          { taskText: `Create 3 posts for ${discoveryChannel} highlighting your ${businessType} offer` },
          { taskText: `Engage with 5 accounts in your niche daily for 7 days` },
          { taskText: `Add your ${discoveryChannel} handle to all customer-facing materials` },
        ],
      },
      {
        position: 2,
        channel: discoveryChannel,
        explanation: `Once people know you exist, spark their interest with content that shows the value behind your ${businessType} business. Stories, testimonials, and behind-the-scenes build trust.
        actionPrompt: `Share one customer success story or testimonial on ${discoveryChannel}. If you don't have one yet, document your own journey this week and show the transformation your business 
        tasks: [
          { taskText: `Collect or create one customer testimonial to share` },
          { taskText: `Post a behind-the-scenes look at how your ${businessType} business operates` },
          { taskText: `Add a clear call-to-action to your ${discoveryChannel} profile or bio` },
        ],
      },
      {
        position: 3,
        channel: discoveryChannel,
        explanation: `Turn interested followers into paying customers for your ${businessType} business. Make the first purchase as easy and low-risk as possible.`,
        actionPrompt: `Create a starter offer or introductory deal this week. Share it twice on ${discoveryChannel} with a direct link or clear instruction on how to buy. Remove every barrier between 
        tasks: [
          { taskText: `Define a clear starter offer or entry-level product/service` },
          { taskText: `Post the offer on ${discoveryChannel} with a direct purchase path` },
          { taskText: `Follow up with anyone who showed interest in the last 14 days` },
        ],
      },
      {
        position: 4,
        channel: discoveryChannel,
        explanation: `Your best customers are the ones who already bought from you. Bring them back to your ${businessType} business with consistent follow-up, loyalty touches, and new offers.`,
        actionPrompt: `Reach out to your last 5 customers this week — a thank-you message, a check-in, or an exclusive returning-customer offer. Retention is cheaper than acquisition.`,
        tasks: [
          { taskText: `Message your last 5 customers with a personalised thank-you or update` },
          { taskText: `Create a simple loyalty incentive (discount, early access, or bonus)` },
          { taskText: `Post a returning-customer offer on ${discoveryChannel}` },
        ],
      },
    ];
  }
}
