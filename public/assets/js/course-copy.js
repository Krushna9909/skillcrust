/**
 * public/assets/js/course-copy.js
 *
 * Static, marketing-only copy for the six SuccessRich courses. Purely
 * presentational — it never replaces API data (name/price/id always come
 * from GET /api/v1/courses). Matched by normalised course name so the
 * backend catalogue stays the single source of truth.
 */

window.COURSE_COPY = {
  'skills pro': {
    level: 'Foundation',
    tagline: 'Build the confidence and communication skills that unlock everything else.',
    skills: ['Affiliate Marketing Fundamentals', 'Public Speaking', 'Communication Skills', 'Personality Development', 'Business Opportunity Basics'],
    audience: 'Absolute beginners who want a strong foundation before going deeper.',
    overview: 'Skills Pro is the starting line. It builds the human skills every other track depends on — speaking clearly, presenting yourself well, and thinking like someone who spots opportunity.',
    curriculum: [
      ['Affiliate Marketing Fundamentals', 'What affiliate marketing is, how referral-based business models work, setting realistic expectations.'],
      ['Public Speaking', 'Overcoming stage fear, structuring a talk, tone and body language basics.'],
      ['Communication Skills', 'Clear messaging, active listening, speaking confidently in professional settings.'],
      ['Personality Development', 'First impressions, self-presentation, personal branding basics.'],
      ['Business Opportunity Essentials', 'Thinking like an entrepreneur, spotting opportunity, next steps into other SuccessRich tracks.'],
    ],
    faqs: [
      ["Is this course useful if I'm not interested in affiliate marketing?", 'Yes — the communication and personality development modules stand on their own.'],
      ['How long does it take to finish?', 'Self-paced; most learners complete it in 1–2 weeks.'],
    ],
    next: ['Editing Pro', 'turning what you can say into what you can create — mobile editing, Canva, Photoshop and Premiere Pro.'],
  },
  'editing pro': {
    level: 'Creative',
    tagline: 'Turn raw footage and ideas into scroll-stopping visuals.',
    skills: ['VN Mobile Editing', 'Canva Mastery', 'Photoshop', 'Illustration', 'Premiere Pro', 'Freelancing Fundamentals'],
    audience: 'Anyone who wants to create professional visual content and freelance with it.',
    overview: 'Editing Pro takes you from phone edits to desktop-grade production. You learn the tools clients actually ask for, then how to package that into paid freelance work.',
    curriculum: [
      ['VN Mobile Editing', 'Mobile-first editing workflow, transitions, effects, quick-turnaround content.'],
      ['Canva Mastery', 'Design fundamentals, templates, social media graphics.'],
      ['Photoshop', 'Photo retouching, compositing, basic graphic design.'],
      ['Illustration', 'Digital illustration basics, tools and techniques.'],
      ['Premiere Pro', 'Desktop-level video editing, color grading, export settings.'],
      ['Freelancing Fundamentals', 'Building a portfolio, finding clients, pricing your work.'],
    ],
    faqs: [
      ['Do I need a laptop, or can I do this on my phone?', 'Both — VN and Canva modules work fully on phone; Photoshop and Premiere need a desktop.'],
      ['Can I start freelancing right after this?', 'The freelancing module is built to get you portfolio-ready.'],
    ],
    next: ['Marketing Pro', 'growing the audience that sees the work you make.'],
  },
  'marketing pro': {
    level: 'Growth',
    tagline: 'Learn to grow audiences and run ads that actually convert.',
    skills: ['Instagram Growth', 'Facebook Ads Mastery', 'Google Ads Mastery', 'YouTube Growth Mastery', 'Digital Product Selling'],
    audience: 'Learners ready to move from creating content to growing and monetizing an audience.',
    overview: 'Marketing Pro is the bridge from making content to making it work. Organic growth on Instagram and YouTube, paid campaigns on Meta and Google, and selling digital products end to end.',
    curriculum: [
      ['Instagram Growth', 'Content strategy, reels, growth tactics.'],
      ['Facebook Ads Mastery', 'Campaign setup, audience targeting, budget optimization.'],
      ['Google Ads Mastery', 'Search and display campaigns, keyword strategy.'],
      ['YouTube Growth Mastery', 'Channel strategy, SEO, audience retention.'],
      ['Digital Product Selling', 'Building and selling digital products online.'],
    ],
    faqs: [
      ['Do I need an existing audience to start?', 'No — the course starts from zero and builds up.'],
      ['Does this cover ad budget/spend, or just strategy?', 'Both — practical campaign setup, not just theory.'],
    ],
    next: ['Content Pro', 'building a personal brand on top of the audience you grow.'],
  },
  'content pro': {
    level: 'Creator',
    tagline: 'Build a personal brand and turn content into a career.',
    skills: ['Content Writing', 'Video Creation', 'Content Planning & Monetization', 'Personal Branding', 'Creator Income Strategies'],
    audience: 'Aspiring creators who want to build a brand, not just post content.',
    overview: 'Content Pro treats content as a career, not a hobby. Writing, shooting, planning and monetizing — with a branding track for creators starting from zero.',
    curriculum: [
      ['Content Writing', 'Copywriting basics, storytelling, writing for different platforms.'],
      ['Video Creation', 'Planning, shooting, and editing short-form video.'],
      ['Content Planning & Monetization', 'Content calendars, monetization streams.'],
      ['Personal Branding', 'Finding your niche, consistent brand voice.'],
      ['Creator Income Strategies', 'Diversifying income as a creator.'],
    ],
    faqs: [
      ['Is this only for video creators, or writers too?', 'Both — the writing and video modules are separate skill tracks.'],
      ["What if I don't have a following yet?", 'The branding module is built for creators starting from zero.'],
    ],
    next: ['AI & Automation Pro', 'using AI tools to produce and deliver at ten times the speed.'],
  },
  'ai & automation pro': {
    level: 'Advanced',
    tagline: 'Master the AI tools reshaping how people work and create.',
    skills: ['ChatGPT & Prompt Mastery', 'Website Building Using AI', 'AI for Freelancers & Agencies', 'AI Automation / AI Agents', 'AI Content Marketing', 'AI Creator Income Strategies'],
    audience: 'Learners who want to stay ahead by mastering AI-powered workflows.',
    overview: 'AI & Automation Pro is a working toolkit, not a tour. Prompting, AI-built websites, automations and agents, and how freelancers and agencies use them to deliver faster.',
    curriculum: [
      ['ChatGPT & Prompt Mastery', 'Prompt engineering fundamentals, practical use cases.'],
      ['Website Building Using AI', 'No-code / AI-assisted website builders.'],
      ['AI for Freelancers & Agencies', 'Using AI tools to deliver client work faster.'],
      ['AI Automation / AI Agents', 'Building simple automations and AI agents.'],
      ['AI Content Marketing', 'Using AI tools for content at scale.'],
      ['AI Creator Income Strategies', 'Monetizing AI-related skills.'],
    ],
    faqs: [
      ['Do I need to know how to code?', 'No — everything is built around no-code / low-code AI tools.'],
      ['Will this stay updated as AI tools change?', 'Course content is reviewed and updated as tools evolve.'],
    ],
    next: ['Business Pro', 'turning skills into an agency, a store, or a company of your own.'],
  },
  'business pro': {
    level: 'Entrepreneur',
    tagline: 'Everything you need to think, sell, and build like an entrepreneur.',
    skills: ['Stock Market Basics', 'Digital Agency Blueprint', 'Complete E-Commerce Guide', 'Sales & Customer Psychology', 'Start-Up Guide', 'Dropshipping Fundamentals'],
    audience: 'Serious learners ready to build and run their own business or agency.',
    overview: 'Business Pro is the top tier: money fundamentals, agency and e-commerce playbooks, sales psychology, and a start-up track that takes an idea from validation to launch.',
    curriculum: [
      ['Stock Market Basics', 'Investing fundamentals.'],
      ['Digital Agency Blueprint', 'Building and running an agency.'],
      ['Complete E-Commerce Guide', 'Setting up and running an online store.'],
      ['Sales, Closing Skills & Customer Psychology', 'Sales fundamentals, negotiation, buyer psychology.'],
      ['Start-Up Guide', 'Idea validation, business planning.'],
      ['Dropshipping Business Fundamentals', 'The dropshipping model, suppliers, logistics.'],
    ],
    faqs: [
      ['Is this course for someone with zero business experience?', 'Yes — it starts from fundamentals before going into agency and e-commerce specifics.'],
      ['Do I need to buy any tools separately?', 'The course covers strategy; any third-party tool subscriptions (e.g. Shopify) are separate.'],
    ],
    next: null,
  },
};

window.courseCopy = function (name) {
  var key = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return window.COURSE_COPY[key] || null;
};

/**
 * Course artwork, matched by the same normalised course name. Purely
 * decorative — a course with no match simply renders without an image.
 */
window.COURSE_IMAGES = {
  'skills pro': '/assets/img/course-skills.jpg',
  'editing pro': '/assets/img/course-editing.jpg',
  'marketing pro': '/assets/img/course-marketing.jpg',
  'content pro': '/assets/img/course-content.jpg',
  'ai & automation pro': '/assets/img/course-ai.jpg',
  'business pro': '/assets/img/course-business.jpg',
};

window.courseImage = function (name) {
  var key = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return window.COURSE_IMAGES[key] || '/assets/img/course-skills.jpg';
};

/** Admin-uploaded thumbnail wins over the bundled artwork. */
window.courseArt = function (course) {
  if (course && (course.thumbnailUrl || course.thumbnail_url)) {
    return course.thumbnailUrl || course.thumbnail_url;
  }
  return window.courseImage(course && course.name);
};

/**
 * Shared presentational helpers used by every public course view.
 * Live here (not in courses-preview.js) so course-detail.html, which does
 * not load the preview script, can use them too.
 */
window.escapeHtml = function (str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
};

window.formatRupees = function (amount) {
  var num = Number(amount);
  if (!Number.isFinite(num)) return '\u20B9\u2014';
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};
