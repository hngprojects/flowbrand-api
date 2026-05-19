import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

const LOCAL_RESTAURANT: TemplateDefinition = {
  id: 'hospitality:restaurant',
  industry: 'hospitality',
  businessType: ['restaurant', 'local_restaurant', 'food_spot', 'casual_dining'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Local restaurants live on local visibility. {{business_name}} needs {{target_customer}} to ' +
        'see food photos, behind-the-scenes content, and location tags multiple times before the ' +
        'first visit.',
      actionPrompt:
        'Publish 4 food photos or videos on {{discovery_channel}} this week. Upload one behind-the-scenes kitchen clip and run location tags on every post.',
      tasks: [
        'Post food photos and videos on {{discovery_channel}} 4 times this week',
        'Upload one behind-the-scenes kitchen clip showing how a signature dish is made',
        'Partner with one local food blogger for a visit and tag exchange',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build interaction and trust. {{target_customer}} who comments on a post is two steps from a table booking; ignore them and they go to a competitor.',
      actionPrompt:
        'Reply to every DM and comment daily this week. Run one food-question poll and post one customer review.',
      tasks: [
        'Reply to every DM and comment daily within 4 hours',
        'Run one weekly poll or food question and respond personally to engaged followers',
        'Share one customer review or testimonial every 2 days',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Turn followers into paying customers with time-bound offers and a direct order path. {{target_customer}} converts on urgency and convenience.',
      actionPrompt:
        'Promote one limited-time meal offer this week. Add a direct order CTA link to every post and send WhatsApp reminders to recent engagers.',
      tasks: [
        'Promote one limited-time meal offer or combo meal discount weekly',
        'Add a direct order CTA link to every post on {{discovery_channel}}',
        'Send WhatsApp order reminders to people who engaged with this week\'s posts',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Repeat visits drive profit. Loyalty offers, birthday discounts, and a VIP list make {{target_customer}} feel chosen rather than processed.',
      actionPrompt:
        'Send a weekly loyalty offer to past customers and build a VIP customer list this week.',
      tasks: [
        'Send a weekly loyalty offer to past customers (discount, free side, priority booking)',
        'Build a VIP customer list and send a birthday discount or surprise treat',
        'Request a Google review from every customer within 24 hours of their visit',
      ],
    },
  ],
};

const EVENT_CATERING: TemplateDefinition = {
  id: 'hospitality:event_catering',
  industry: 'hospitality',
  businessType: ['event_catering', 'wedding_catering', 'catering'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Event planners and clients pick caterers based on visible execution. {{business_name}} needs ' +
        'setup photos, transformation content, and testimonials in front of {{target_customer}} ' +
        'every week.',
      actionPrompt:
        'Publish event setup photos and one transformation reel this week. Upload one client testimonial.',
      tasks: [
        'Post event setup photos and videos on {{discovery_channel}}',
        'Share one catering transformation reel (before, during, after) per week',
        'Upload one client testimonial with a real wedding or event photo',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Capture inquiries fast. Most event clients shop multiple caterers within 24 hours of starting; whoever replies first with a clear price often wins.',
      actionPrompt:
        'Set up a WhatsApp inquiry automation this week. Reply to every enquiry within 1 hour and offer a free consultation call.',
      tasks: [
        'Add an inquiry form or WhatsApp shortlink to your {{discovery_channel}} bio',
        'Offer a free 15-minute consultation call to every enquiring client',
        'Share package pricing highlights publicly so clients can self-qualify',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Convert inquiries into confirmed bookings with a customised proposal and time-bound urgency. {{target_customer}} signs when the path is clear and the cost is fixed.',
      actionPrompt:
        'Send a customised proposal to every qualified enquiry within 24 hours. Offer a limited-time booking discount for confirmations this week.',
      tasks: [
        'Send a customised event proposal within 24 hours of every qualified enquiry',
        'Offer a limited-time discount for clients who confirm within 7 days',
        'Showcase 2 past event success stories alongside the proposal',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Catering retention is referral, not repeat. Happy {{target_customer}} introduces you to the next wedding, corporate event, or birthday in their circle.',
      actionPrompt:
        'Send appreciation messages and event recap videos to every recent client. Request a referral with a clear incentive.',
      tasks: [
        'Send appreciation messages and an event recap video to every recent client',
        'Run a referral discount programme: refer one event, receive a discount',
        'Build planner and vendor partnerships for cross-introductions',
      ],
    },
  ],
};

const BAKERY: TemplateDefinition = {
  id: 'hospitality:bakery',
  industry: 'hospitality',
  businessType: ['bakery', 'cake_shop', 'dessert_brand'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Desserts sell on visuals. {{business_name}} needs daily aesthetic content on {{discovery_channel}} so {{target_customer}} associates the brand with the cake they want.',
      actionPrompt:
        'Post one aesthetic dessert photo daily and one short baking video this week. Collaborate with one micro-influencer.',
      tasks: [
        'Post one aesthetic dessert photo daily on {{discovery_channel}}',
        'Create one short baking video or reel showing process and result',
        'Collaborate with one micro-influencer for a tasting and post exchange',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build emotional connection. {{target_customer}} buys cake for moments, not nutrition. Polls, voting, and unboxing content turn followers into buyers.',
      actionPrompt:
        'Run one flavour voting poll this week and share two unboxing videos from real customers.',
      tasks: [
        'Run one flavour voting poll inviting followers to choose next week\'s flavour',
        'Share two customer unboxing or first-bite videos',
        'Reply to every comment and DM within a few hours',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Increase product orders with weekly specials and limited editions. {{target_customer}} clicks "order" on urgency, not steady supply.',
      actionPrompt:
        'Promote one weekly special and one limited-edition product this week. Push the WhatsApp ordering link in every post.',
      tasks: [
        'Promote one weekly special with a clear price and order link',
        'Launch a limited-edition product available for 48-72 hours only',
        'Push the WhatsApp ordering link in every post and story',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Customers come back for birthdays, anniversaries, and small celebrations. {{business_name}} stays top of mind with a loyalty card and seasonal offers.',
      actionPrompt:
        'Launch a loyalty card or stamp programme this week and send holiday offers to past customers.',
      tasks: [
        'Launch a loyalty card system (buy 5, get 1 free or equivalent)',
        'Offer repeat-customer discounts and birthday treats',
        'Send seasonal offers to past customers (Christmas, Eid, Mother\'s Day)',
      ],
    },
  ],
};

const FOOD_DELIVERY: TemplateDefinition = {
  id: 'hospitality:food_delivery',
  industry: 'hospitality',
  businessType: ['food_delivery', 'cloud_kitchen', 'online_food'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Delivery competes on digital visibility. {{business_name}} needs {{target_customer}} to see food content, delivery experience, and customer reactions consistently on {{discovery_channel}}.',
      actionPrompt:
        'Publish 3 food content reels and one delivery-experience video this week. Run one location-targeted ad.',
      tasks: [
        'Run 3 food-content TikTok or Instagram reels this week',
        'Post one delivery experience video showing the from-kitchen-to-door journey',
        'Use one location-targeted paid ad pointing to your order link',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Move {{target_customer}} from passive scrolling to an inquiry. Discount codes, customer reviews, and giveaways accelerate engagement.',
      actionPrompt:
        'Share one discount code this week and run one giveaway. Repost two customer reviews.',
      tasks: [
        'Share one limited-time discount code with a 48-hour window',
        'Repost two genuine customer reviews on {{discovery_channel}}',
        'Run a small giveaway requiring follow, tag, and share',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Increase completed orders by reducing friction. Combo packages, urgency, and abandoned-cart reminders convert browsers into eaters.',
      actionPrompt:
        'Push one urgent meal deal this week and optimise your delivery CTA link. Send cart or order reminders to engagers.',
      tasks: [
        'Push one urgency-based meal deal (lunchtime hour, weekend dinner) per week',
        'Promote combo packages that bundle a main, side, and drink',
        'Send cart or order reminders to people who started but did not complete an order',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Repeat orders are the unit economics of delivery. Loyalty discounts, subscription meal plans, and referral bonuses all push {{target_customer}} toward ordering again.',
      actionPrompt:
        'Send personalised meal offers to past customers and offer a referral bonus this week.',
      tasks: [
        'Send a loyalty meal discount to customers who have ordered 3+ times',
        'Offer a referral bonus where both giver and receiver get credit',
        'Pilot a subscription meal plan for the most active 10 percent of customers',
      ],
    },
  ],
};

const FOOD_TRUCK: TemplateDefinition = {
  id: 'hospitality:food_truck',
  industry: 'hospitality',
  businessType: ['food_truck', 'street_food', 'mobile_food'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Food trucks live on location-based attention. {{business_name}} needs {{target_customer}} to always know where the truck is today and where it will be tomorrow.',
      actionPrompt:
        'Post daily truck location updates on {{discovery_channel}} and WhatsApp Status. Share one street-food preparation video.',
      tasks: [
        'Post daily truck locations on {{discovery_channel}} and WhatsApp Status',
        'Share one short street-food preparation video each week',
        'Use local hashtags and geo-tags on every post for discoverability',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build community engagement. {{target_customer}} who feels they have a say in where you park next week will come and bring friends.',
      actionPrompt:
        'Run a "vote for next location" poll this week and share two customer reaction videos.',
      tasks: [
        'Run a weekly "vote for next location" poll on {{discovery_channel}}',
        'Share two customer reaction videos showing real reactions to your food',
        'Announce weekly specials with a clear price and serving window',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Daily sales depend on urgency. Lunchtime windows, QR-coded ordering, and real-time queue updates turn passers-by into customers.',
      actionPrompt:
        'Offer one lunchtime combo deal this week. Print and display QR codes for faster ordering.',
      tasks: [
        'Offer one lunchtime combo deal with a clear time-limited window',
        'Use QR codes at the truck for faster ordering and payment',
        'Share real-time queue or availability updates on WhatsApp Status',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Repeat customers are a food truck\'s lifeblood. A loyalty stamp system and location-reminder broadcasts keep {{target_customer}} returning week after week.',
      actionPrompt:
        'Launch a loyalty stamp system this week. Send location reminders to your top 20 customers.',
      tasks: [
        'Launch a loyalty stamp or reward system (buy 5, get 1 free)',
        'Send location reminders to repeat customers when you park near them',
        'Reward frequent buyers with a free add-on (drink, dessert, or upgrade)',
      ],
    },
  ],
};

export const HOSPITALITY_TEMPLATES: readonly TemplateDefinition[] = [
  LOCAL_RESTAURANT,
  EVENT_CATERING,
  BAKERY,
  FOOD_DELIVERY,
  FOOD_TRUCK,
] as const;
