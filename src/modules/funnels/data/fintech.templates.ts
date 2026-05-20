import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

const DIGITAL_WALLET: TemplateDefinition = {
  id: 'fintech:digital_wallet',
  industry: 'fintech',
  businessType: ['digital_wallet', 'mobile_payment', 'payment_app', 'wallet'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} who has never used a digital wallet needs to discover {{business_name}} and quickly understand what they would gain. Education comes before promotion in fintech.',
      actionPrompt: 'Publish 3 educational posts this week on cashless payments, transfer speed, and payment security.',
      tasks: [
        'Post one educational piece on the benefits of cashless payments',
        'Share a short video showing how fast transfers work end-to-end',
        'Publish content explaining how payment security and fraud protection work',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Convince {{target_customer}} the platform is safe and reliable. Fintech trust is built through visible reviews, transparent fraud-prevention, and honest comparisons.',
      actionPrompt: 'Share customer testimonials this week and one comparison post versus traditional banks.',
      tasks: [
        'Share 3 customer reviews and testimonials with names or initials',
        'Publish a post explaining your fraud prevention systems in plain language',
        'Share a comparison post between traditional banks and digital wallets',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert sign-up intent into completed registrations. {{target_customer}} drops off when onboarding feels long. Cashback and "2-minute signup" messaging reduce friction.',
      actionPrompt:
        'Offer cashback for new users this week. Send reminders to anyone who started but did not complete signup.',
      tasks: [
        'Offer cashback for new users completing signup within 7 days',
        'Send personalised reminders to users who started but did not complete signup',
        'Highlight the "2-minute signup" messaging across {{discovery_channel}} and ads',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Activation is the real win. {{business_name}} encourages first deposits and first transfers with reminders, rewards, and onboarding nudges.',
      actionPrompt:
        'Send wallet-funding reminders to registered users this week. Offer rewards for first transactions.',
      tasks: [
        'Send reminders to registered users to fund their wallet for the first time',
        'Offer rewards (cashback, fee waivers) for first transfers',
        'Provide a wallet-setup checklist and onboarding walkthroughs in-app',
      ],
    },
  ],
};

const LOAN_FINTECH: TemplateDefinition = {
  id: 'fintech:loan',
  industry: 'fintech',
  businessType: ['loan', 'lending', 'business_loan', 'sme_loan'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} business owners who could benefit from financing often do not know structured loan options exist. {{business_name}} needs to make funding visible and aspirational.',
      actionPrompt: 'Publish 3 awareness pieces this week on funding tips, loan use-cases, and SMB success stories.',
      tasks: [
        'Publish one funding tip aimed at SMBs (what to use a loan for, what to avoid)',
        'Share one video explaining business loans without jargon',
        'Post one financial growth success story from a past borrower with permission',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Reduce fear around borrowing. {{target_customer}} hesitates when eligibility, repayment, and interest costs feel opaque. Honest explanation builds confidence.',
      actionPrompt:
        'Publish loan eligibility requirements clearly this week. Share repayment examples with real numbers and verified customer testimonials.',
      tasks: [
        'Publish a clear post explaining loan eligibility requirements and approval signals',
        'Share repayment examples with monthly amounts and total cost spelled out',
        'Publish one FAQ post per week answering the questions prospects actually ask',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Increase completed loan applications by removing friction. {{target_customer}} abandons forms that ask for too much before showing whether they qualify.',
      actionPrompt:
        'Send reminders to users with unfinished applications this week. Offer promotional rates for early completers.',
      tasks: [
        'Send personalised reminders to anyone with an unfinished loan application',
        'Offer promotional interest rates for applications completed within a defined window',
        'Simplify the application form to the minimum fields required for an initial decision',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Help approved borrowers complete verification and receive funds. Drop-off after approval is a silent killer; {{business_name}} stays present until money hits the account.',
      actionPrompt: 'Send document upload reminders this week. Trigger support for any stuck applicant.',
      tasks: [
        'Send document upload reminders within 24 hours of approval',
        'Provide an onboarding checklist showing what is needed from approval to disbursement',
        'Trigger live support assistance for users stuck in verification for 48+ hours',
      ],
    },
  ],
};

const INVESTMENT_SAVINGS: TemplateDefinition = {
  id: 'fintech:investment_savings',
  industry: 'fintech',
  businessType: ['investment', 'savings', 'wealth', 'savings_app'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Most {{target_customer}} have never invested before. {{business_name}} wins by teaching the basics on {{discovery_channel}} so prospects feel literate before they feel sold to.',
      actionPrompt:
        'Publish 3 beginner education pieces this week. Run one financial literacy campaign aimed at young professionals.',
      tasks: [
        'Publish one beginner saving tip per week aimed at first-time savers',
        'Share one investment education post explaining a single concept clearly',
        'Run a financial literacy campaign targeting young professionals on {{discovery_channel}}',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} considering an investment app worries about security and risk. {{business_name}} reduces both by being transparent about risk and visible about compliance.',
      actionPrompt:
        'Publish clear risk disclosures this week. Share customer success stories and a security or compliance explainer.',
      tasks: [
        'Publish a transparent post on investment risk - what {{target_customer}} should know before starting',
        'Share security and compliance information (regulators, licences, custody arrangements)',
        'Post one customer success story showing realistic returns over realistic time',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Increase savings or investment account signups. The lowest-friction message is "start small": a single low minimum often unlocks the first account.',
      actionPrompt: 'Offer signup rewards this week. Send reminders to anyone who started signup but did not complete.',
      tasks: [
        'Offer a signup reward (matched first deposit, bonus interest) for new accounts',
        'Send abandoned-signup reminders within 24 hours of incomplete registration',
        'Promote "start with as little as X" messaging across {{discovery_channel}}',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Activate users by encouraging the first deposit or investment. {{business_name}} keeps {{target_customer}} engaged with milestone rewards and progress tracking.',
      actionPrompt: 'Send deposit reminders to registered users this week. Trigger beginner walkthrough tutorials.',
      tasks: [
        'Send first-deposit reminders to registered users who have not funded yet',
        'Trigger beginner walkthrough tutorials in-app for first-time investors',
        'Offer milestone-based rewards (first deposit, 3-month streak, target hit)',
      ],
    },
  ],
};

const CROSS_COUNTRY_PAYMENT: TemplateDefinition = {
  id: 'fintech:cross_country_payment',
  industry: 'fintech',
  businessType: ['cross_country_payment', 'remittance', 'international_payment', 'fx'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} sending or receiving international payments wants cheaper, faster transfers. {{business_name}} earns attention by being visible to freelancers and remote workers.',
      actionPrompt:
        'Publish 3 awareness posts this week on exchange rates, transfer comparisons, and international payment tips.',
      tasks: [
        'Share weekly exchange rate tips and currency movement insights',
        'Publish transfer-comparison content (your platform vs traditional banks)',
        'Run targeted ads on {{discovery_channel}} aimed at freelancers and remote workers',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build confidence in transaction safety and speed. {{target_customer}} switches to a new payment platform only after seeing real reviews and verifiable transaction times.',
      actionPrompt: 'Share customer reviews and transaction-speed data this week. Publish a security explainer.',
      tasks: [
        'Share 3 customer reviews focused on transfer speed and reliability',
        'Publish transaction speed statistics (median completion time, success rate)',
        'Post weekly security education explaining how transfers are verified and protected',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Increase transfer account registrations. Discounted transfer fees on the first send remove the perceived cost of trying.',
      actionPrompt: 'Offer discounted transfer fees for new users this week. Send onboarding reminders.',
      tasks: [
        'Offer discounted transfer fees for the first 1-3 transfers per new user',
        'Send onboarding reminders to incomplete registrations within 24 hours',
        'Highlight supported countries and currencies prominently on every post',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Activate first international transfers and repeat use. {{business_name}} converts curious signups into active senders with reminders and promotional FX rates.',
      actionPrompt: 'Send first-transfer reminders to registered users this week. Offer promotional exchange rates.',
      tasks: [
        'Send first-transfer reminders to registered users who have not transferred yet',
        'Offer promotional exchange rates on the first scheduled transfer',
        'Provide a transfer setup checklist and walkthrough for first-time users',
      ],
    },
  ],
};

export const FINTECH_TEMPLATES: readonly TemplateDefinition[] = [
  DIGITAL_WALLET,
  LOAN_FINTECH,
  INVESTMENT_SAVINGS,
  CROSS_COUNTRY_PAYMENT,
] as const;
