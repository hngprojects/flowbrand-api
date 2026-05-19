import type { TemplateDefinition } from './funnel-templates.types';

const DEFAULT_CHANNEL = '{{discovery_channel}}';

const BUILDING_CONTRACTOR: TemplateDefinition = {
  id: 'construction:building_contractor',
  industry: 'construction',
  businessType: ['building_contractor', 'general_contractor', 'civil_contractor'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: DEFAULT_CHANNEL,
      explanation:
        '{{business_name}} needs to be visible to {{target_customer}} who is actively planning a ' +
        'construction project. Most contractors win jobs through word of mouth, but that is not ' +
        'scalable on its own. This stage builds a presence so new clients can find you.',
      actionPrompt:
        'Document one current or completed project this week with photos and a short caption stating ' +
        'what was built, where, and how long it took. Share on every channel where {{target_customer}} ' +
        'is likely to scroll.',
      tasks: [
        'Take photos of your most recent completed project and post them on {{discovery_channel}} with project details',
        'Ask 3 past clients to recommend you to one person planning to build',
        'Update or create a Google Business profile with your company name, phone, location, and 5 project photos',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Someone has seen your work or heard about {{business_name}}. This stage is about responding ' +
        'well, showing your team in action, and building enough trust that {{target_customer}} wants ' +
        'to meet you.',
      actionPrompt:
        'Reply to every enquiry within 2 hours this week and share at least one short video or photo series of your team working on site.',
      tasks: [
        'Prepare a standard introduction message covering who you are, what you build, and 3 completed projects',
        'Share a short on-site video on {{discovery_channel}} showing your team working',
        'Ask one past client to be a phone reference for new prospects',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: DEFAULT_CHANNEL,
      explanation:
        '{{target_customer}} is interested. This stage is about converting that interest into a signed agreement with clear scope, timing, and price.',
      actionPrompt:
        'Send a one-page project summary within 24 hours of any site visit. Offer a free site assessment and follow up every prospect who has not responded in 5 days.',
      tasks: [
        'Prepare a one-page project summary template (scope, timeline, price range) and customise per prospect',
        'Offer a free site assessment to serious prospects',
        'Send a one-line follow-up to every prospect not responding within 5 days',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Turn one project into repeat business and referrals. {{business_name}} stays present after handover with thank-you notes, review requests, and small monthly updates.',
      actionPrompt:
        'Send a project completion message with a photo of the finished work. Ask directly for a Google review and follow up 30 days later to check in.',
      tasks: [
        'Send a project completion message with finished-work photos',
        'Ask for a Google review or Facebook recommendation within 2 minutes of completion',
        'Follow up 30 days after handover to check on touch-ups or additional work',
      ],
    },
  ],
};

const ARCHITECTURE_DESIGN: TemplateDefinition = {
  id: 'construction:architecture_design',
  industry: 'construction',
  businessType: ['architecture', 'design_firm', 'interior_design', 'structural_engineering', 'urban_planning'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Architects and designers win clients through the quality of their portfolio. {{business_name}} ' +
        'needs that portfolio visible to {{target_customer}} (property developers, business owners ' +
        'planning to build, and individuals planning their homes).',
      actionPrompt:
        'Publish one completed project this week with before-and-after images. Submit your portfolio to one local property directory and reach out to 3 developers you have not worked with.',
      tasks: [
        'Post one completed project on {{discovery_channel}} with before/after photos and design rationale',
        'Submit your firm portfolio to one local property or business directory',
        'Send a brief portfolio introduction (not a sales pitch) to 3 property developers',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Design clients take time to decide. {{business_name}} stays relevant and trusted while ' +
        '{{target_customer}} is planning by sharing process insight, case studies, and offering ' +
        'low-friction first conversations.',
      actionPrompt:
        'Publish one short case study this week. Offer a free 30-minute consultation to any enquirer. Follow up anyone who enquired but has not booked.',
      tasks: [
        'Publish one short plain-English case study showing problem, solution, and result',
        'Offer a free 30-minute initial consultation to every enquirer',
        'Ask one past client for a written testimonial to post publicly',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Win the brief with a clear proposal that {{target_customer}} can evaluate without confusion. Address the price objection directly and follow up every outstanding proposal.',
      actionPrompt:
        'Present a proposal document with design process, timeline, deliverables, and fee structure. Offer a staged payment structure to reduce the financial barrier to commitment.',
      tasks: [
        'Write a proposal template with process, timeline, deliverables, and fees - be specific not vague',
        'Offer a staged payment structure (signing, drawings, supervision monthly)',
        'Follow up every outstanding proposal after 7 days with one specific clarifying question',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Loyalty and referrals come from staying in touch and capturing testimonials at the moment of project completion when {{target_customer}} is happiest.',
      actionPrompt:
        'Capture completed project photos with permission and ask for referrals. Send a quarterly check-in message to past clients.',
      tasks: [
        'Capture completed project photos with permission for portfolio use',
        'Ask for a referral to other developers, owners, or individuals planning to build',
        'Send a quarterly check-in to every past client to stay top of mind',
      ],
    },
  ],
};

const BUILDING_MATERIALS: TemplateDefinition = {
  id: 'construction:building_materials',
  industry: 'construction',
  businessType: ['building_materials', 'materials_supplier', 'construction_supplier'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Building materials buyers buy on price, availability, and trust. {{business_name}} needs to ' +
        'be visible to {{target_customer}} in the locations and channels where contractors, site ' +
        'managers, and self-builders already are.',
      actionPrompt:
        'Post your product list and current prices on {{discovery_channel}} and contractor groups twice this week. Visit 3 active construction sites and leave a price list.',
      tasks: [
        'Post product list and current prices on {{discovery_channel}} and contractor groups twice weekly',
        'Visit 3 active construction sites and introduce yourself with a price list',
        'List your business on Google Maps with address, phone, hours, and material categories',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Make buying from {{business_name}} easier than buying from a competitor. A simple ordering system and clear delivery promise wins on logistics, not just price.',
      actionPrompt:
        'Set up a WhatsApp ordering flow this week and send your top 5 buyers a weekly availability update.',
      tasks: [
        'Create a simple WhatsApp ordering system (order, confirmation, delivery time)',
        'Send your top 5 buyers a weekly availability update with stock and price changes',
        'Offer a free delivery threshold and communicate it clearly to all buyers',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Close the bulk order with trial pricing and credit terms. {{target_customer}} switches suppliers when the risk feels lower than the savings.',
      actionPrompt:
        'Offer a trial order at a reduced rate to any new contractor enquiry. Follow up unanswered quotes within 3 days with a phone call, not just a message.',
      tasks: [
        'Offer a trial order at a slightly reduced rate to every new contractor enquiry',
        'Prepare a one-page credit terms document for high-volume buyers',
        'Call to confirm first-time orders rather than waiting for a WhatsApp reply',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Construction projects have predictable materials rhythms. {{business_name}} stays useful to {{target_customer}} by remembering those rhythms and reaching out before they need to ask.',
      actionPrompt:
        'Set a reminder to contact every buyer 2 weeks after their last order. Offer a loyalty discount to buyers with 5 or more orders.',
      tasks: [
        'Set a reminder to contact every buyer 2 weeks after their last order',
        'Offer a loyalty discount to buyers who have placed 5 or more orders',
        'Ask best buyers what materials they wish you stocked but currently do not',
      ],
    },
  ],
};

const REAL_ESTATE_DEVELOPER: TemplateDefinition = {
  id: 'construction:real_estate_developer',
  industry: 'construction',
  businessType: ['real_estate_developer', 'property_developer', 'estate_developer'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Property buyers in Sub-Saharan Africa research for 3 to 12 months before committing. ' +
        '{{business_name}} must appear during that research phase wherever {{target_customer}} looks: ' +
        'search, social, and property portals.',
      actionPrompt:
        'Post one property photo or render this week with location, size, price range, and payment ' +
        'plan. Run one targeted ad pointing to your WhatsApp and list the development on at least ' +
        'one property portal.',
      tasks: [
        'Post one property photo or render with location, size, price range, and payment plan',
        'Run one targeted ad pointing to your WhatsApp at a small budget (5,000-10,000)',
        'List the development on a property portal (PropertyPro, Nigeria Property Centre, Jiji, or equivalent)',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Move {{target_customer}} from curious to serious with detail. The fastest conversion step is a site visit, even a virtual one.',
      actionPrompt:
        'Respond to every enquiry within 1 hour with a property information sheet. Invite serious prospects to a site visit this week.',
      tasks: [
        'Respond to every enquiry within 1 hour with a detailed property info sheet',
        'Invite serious prospects to a site visit and offer transport for out-of-town buyers',
        'Host a 15-minute virtual property tour on WhatsApp or Zoom for remote prospects',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Close the sale or reservation. Delays in documentation after a verbal yes cause more deal failures than price objections.',
      actionPrompt:
        'Offer a refundable reservation fee. Make subscription and sale agreements available the same week. Follow up every site visitor who has not decided within 7 days.',
      tasks: [
        'Offer a refundable reservation fee (7-day window) to hold a unit',
        'Have a lawyer-reviewed subscription and sale agreement ready before any verbal yes',
        'Follow up every undecided site visitor within 7 days with a specific availability nudge',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Post-sale care reduces buyer anxiety and creates referral momentum. Construction progress photos turn paid buyers into voluntary marketers.',
      actionPrompt:
        'Send a welcome message after signing with a clear construction timeline. Share monthly progress photos. Ask paid-up buyers for one referral.',
      tasks: [
        'Send a welcome message with construction milestones and contact for updates',
        'Share construction progress photos with buyers monthly',
        'Offer a cash referral fee or future-purchase discount to fully paid buyers',
      ],
    },
  ],
};

const FACILITY_MANAGEMENT: TemplateDefinition = {
  id: 'construction:facility_management',
  industry: 'construction',
  businessType: ['facility_management', 'maintenance_company', 'estate_management'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Facility management contracts are won through relationships and reputation. {{business_name}} needs to be known in the circles where property managers and developers talk.',
      actionPrompt:
        'Publish one case study on LinkedIn this week with a specific result. Reach out to 5 developers or estate managers with a brief introduction.',
      tasks: [
        'Post one LinkedIn case study showing a specific facility challenge you solved',
        'Reach out to 5 property developers or estate managers per week with a one-line intro',
        'List specific services on your Google Business profile with searchable keywords',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Build credibility with decision-makers through specificity. A free audit, a clear one-page profile, and a reference call do more than any brochure.',
      actionPrompt:
        'Prepare a one-page company profile. Offer a free facility audit to one prospect this week and ask one current client to be a reference.',
      tasks: [
        'Prepare a one-page company profile with services, team size, key clients, and a case study',
        'Offer a free facility audit to one prospective client this month',
        'Ask a current client to act as a phone reference for prospects',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Win the contract with specific SLAs, a low-risk trial period, and direct objection-handling. {{target_customer}} will mostly object that they have in-house staff already.',
      actionPrompt:
        'Send a proposal with detailed SLAs and offer a 3-month trial contract. Address the in-house-team objection directly in the proposal.',
      tasks: [
        'Write a proposal with scope, SLAs (response times, reporting frequency, escalation), and monthly fee',
        'Offer a 3-month trial contract at a fixed monthly rate, reviewed at the end',
        'Follow up every proposal after 5 days with one specific question',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: DEFAULT_CHANNEL,
      explanation:
        'Retention is about visibility of value. A monthly maintenance report makes it concrete what {{business_name}} is doing for {{target_customer}} and why the contract is worth keeping.',
      actionPrompt:
        'Send a monthly maintenance report to every client. At the 6-month mark, propose an expanded scope (generator management, cleaning, landscaping).',
      tasks: [
        'Send a monthly maintenance report covering work done, issues found, fixes, and next month',
        'At the 6-month mark, propose an expanded scope of services',
        'Offer a one-month fee discount for every successful referral that converts to a contract',
      ],
    },
  ],
};

export const CONSTRUCTION_TEMPLATES: readonly TemplateDefinition[] = [
  BUILDING_CONTRACTOR,
  ARCHITECTURE_DESIGN,
  BUILDING_MATERIALS,
  REAL_ESTATE_DEVELOPER,
  FACILITY_MANAGEMENT,
] as const;
