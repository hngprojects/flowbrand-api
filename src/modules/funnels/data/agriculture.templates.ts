import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

/**
 * Agriculture PM declared 4 templates in the TOC but only fully wrote
 * Template 1 (Agro-Input Supplier). Templates 2-4 were placeholders. We
 * ship the one fully-written template plus structurally similar templates
 * for the other 3 declared sub-types so the industry meets the
 * "multiple templates" guidance.
 */

const AGRO_INPUT_SUPPLIER: TemplateDefinition = {
  id: 'agriculture:agro_input',
  industry: 'agriculture',
  businessType: ['agro_input', 'seeds', 'fertilizer', 'pesticides', 'soil_amendments'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Before-and-after crop content is the strongest trust signal in agriculture. ' +
        '{{business_name}} needs {{target_customer}} farmers to see higher yield, healthier plants, ' +
        'and improved soil with {{product}} visible in every result photo.',
      actionPrompt:
        'Post 3 before-and-after crop photos this week showing {{product}} results. Include price and ordering instructions.',
      tasks: [
        'Post 3 before-and-after crop photos showing {{product}} results with price visible',
        'Create a 30-60 second "What\'s in my farming kit" reel naming inputs and what they do',
        'Share one farming tip on WhatsApp Status daily for the next 7 days',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'A farmer who messages at 10am asking about fertilizer and hears back at 6pm has already bought from a competitor. {{business_name}} wins on speed, social proof, and live engagement.',
      actionPrompt:
        'Run a "crop challenge" poll on Stories this week and DM personalised recommendations. Host one 15-minute live Q&A.',
      tasks: [
        'Run a 3-question crop challenge poll and DM each respondent a personalised recommendation',
        'Reply to every comment and DM within 2 hours, asking what crop they are planting',
        'Host a free 15-minute live farming Q&A between 7-9pm one evening this week',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Farmers do not buy when ordering is confusing. {{business_name}} pins a one-message order flow, shows prices openly, and offers a first-time-buyer incentive to remove the final friction.',
      actionPrompt:
        'Pin a structured WhatsApp order flow this week. Display prices on every post and offer a first-time buyer incentive.',
      tasks: [
        'Pin a "send name, location, product, quantity" order flow to your WhatsApp profile',
        'Show prices clearly on every product post and DM',
        'Offer a first-time buyer incentive (free delivery, free soil test) with a clear time limit',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Most agro-input sellers never follow up. {{business_name}} stands out by checking in after every purchase, rewarding referrals, and building a VIP farmer WhatsApp group.',
      actionPrompt:
        'Send a post-purchase check-in 7-10 days after every farmer order. Launch a refer-a-farmer reward and start a VIP farmer WhatsApp group.',
      tasks: [
        'Send a personal WhatsApp check-in 7-10 days after every purchase',
        'Launch a "refer a farmer" reward where both farmers get a discount or free input',
        'Build a VIP farmer WhatsApp group for restocks, seasonal advice, and bulk discounts',
      ],
    },
  ],
};

const LIVESTOCK_POULTRY: TemplateDefinition = {
  id: 'agriculture:livestock_poultry',
  industry: 'agriculture',
  businessType: ['livestock', 'poultry', 'feed_supply', 'veterinary', 'breeding'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Livestock farmers trust visible results: weight gain in broilers, egg-laying improvements, ' +
        'and herd health gains. {{business_name}} needs {{target_customer}} to see these consistently ' +
        'on {{discovery_channel}}.',
      actionPrompt:
        'Post 3 before-and-after livestock photos this week. Share one daily livestock care reel.',
      tasks: [
        'Post 3 before-and-after livestock photos showing weight, growth, or health improvements',
        'Create a 30-60 second daily-care reel on a specific topic (vaccination, feeding, disease signs)',
        'Share one livestock tip on WhatsApp Status every day',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Engage potential customers through education and social proof. Livestock farmers respond to specific advice, not generic feed pitches.',
      actionPrompt:
        'Reply to every comment and DM within 2 hours. Share two farmer testimonials and host one live Q&A.',
      tasks: [
        'Run a poll on livestock pain points (feed cost, disease, breeding) and DM personalised advice',
        'Reply to every comment and DM within 2 hours',
        'Host a free 15-minute live Q&A between 7-9pm one evening this week',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert interest into orders with clear pricing, simple ordering, and a low-risk first purchase.',
      actionPrompt:
        'Pin an order flow on WhatsApp this week. Show prices on every post and offer a first-time buyer incentive.',
      tasks: [
        'Pin a structured WhatsApp order flow asking for name, location, item, quantity',
        'Display prices on every product post (feed bags, vet supplies, breeding stock)',
        'Offer a first-time buyer incentive (free delivery, free vet consultation)',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Livestock farmers buy on a predictable rhythm. {{business_name}} stays useful by remembering that rhythm and reaching out before the next reorder is due.',
      actionPrompt:
        'Send post-purchase check-ins 7-10 days after delivery. Launch a referral programme and start a VIP livestock WhatsApp group.',
      tasks: [
        'Send a WhatsApp check-in 7-10 days after every feed or supply delivery',
        'Launch a refer-a-farmer reward (cash or feed credit) for successful introductions',
        'Build a VIP livestock farmer WhatsApp group for seasonal vaccination reminders and bulk deals',
      ],
    },
  ],
};

const FRESH_PRODUCE: TemplateDefinition = {
  id: 'agriculture:fresh_produce',
  industry: 'agriculture',
  businessType: ['fresh_produce', 'vegetable_farm', 'fruit_farm', 'produce'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Fresh produce sells on the visibility of the harvest. {{business_name}} needs ' +
        '{{target_customer}} (restaurants, markets, households) to see the produce, the day it was ' +
        'harvested, and the price.',
      actionPrompt:
        'Post 3 harvest photos this week with prices. Share one farm-to-market video.',
      tasks: [
        'Post 3 harvest photos with the date harvested and the price per kg or bunch',
        'Share one farm-to-market video showing the produce journey',
        'Post one farming tip on WhatsApp Status daily',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build trust with chefs, traders, and individual households through educational content on freshness, storage, and seasonal pricing.',
      actionPrompt:
        'Run a poll on what {{target_customer}} wants in season. Share two customer testimonials.',
      tasks: [
        'Run a poll on which produce {{target_customer}} wants this season',
        'Reply to every comment and DM within 2 hours',
        'Share two customer testimonials (restaurants, market sellers, or households)',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Close the first order with a small starter bundle and clear delivery options. Restaurants and traders buy from suppliers who answer their WhatsApp first.',
      actionPrompt:
        'Pin an order flow on WhatsApp this week. Offer a starter bundle and clear weekly delivery schedule.',
      tasks: [
        'Pin a structured order flow on WhatsApp (item, quantity, delivery address, day)',
        'Offer a starter bundle for first-time buyers at a slight discount',
        'Publish your weekly delivery schedule so buyers know when to order',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Repeat buyers are everything in produce. Restaurants and households reorder weekly when {{business_name}} makes it predictable and easy.',
      actionPrompt:
        'Set up a weekly recurring order option. Launch a referral programme for restaurant introductions.',
      tasks: [
        'Set up a weekly recurring order option with reminders the day before delivery',
        'Launch a referral programme rewarding restaurant or market introductions',
        'Build a VIP buyer WhatsApp group for harvest-day priority orders',
      ],
    },
  ],
};

const CROP_PROCESSING: TemplateDefinition = {
  id: 'agriculture:crop_processing',
  industry: 'agriculture',
  businessType: ['crop_processing', 'value_added', 'agro_processing', 'food_processing'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Processed products (palm oil, garri, dried fruit, ground nut paste) sell on packaging and ' +
        'provenance. {{business_name}} needs {{target_customer}} to see the source farm and the ' +
        'finished product side by side.',
      actionPrompt:
        'Post 3 product photos this week showing packaging and farm source. Share one processing video.',
      tasks: [
        'Post 3 product photos showing packaging, source, and price',
        'Share one processing video (raw input to finished product) on {{discovery_channel}}',
        'Post one product tip on WhatsApp Status daily (storage, recipes, uses)',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Differentiate on quality and traceability. {{target_customer}} reaching for processed food wants to know it is clean, fresh, and locally produced.',
      actionPrompt:
        'Run a taste test or recipe poll this week. Share two customer testimonials.',
      tasks: [
        'Run a recipe or taste-test poll asking {{target_customer}} how they use {{product}}',
        'Reply to every comment and DM within 2 hours',
        'Share two customer testimonials with photos of the product in use',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert browsers into first-time buyers with a sampler pack, clear prices, and a simple ordering flow.',
      actionPrompt:
        'Offer a sampler bundle this week. Pin a WhatsApp order flow with clear prices.',
      tasks: [
        'Offer a first-time sampler bundle at a discount',
        'Pin a structured WhatsApp order flow on your business profile',
        'Show prices and pack sizes openly on every product post',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Processed-food buyers reorder when freshness and convenience are consistent. {{business_name}} stays useful by remembering reorder cycles and rewarding loyalty.',
      actionPrompt:
        'Set reorder reminders for past customers. Launch a referral programme.',
      tasks: [
        'Send a WhatsApp reorder reminder based on each customer\'s usage rhythm',
        'Launch a refer-a-friend reward (discount or free pack) for both parties',
        'Build a VIP customer WhatsApp group for limited-batch and seasonal releases',
      ],
    },
  ],
};

export const AGRICULTURE_TEMPLATES: readonly TemplateDefinition[] = [
  AGRO_INPUT_SUPPLIER,
  LIVESTOCK_POULTRY,
  FRESH_PRODUCE,
  CROP_PROCESSING,
] as const;
