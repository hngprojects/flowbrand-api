import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

/**
 * Beauty PM provided one universal template covering the whole industry.
 * We expose a single TemplateDefinition keyed broadly so any beauty
 * businessType resolves to it.
 */

const BEAUTY_GENERAL: TemplateDefinition = {
  id: 'beauty:general',
  industry: 'beauty',
  businessType: ['beauty', 'cosmetics', 'skincare', 'salon', 'beauty_brand', 'beauty_service', 'makeup'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Before-and-after content is the strongest trust signal in beauty. {{business_name}} needs ' +
        '{{target_customer}} to see real results (skincare glow, brow shaping, lip colour) with ' +
        '{{product}} visible in the photo and price stated clearly.',
      actionPrompt:
        'Post 3 before-and-after transformation photos this week on {{discovery_channel}}. Always include your price and how to order.',
      tasks: [
        'Post 3 before-and-after transformation photos showing a real result',
        'Create a "What\'s in my kit" 30-60 second reel naming the products you use daily',
        'Share one beauty tip on WhatsApp Status every day for the next 7 days',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Speed of reply is a conversion factor. A {{target_customer}} who messages at 10am and hears ' +
        'back at 6pm has already bought elsewhere. {{business_name}} wins by combining polls, fast ' +
        'replies, and visible testimonials.',
      actionPrompt:
        'Run a 3-question skin or beauty quiz on Stories this week. DM every respondent a personalised product recommendation.',
      tasks: [
        'Run a "skin type quiz" or "beauty match" poll on Stories and DM personalised follow-ups',
        'Reply to every comment and DM within 2 hours, ending with an open question',
        'Share one customer testimonial with their photo every 2 days',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'The number one reason {{target_customer}} does not buy is confusion. Simplify ordering, show ' +
        'price openly, and add a time-limited first-buyer incentive to push hesitant prospects over ' +
        'the line.',
      actionPrompt:
        'Pin a one-message order flow to WhatsApp this week. Display prices on every post and offer a first-time buyer incentive.',
      tasks: [
        'Pin a simple "send your name, address, and product" order flow to your WhatsApp profile',
        'Display your price clearly on every product post and DM',
        'Offer a first-time buyer incentive (free delivery, free add-on) with a clear time limit',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Most beauty sellers never follow up. {{business_name}} stands out by checking in personally, ' +
        'running a referral programme, and building a VIP WhatsApp group where customers feel like ' +
        'insiders.',
      actionPrompt:
        'Send a post-purchase check-in 7-10 days after every order. Launch a refer-a-friend reward and invite customers to a VIP group.',
      tasks: [
        'Send a personal WhatsApp check-in 7-10 days after every purchase',
        'Launch a refer-a-friend reward (both customer and friend benefit)',
        'Build a VIP customer WhatsApp group for exclusive restocks and early access',
      ],
    },
  ],
};

export const BEAUTY_TEMPLATES: readonly TemplateDefinition[] = [BEAUTY_GENERAL] as const;
