import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

const GYM_FITNESS_COACH: TemplateDefinition = {
  id: 'health_fitness:gym_coach',
  industry: 'health_fitness',
  businessType: ['gym', 'fitness_coach', 'personal_trainer', 'weight_loss_coach'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Before-and-after transformation photos are the strongest trust signal in fitness. ' +
        '{{business_name}} needs {{target_customer}} to see real results (weight lost, muscle gained, ' +
        'posture improved) with permission and clear pricing.',
      actionPrompt:
        'Post 3 before-and-after photos this week. Create one workout-of-the-day reel and share daily fitness tips on WhatsApp Status.',
      tasks: [
        'Post 3 before-and-after transformation photos showing real client results',
        'Create a 30-60 second workout-of-the-day reel covering a specific exercise or goal',
        'Share one fitness tip on WhatsApp Status every day for 7 days',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Engage prospects with personalised content. {{target_customer}} responding to a poll or comment is a warm lead - speed and personalisation convert.',
      actionPrompt:
        'Run a fitness goal poll on Stories this week and DM personalised plans. Host one live fitness Q&A.',
      tasks: [
        'Run a fitness goal poll (lose weight, build muscle, gain stamina) and DM personalised replies',
        'Reply to every comment and DM within 2 hours, ending with an open question',
        'Host a free 15-minute live fitness Q&A between 6-8am or 7-9pm',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert warm leads with the simplest possible booking process. Visible pricing and a first-client incentive remove the last hesitations.',
      actionPrompt:
        'Pin a one-message booking flow this week. Show prices on every post and offer a first-time client incentive.',
      tasks: [
        'Pin a "send your name, goal, training type, location" booking flow to WhatsApp',
        'Show your prices clearly on every service post and DM',
        'Offer a first-time client incentive (free assessment, free meal guide) with a time limit',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Most fitness coaches never follow up. {{business_name}} stands out by checking in mid-programme, rewarding referrals, and running a VIP client group.',
      actionPrompt:
        'Send a post-programme check-in 7-10 days after every client starts. Launch a refer-a-friend reward and build a VIP client group.',
      tasks: [
        'Send a personal WhatsApp check-in 7-10 days after every client starts',
        'Launch a refer-a-friend reward (free session or discount for both parties)',
        'Build a VIP client WhatsApp group for daily motivation, meal plans, and member-only deals',
      ],
    },
  ],
};

const NUTRITION_WEIGHT_LOSS: TemplateDefinition = {
  id: 'health_fitness:nutrition',
  industry: 'health_fitness',
  businessType: ['nutrition', 'meal_plan', 'diet_coach', 'weight_management', 'healthy_food'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Real client transformations (weight lost, bloating reduced, energy improved) build ' +
        'credibility. {{business_name}} needs {{target_customer}} to see specific, measurable ' +
        'results: "9kg lost in 6 weeks" beats generic healthy living content.',
      actionPrompt:
        'Post 3 before-and-after transformation photos this week with real client quotes. Share local-ingredient meal prep reels.',
      tasks: [
        'Post 3 before-and-after transformation photos with real client quotes and programme name',
        'Create one healthy meal prep reel using affordable local ingredients with prices',
        'Share one nutrition tip on WhatsApp Status every day',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Nutrition clients reach out in vulnerable moments. {{business_name}} wins by replying with personalisation and warmth, not generic recommendations.',
      actionPrompt:
        'Run a "what is your eating challenge" poll this week. DM personalised tips. Host one live nutrition Q&A.',
      tasks: [
        'Run a poll asking {{target_customer}} their biggest nutrition challenge and DM personalised tips',
        'Reply to every DM within 2 hours, ending with an open question about their goal',
        'Host a free 15-20 minute live nutrition Q&A on culturally relevant topics',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert interested leads into paying meal plan or coaching clients. Frictionless ordering, visible pricing, and a first-time incentive remove the friction.',
      actionPrompt:
        'Pin a meal-plan ordering flow on WhatsApp this week. Show prices three times this week.',
      tasks: [
        'Pin a "send name, goal, food preferences, budget" order flow to WhatsApp',
        'Post pricing publicly at least 3 times per week (custom plan, 30-day programme, monthly coaching)',
        'Offer a first-time client incentive (free grocery guide, free body assessment)',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Build long-term client relationships and activate referrals. {{business_name}} stays present mid-programme and after it ends, turning one-time buyers into long-term clients.',
      actionPrompt:
        'Send a mid-programme progress check-in this week. Launch a refer-a-friend reward and start a VIP nutrition support group.',
      tasks: [
        'Send a mid-plan progress check-in and another 7 days after the plan ends',
        'Launch a refer-a-friend reward (20% off or a free snack pack for both parties)',
        'Build a private VIP nutrition group for weekly meal ideas, accountability, and subscriber-only discounts',
      ],
    },
  ],
};

const WELLNESS_COACH: TemplateDefinition = {
  id: 'health_fitness:wellness_coach',
  industry: 'health_fitness',
  businessType: ['wellness', 'mental_health_coach', 'life_coach', 'stress_management', 'burnout_coach'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Wellness transformation is emotional and life-quality based, not physical. ' +
        '{{business_name}} earns trust with authentic client stories (with consent), gentle daily ' +
        'content, and visible care for {{target_customer}}.',
      actionPrompt:
        'Post 3 anonymised client transformation stories this week with consent. Share daily grounding tips.',
      tasks: [
        'Post 3 anonymised client transformation stories per week (first names or initials only)',
        'Create a "3 signs you might be burning out" awareness reel',
        'Share one grounding wellness tip on WhatsApp Status every day',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'People reaching out about mental health have often waited a long time. {{business_name}} replies with warmth within 2 hours and treats every message as a courageous moment.',
      actionPrompt:
        'Run a gentle wellness poll this week (rate your mental energy). DM warm, personalised responses. Host one live stress audit.',
      tasks: [
        'Run a gentle "how full is your cup" or "rate your mental energy" poll',
        'Reply to every message with warmth within 2 hours, offering a free discovery call',
        'Host a free 15-20 minute live stress audit or wellness Q&A creating a safe space',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert people ready to invest in their wellbeing into committed coaching clients. A free discovery call is the most effective first step.',
      actionPrompt:
        'Pin a session booking flow this week. Display pricing gently but clearly. Offer a free 20-minute discovery call.',
      tasks: [
        'Pin a "send name and one sentence about what you want help with" booking flow',
        'Show session and package pricing regularly without apology',
        'Offer a free 20-minute discovery call with no pressure and no obligation',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Build lasting coaching relationships through between-session check-ins and a private community where {{target_customer}} feels they belong.',
      actionPrompt:
        'Send a mid-week between-session check-in to every active client. Launch a refer-someone-you-care-about programme.',
      tasks: [
        'Send a 2-minute mid-week WhatsApp to every active client checking on the work from the last session',
        'Launch a "refer someone you care about" programme rewarding both client and friend',
        'Build a private wellness community group for weekly reflections and shared progress',
      ],
    },
  ],
};

export const HEALTH_FITNESS_TEMPLATES: readonly TemplateDefinition[] = [
  GYM_FITNESS_COACH,
  NUTRITION_WEIGHT_LOSS,
  WELLNESS_COACH,
] as const;
