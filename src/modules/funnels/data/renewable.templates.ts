import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

const SOLAR_INSTALLATION: TemplateDefinition = {
  id: 'renewable:solar_installation',
  industry: 'renewable',
  businessType: ['solar', 'solar_installation', 'solar_panels', 'inverters'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} dealing with power cuts and high generator costs is the buyer. ' +
        '{{business_name}} needs the alternative visible: real bills before and after, and real ' +
        'installations on real roofs.',
      actionPrompt:
        'Publish 3 educational posts this week including one electricity-bill comparison. Run targeted ads in areas with frequent outages.',
      tasks: [
        'Post weekly content showing real electricity bills before and after solar installation',
        'Share short videos of completed home and business installations (actual panels, not stock photos)',
        'Run targeted ads in areas known for frequent power outages or high generator usage',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build the case with case studies, warranties, and honest comparisons. Solar is a multi-year commitment; trust must be earned with proof, not promises.',
      actionPrompt:
        'Publish one case study this week and one FAQ addressing common objections (cost, theft, weather).',
      tasks: [
        'Share one case study with customer name (with permission), location, system size, and monthly savings',
        'Publish one FAQ post addressing cost, roof damage, theft, or weather objections',
        'Post a comparison: solar vs generator over 3 years including maintenance, fuel, and downtime',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Move warm prospects from "I am interested" to "I have booked a site visit". A free, no-obligation assessment is the conversion key.',
      actionPrompt:
        'Offer a free site assessment this week via WhatsApp or form. Follow up personally with everyone who engaged but has not booked.',
      tasks: [
        'Offer a free, no-obligation site assessment requestable via WhatsApp or a simple form',
        'Publish pricing ranges so {{target_customer}} is not afraid to ask',
        'Follow up personally with everyone who engaged with content but has not booked an assessment',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Every installation is a long-term relationship. {{business_name}} grows through referrals from happy installations and add-on services for the same customer.',
      actionPrompt:
        'Send a 30-day check-in message after every installation. Share monthly energy reports.',
      tasks: [
        'Send a personal check-in message 30 days after every installation',
        'Share monthly or quarterly energy reports showing power generated and money saved',
        'Launch a referral scheme where customers earn a free maintenance visit per successful referral',
      ],
    },
  ],
};

const BIOGAS: TemplateDefinition = {
  id: 'renewable:biogas',
  industry: 'renewable',
  businessType: ['biogas', 'biogas_digester', 'organic_energy'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Most {{target_customer}} (farmers, rural households, agro-processors) have never heard of ' +
        'biogas or assume it is too technical. {{business_name}} earns awareness by making the ' +
        'concept feel familiar.',
      actionPrompt:
        'Publish content this week showing a working digester and a cost comparison versus firewood or LPG. Attend at least one farming cooperative meeting.',
      tasks: [
        'Share content in local languages where possible explaining what biogas is',
        'Post a short video showing a working digester (input, output, and stove use)',
        'Publish how much {{target_customer}} currently spends on firewood or LPG monthly with a side-by-side comparison',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Address the specific fears: smell, safety, complexity, reliability. {{business_name}} must answer the questions {{target_customer}} is afraid to ask publicly.',
      actionPrompt:
        'Post honest answers to common objections this week. Host one live demonstration at a community centre or local farm.',
      tasks: [
        'Post weekly honest answers to common objections (smell, safety, breakdowns)',
        'Share photos and videos of real customers using their digesters',
        'Host a live demonstration at a local farm or community centre and invite sceptics',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert interest into installation. Group discounts, clear financials, and subsidies bring the commitment within reach.',
      actionPrompt:
        'Offer a community group discount this week. Provide a financial summary covering payback period.',
      tasks: [
        'Offer community group discounts where 2+ farms installing together get a reduced rate',
        'Provide a financial summary covering installation cost, monthly savings, payback period',
        'Highlight any government subsidies or NGO grants available to reduce upfront cost',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Retain customers with maintenance subscriptions and grow within communities through endorsements and upsells.',
      actionPrompt:
        'Offer monthly maintenance subscriptions this week. Launch a referral programme.',
      tasks: [
        'Offer a monthly maintenance and performance check subscription',
        'Create a referral programme where customers earn a free service visit per successful referral',
        'Share monthly output summaries so {{target_customer}} can see gas produced and money saved',
      ],
    },
  ],
};

const CLEAN_COOKSTOVE: TemplateDefinition = {
  id: 'renewable:clean_cookstove',
  industry: 'renewable',
  businessType: ['clean_cookstove', 'cookstove', 'briquettes', 'biomass'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Make the real cost - financial and health - of current cooking methods visible to {{target_customer}}. {{business_name}} sells a healthier, cheaper alternative.',
      actionPrompt:
        'Publish weekly content this week on the health effects of cooking with firewood. Share cost comparisons and cooking-speed demos.',
      tasks: [
        'Post weekly content on the health effects of cooking with firewood and charcoal',
        'Share cost comparisons (charcoal per month vs briquettes per month)',
        'Distribute flyers in markets, near fuel sellers, and at community health centres',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Let {{target_customer}} see and believe before buying. Live demonstrations and visible durability proof convert faster than any content.',
      actionPrompt:
        'Run one live cooking demonstration this week in a busy market. Share video testimonials from food vendors.',
      tasks: [
        'Do live cooking demonstrations in busy market areas using the stove and briquettes',
        'Share video testimonials from food vendors showing how their fuel costs dropped',
        'Address the briquette supply question directly: show where to buy and confirm availability',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Remove the barriers that stop interested {{target_customer}} from a first purchase. A starter bundle plus a weekly payment option converts hesitant buyers.',
      actionPrompt:
        'Launch a starter bundle this week (stove plus one week of briquettes) at a promotional price.',
      tasks: [
        'Offer a starter bundle (stove plus one week of briquettes) at a promotional first-time price',
        'Set up sales points in markets, near food vendor clusters, and through kiosk networks',
        'Work with microfinance groups to offer weekly payment options',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'The recurring revenue is briquettes, not stoves. {{business_name}} builds a subscription base and grows revenue per customer over time.',
      actionPrompt:
        'Launch a monthly briquette delivery subscription this week. Send fuel-low reminders based on purchase history.',
      tasks: [
        'Introduce a monthly briquette delivery subscription with a loyalty discount',
        'Send WhatsApp reminders when a customer\'s fuel is likely running low',
        'Run a referral programme for food vendors (refer one vendor, get free briquettes)',
      ],
    },
  ],
};

const MINI_GRID: TemplateDefinition = {
  id: 'renewable:mini_grid',
  industry: 'renewable',
  businessType: ['mini_grid', 'energy_as_service', 'community_grid'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Mini-grids serve communities, not individuals. {{business_name}} must introduce the model to {{target_customer}} community leaders before any household will engage.',
      actionPrompt:
        'Host one town-hall meeting in the target community this week. Get community leaders involved early.',
      tasks: [
        'Host a town-hall meeting with clear visuals showing what the grid will power and what it will cost',
        'Get community leaders, chiefs, religious leaders, and market heads involved early and visibly',
        'Share videos from other communities where the same model is already working',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Earn trust before anyone pays. {{target_customer}} communities have legitimate concerns about reliability, pricing, and infrastructure ownership.',
      actionPrompt:
        'Publish all regulatory approvals this week. Host an open Q&A session.',
      tasks: [
        'Share all regulatory licences and government approvals publicly',
        'Publish the tariff structure clearly: what each tier costs and what it can power',
        'Host an open Q&A session where community members can challenge the model directly',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert community interest into signed connection agreements. A free trial period for early adopters seeds the first subscribers.',
      actionPrompt:
        'Offer a 30-day free trial connection for the first 20 sign-ups this week.',
      tasks: [
        'Offer a free 30-day trial connection for early adopters (first 20 sign-ups)',
        'Make sign-up as simple as possible: name, phone, and a mobile money payment',
        'Deploy local connection agents from within the community to register neighbours in person',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Retain subscribers and grow revenue. {{business_name}} keeps {{target_customer}} engaged with monthly summaries and increases value through appliance financing.',
      actionPrompt:
        'Send monthly energy summaries to every subscriber. Offer solar-powered appliance loans.',
      tasks: [
        'Send monthly energy summaries showing usage and savings versus a generator',
        'Offer solar-powered appliance loans (TV, fan, fridge) repaid through monthly bills',
        'Run a loyalty programme: 6 consecutive on-time payments earn a free month',
      ],
    },
  ],
};

export const RENEWABLE_TEMPLATES: readonly TemplateDefinition[] = [
  SOLAR_INSTALLATION,
  BIOGAS,
  CLEAN_COOKSTOVE,
  MINI_GRID,
] as const;
