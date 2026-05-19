import type { TemplateDefinition } from './funnel-templates.types';

const CHANNEL = '{{discovery_channel}}';

/**
 * Education PM wrote one universal 5-stage funnel plus 5 sub-sector message
 * scripts. We collapse the 5 stages into BE-306 canonical 4 (Consideration
 * and Conversion merged into "Make First Sale") and apply per-sub-type
 * flavour to each template's explanation/tasks.
 */

const ONLINE_COURSE: TemplateDefinition = {
  id: 'education:online_course',
  industry: 'education',
  businessType: ['online_course', 'e_learning', 'online_learning'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} who could enrol in {{business_name}} has never heard of you yet. This stage is about showing up consistently with content that speaks to the pain or aspiration they bring 
      actionPrompt:
        'Publish one awareness piece this week tied to a specific pain (exam prep, career switch, skill gap). Ask current students to tag one friend.',
      tasks: [
        'Post one awareness piece per week speaking directly to a learner pain point',
        'Share a short class-in-session or student-working video on {{discovery_channel}}',
        'Ask every current student to share your page or tag one person who might benefit',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Once {{target_customer}} has seen {{business_name}}, give them enough proof and value to feel confident reaching out. They are evaluating you against other options and against doing nothing.'
      actionPrompt:
        'Publish one student result or testimonial this week and one free value piece (mini-lesson, checklist, or tip).',
      tasks: [
        'Share one student result or testimonial weekly (before/after, score, job secured)',
        'Post one free value piece (tip, mini-lesson, checklist) without asking for a sale',
        'Reply to every comment and DM within a few hours',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} is interested. Remove doubt with specific information, a low-friction trial, and a clear payment path.',
      actionPrompt:
        'Offer a free intro class or short discovery call. Reply to every enquiry with a personalised message and follow up anyone who showed interest but did not enrol.',
      tasks: [
        'Respond to every enquiry personally (name, specific question, clear CTA)',
        'Offer a free introductory class, trial session, or short discovery call',
        'Follow up 3 days later with anyone who showed interest but did not take the next step',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Enrolled students become referrers when {{business_name}} keeps them engaged through the programme and recognises completion publicly.',
      actionPrompt:
        'Check in with students midway through their programme. Celebrate completions publicly with permission and ask graduates for one referral.',
      tasks: [
        'Send a midway check-in to every student to catch issues before they become complaints',
        'Celebrate completions publicly (graduation post, certificate photo, short testimonial) with permission',
        'Offer an alumni benefit (discount on next level, early access, referral bonus)',
      ],
    },
  ],
};

const TUTORING_SCHOOL: TemplateDefinition = {
  id: 'education:tutoring',
  industry: 'education',
  businessType: ['tutoring', 'coaching_school', 'lesson_centre'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Parents looking for tutoring listen to other parents. {{business_name}} needs to be visible to {{target_customer}} both online and in the school-gate conversations that happen every term.',
      actionPrompt:
        'Publish one awareness piece this week aimed at parents preparing children for WAEC, JSS or primary milestones. Encourage current parents to tag one peer.',
      tasks: [
        'Post one parent-targeted awareness piece tied to a specific exam or milestone',
        'Share a short tutoring-in-action video on {{discovery_channel}}',
        'Ask current parents to share your page or tag one fellow parent',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Build trust by showing improvement, not just promising it. Score deltas, student stories, and FAQ posts answer the questions parents have but rarely ask first.',
      actionPrompt:
        'Share one before/after score post this week and one FAQ post covering subjects, schedule, and fees.',
      tasks: [
        'Share one before/after score or improvement story per week',
        'Publish a clear FAQ covering subjects offered, schedule, fees, and student level',
        'Reply to every parent comment and DM within a few hours',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Parents commit when there is no commitment required first. A free assessment removes the financial and emotional barrier to engaging.',
      actionPrompt:
        'Offer a free 30-minute assessment to every enquiring parent. Send a clear fees schedule and follow up anyone who attended an assessment but has not enrolled.',
      tasks: [
        'Offer a free 30-minute assessment with no commitment',
        'Send a clear monthly fees schedule with session frequency options',
        'Follow up parents who attended an assessment within 3 days',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Enrolled students stay when parents see progress and feel heard. Reports, celebrations, and a referral bonus turn one signed parent into three.',
      actionPrompt:
        'Send a monthly progress update to every parent. Celebrate term-end results publicly (with permission). Offer a referral fee for parent-to-parent introductions.',
      tasks: [
        'Send a monthly parent-facing progress update covering attendance and improvements',
        'Celebrate term-end results publicly with parent permission',
        'Offer a referral fee or discount for parents who introduce another family',
      ],
    },
  ],
};

const VOCATIONAL_SKILLS: TemplateDefinition = {
  id: 'education:vocational',
  industry: 'education',
  businessType: ['vocational', 'skills_acquisition', 'trade_school'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        '{{target_customer}} considering a skill programme wants to know it leads to income. {{business_name}} needs visible graduates earning money, not posters with promises.',
      actionPrompt:
        'Publish one graduate income story this week. Share one short clip of class in session or a finished project.',
      tasks: [
        'Post one graduate income or job-placement story per week',
        'Share a short class-in-session or finished-project clip on {{discovery_channel}}',
        'Ask current trainees to tag one person who might benefit',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Prove competence and job pathway. Trainees and their families want clarity on duration, format, and what happens after graduation.',
      actionPrompt:
        'Publish one programme breakdown this week (duration, format, certificate, job support). Share one value tip or skill demo.',
      tasks: [
        'Publish a programme breakdown: duration, format, certificate, job support, fees',
        'Share one skill demo or mini-lesson reel showing what trainees learn',
        'Reply to every prospect message within a few hours',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Secure enrolment with a payment plan and a specific intake date. {{target_customer}} commits when there is a calendar deadline and a feasible payment path.',
      actionPrompt:
        'Announce a specific intake date with limited slots. Offer a 50-percent-upfront payment plan and follow up enquirers within 24 hours.',
      tasks: [
        'Announce a specific intake date with a published slot count',
        'Offer a 50-percent-upfront payment plan (rest by week 4)',
        'Follow up every prospect within 24 hours of their first enquiry',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Graduates who earn refer aggressively. {{business_name}} keeps them in a network where the alumni do most of the marketing.',
      actionPrompt:
        'Set up an alumni group where past trainees share gigs and refer new students. Offer a referral bonus per successful enrolment.',
      tasks: [
        'Set up an alumni WhatsApp or Facebook group for graduates',
        'Celebrate graduate wins (first job, first client) publicly with permission',
        'Offer a clear referral bonus (cash or programme credit) for every new student',
      ],
    },
  ],
};

const SCHOOL_ADMISSIONS: TemplateDefinition = {
  id: 'education:school',
  industry: 'education',
  businessType: ['school', 'nursery', 'primary_school', 'secondary_school'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Parents choosing a school for {{target_customer}} look for safety, values, and outcomes. {{business_name}} needs all three visible long before the admissions form opens.',
      actionPrompt:
        'Publish one values-and-outcomes piece this week. Share a short school-day-in-the-life clip and ask current parents to share.',
      tasks: [
        'Post one piece per week on school values, outcomes, or pupil achievements',
        'Share a school-day-in-the-life clip showing learning and care in action',
        'Ask current parents to share the school profile in their networks',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Help parents move from awareness to a school visit. Real pupil work, teacher introductions, and clear FAQs do that better than glossy brochures.',
      actionPrompt:
        'Share one teacher introduction or pupil achievement this week. Publish a clear school visit invitation.',
      tasks: [
        'Share one teacher introduction or pupil achievement story',
        'Publish a clear "book a school visit" invitation with available days',
        'Answer every parent enquiry within a few hours',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Admissions convert when paperwork is simple and the price is clear. {{target_customer}} parents need a one-call path from enquiry to enrolment confirmation.',
      actionPrompt:
        'Publish the full fee schedule and admissions process this week. Offer a school visit slot to every enquiring parent and follow up within 48 hours.',
      tasks: [
        'Publish the term fees schedule and admissions process clearly',
        'Offer a school visit slot to every enquiring parent',
        'Follow up every parent within 48 hours of their visit',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Retention here is renewal each term and referrals from satisfied parents. Both come from communication, not luck.',
      actionPrompt:
        'Send a termly parent update covering pupil progress and school plans. Run a referral programme for parent-to-parent introductions.',
      tasks: [
        'Send a termly parent update on academic and pastoral progress',
        'Run a referral programme rewarding parents who introduce other families',
        'Celebrate pupil and staff wins publicly with parent permission',
      ],
    },
  ],
};

const EDTECH_APP: TemplateDefinition = {
  id: 'education:edtech',
  industry: 'education',
  businessType: ['edtech', 'study_platform', 'learning_app'],
  stages: [
    {
      position: 1,
      name: 'Get Noticed',
      channel: CHANNEL,
      explanation:
        'Students choose study apps that their peers already use. {{business_name}} needs to be visible where {{target_customer}} hangs out: TikTok, Instagram, WhatsApp study groups.',
      actionPrompt:
        'Publish one bite-sized study tip or past-question walkthrough this week. Encourage current users to invite one friend.',
      tasks: [
        'Post one bite-sized study tip or past-question walkthrough per week',
        'Share a short app-in-use video showing how a specific feature works',
        'Encourage current users to invite one friend via in-app share',
      ],
    },
    {
      position: 2,
      name: 'Spark Interest',
      channel: CHANNEL,
      explanation:
        'Show what the app does without forcing a download. Comparison content, sample lessons, and result-driven testimonials lower the activation barrier.',
      actionPrompt:
        'Publish one sample lesson clip and one student-result testimonial this week.',
      tasks: [
        'Share one sample lesson or past-question reel per week',
        'Post one student result or improvement testimonial every 3 days',
        'Reply to every comment and message within a few hours',
      ],
    },
    {
      position: 3,
      name: 'Make First Sale',
      channel: CHANNEL,
      explanation:
        'Get {{target_customer}} from app download to first paid subscription. A free trial that requires no card upfront converts faster than any discount.',
      actionPrompt:
        'Offer a no-payment-required free trial this week. Send a clear two-step subscription path from trial to paid.',
      tasks: [
        'Offer a no-payment-required free trial (3-14 days) prominently',
        'Send a clear two-step path from trial signup to paid subscription',
        'Follow up trial users on day 1 and day 5 with onboarding nudges',
      ],
    },
    {
      position: 4,
      name: 'Bring Them Back',
      channel: CHANNEL,
      explanation:
        'Retention is daily-active usage. {{business_name}} brings {{target_customer}} back with streaks, study reminders, and peer leaderboards.',
      actionPrompt:
        'Send a daily study reminder to every active user. Run a weekly leaderboard or streak-completion celebration.',
      tasks: [
        'Send a daily study reminder to every active user with their next recommended task',
        'Run a weekly leaderboard or streak-completion celebration in-app',
        'Reward users who refer a friend with extra premium days or content',
      ],
    },
  ],
};

export const EDUCATION_TEMPLATES: readonly TemplateDefinition[] = [
  ONLINE_COURSE,
  TUTORING_SCHOOL,
  VOCATIONAL_SKILLS,
  SCHOOL_ADMISSIONS,
  EDTECH_APP,
] as const;
