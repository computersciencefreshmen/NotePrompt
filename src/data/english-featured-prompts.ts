import { PublicPrompt } from '@/types'

const publishedAt = '2026-05-25T00:00:00.000Z'

const baseEnglishFeaturedPrompts: PublicPrompt[] = [
  {
    id: 900001,
    title: 'Executive Decision Brief',
    description: 'Turn messy business context into a concise decision memo with options, trade-offs, and a recommendation.',
    content: `You are a senior strategy operator writing for executives.

Context:
{{context}}

Decision needed:
{{decision}}

Create a decision brief with:
1. Executive summary in 5 bullets or fewer
2. Key facts and assumptions
3. Option A / B / C comparison table
4. Risks, constraints, and second-order effects
5. Recommended path and why
6. Next 7-day action plan

Rules:
- Separate facts from assumptions.
- If data is missing, list the exact missing inputs before recommending.
- Be direct, specific, and commercially grounded.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Business',
    tags: ['Strategy', 'Decision', 'Executive'],
    views_count: 240,
    favorites_count: 42,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900002,
    title: 'Product Requirements Draft',
    description: 'Generate a structured PRD from a product idea, including users, scope, acceptance criteria, and metrics.',
    content: `Act as a senior product manager.

Product idea:
{{idea}}

Target users:
{{users}}

Write a product requirements draft with:
- Problem statement
- User personas and jobs-to-be-done
- Core user flows
- Functional requirements
- Non-functional requirements
- Acceptance criteria
- Success metrics
- Launch risks and mitigations

Constraints:
- Keep requirements testable.
- Mark assumptions clearly.
- Do not add features that are unrelated to the stated user problem.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Product',
    tags: ['PRD', 'Product', 'Requirements'],
    views_count: 198,
    favorites_count: 37,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900003,
    title: 'Code Review Checklist',
    description: 'Review code for correctness, readability, edge cases, security, performance, and test coverage.',
    content: `You are a pragmatic senior software engineer reviewing a pull request.

Code or diff:
{{code}}

Review it in this order:
1. Critical bugs or regressions
2. Security and data exposure risks
3. Performance and scalability concerns
4. Maintainability and readability
5. Missing tests or weak test coverage
6. Suggested improvements

Output format:
- Findings first, ordered by severity
- Each finding must include evidence from the code
- Keep praise brief
- If there are no blocking issues, say that clearly`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Engineering',
    tags: ['Code Review', 'Engineering', 'Quality'],
    views_count: 310,
    favorites_count: 58,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900004,
    title: 'Research Synthesis Matrix',
    description: 'Synthesize multiple sources into themes, evidence, contradictions, and research gaps.',
    content: `You are a research analyst.

Sources or notes:
{{sources}}

Synthesize the material into:
1. Core themes
2. Evidence table with source, claim, strength, and caveats
3. Contradictions or unresolved questions
4. Practical implications
5. Recommended next research steps

Rules:
- Do not invent citations.
- Distinguish strong evidence from weak signals.
- Preserve nuance when sources disagree.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Research',
    tags: ['Research', 'Synthesis', 'Analysis'],
    views_count: 176,
    favorites_count: 29,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900005,
    title: 'Landing Page Copy System',
    description: 'Create conversion-focused landing page copy with positioning, objections, CTAs, and page structure.',
    content: `Act as a conversion copywriter and product marketer.

Product:
{{product}}

Audience:
{{audience}}

Offer:
{{offer}}

Write landing page copy with:
- Hero headline and subheadline
- Primary CTA and secondary CTA
- Problem section
- Product value proposition
- Feature-to-benefit map
- Social proof ideas
- Objection handling
- Pricing or plan framing
- Final CTA

Rules:
- Make claims concrete.
- Avoid hype unless supported by proof.
- Write in clear customer language.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Marketing',
    tags: ['Copywriting', 'Landing Page', 'Marketing'],
    views_count: 265,
    favorites_count: 51,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900006,
    title: 'Meeting to Action Plan',
    description: 'Convert meeting notes into decisions, owners, deadlines, risks, and follow-up messages.',
    content: `You are an operations lead turning meeting notes into execution clarity.

Meeting notes:
{{notes}}

Create:
1. Decisions made
2. Open questions
3. Action items table: task, owner, due date, dependency, status
4. Risks and blockers
5. Follow-up message to send to attendees

Rules:
- If an owner or due date is missing, mark it as "Needs assignment".
- Do not bury action items in prose.
- Keep the follow-up message concise and professional.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Operations',
    tags: ['Meeting', 'Operations', 'Action Plan'],
    views_count: 221,
    favorites_count: 33,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900007,
    title: 'User Interview Analysis',
    description: 'Analyze interview notes for jobs-to-be-done, pain points, quotes, opportunities, and next questions.',
    content: `You are a UX researcher.

Interview notes:
{{notes}}

Analyze the interview with:
- Participant context
- Jobs-to-be-done
- Pain points and severity
- Direct quotes worth preserving
- Current workaround behavior
- Product opportunities
- Follow-up questions

Rules:
- Do not overgeneralize from one participant.
- Separate observed behavior from interpretation.
- Flag low-confidence insights.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'UX',
    tags: ['UX Research', 'Interview', 'Insights'],
    views_count: 154,
    favorites_count: 24,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900008,
    title: 'Data Analysis Plan',
    description: 'Design a practical analysis plan with hypotheses, metrics, segments, queries, and interpretation risks.',
    content: `You are a data analyst planning an analysis before writing queries.

Business question:
{{question}}

Available data:
{{data}}

Create an analysis plan with:
1. Hypotheses
2. Primary and secondary metrics
3. Segments and cohorts
4. Required data fields
5. Query outline or pseudocode
6. Interpretation risks
7. Expected output format

Rules:
- Warn about correlation vs causation.
- Identify missing data early.
- Prefer actionable metrics over vanity metrics.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Data',
    tags: ['Data Analysis', 'Metrics', 'Planning'],
    views_count: 185,
    favorites_count: 31,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900009,
    title: 'Learning Path Designer',
    description: 'Build a structured learning path with levels, exercises, checkpoints, and measurable outcomes.',
    content: `You are an instructional designer.

Topic:
{{topic}}

Learner level:
{{level}}

Design a learning path with:
- Learning outcomes
- Prerequisites
- 4-6 modules
- Practice exercises for each module
- Assessment checkpoints
- Common misconceptions
- Recommended weekly schedule

Rules:
- Make outcomes measurable.
- Include active practice, not only reading.
- Adapt difficulty to the learner level.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Education',
    tags: ['Learning', 'Education', 'Curriculum'],
    views_count: 166,
    favorites_count: 27,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900010,
    title: 'Risk Register Builder',
    description: 'Create a project risk register with probability, impact, mitigations, owners, and trigger signals.',
    content: `You are a project risk manager.

Project context:
{{context}}

Create a risk register table with:
- Risk
- Cause
- Probability
- Impact
- Severity
- Early warning signal
- Mitigation
- Contingency plan
- Owner

Rules:
- Include operational, technical, financial, legal, and adoption risks when relevant.
- Make mitigations specific.
- Highlight the top 3 risks after the table.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Project Management',
    tags: ['Risk', 'Project', 'Management'],
    views_count: 143,
    favorites_count: 21,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900011,
    title: 'Sales Discovery Call Prep',
    description: 'Prepare discovery questions, qualification criteria, objection probes, and next-step strategy.',
    content: `You are a B2B sales strategist preparing for a discovery call.

Account context:
{{account}}

Goal:
{{goal}}

Prepare:
1. Account hypothesis
2. Discovery questions by theme
3. Qualification criteria
4. Likely objections and probes
5. Value narrative to test
6. Next-step options

Rules:
- Questions should reveal urgency, budget, authority, and pain.
- Avoid leading questions.
- Keep the call focused on customer context before pitching.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Sales',
    tags: ['Sales', 'Discovery', 'B2B'],
    views_count: 137,
    favorites_count: 19,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
  {
    id: 900012,
    title: 'Prompt Quality Evaluator',
    description: 'Score and improve a prompt using role clarity, input quality, constraints, output format, and testability.',
    content: `You are a prompt engineering evaluator.

Prompt to evaluate:
{{prompt}}

Evaluate it across these dimensions:
- Role clarity
- Task specificity
- Context completeness
- Input variables
- Output format
- Constraints and safety
- Testability

For each dimension, provide:
- Score from 1-5
- Evidence
- Improvement suggestion

Then rewrite the prompt into a stronger version.`,
    author: 'Note Prompt',
    author_id: 0,
    category: 'Prompt Engineering',
    tags: ['Prompt Engineering', 'Evaluation', 'Optimization'],
    views_count: 295,
    favorites_count: 62,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
  },
]

type SupplementalPromptSpec = {
  title: string
  description: string
  category: string
  tags: string[]
  inputLabel: string
  deliverables: string[]
  rules: string[]
}

const supplementalPromptSpecs: SupplementalPromptSpec[] = [
  {
    title: 'Competitive Positioning Map',
    description: 'Compare competitors by audience, promise, proof, pricing, and differentiation opportunities.',
    category: 'Strategy',
    tags: ['Competitive Analysis', 'Positioning', 'Strategy'],
    inputLabel: 'Market and competitor notes',
    deliverables: ['competitor comparison table', 'positioning gaps', 'defensible differentiation angles', 'recommended messaging tests'],
    rules: ['Use only the evidence provided.', 'Separate observed facts from interpretation.', 'Flag weak or missing proof.'],
  },
  {
    title: 'Customer Persona Builder',
    description: 'Turn research notes into practical personas with pains, jobs, triggers, objections, and buying criteria.',
    category: 'Marketing',
    tags: ['Persona', 'Customer Research', 'Marketing'],
    inputLabel: 'Customer research notes',
    deliverables: ['persona summary', 'jobs-to-be-done', 'pain and trigger map', 'messaging implications'],
    rules: ['Do not invent demographics.', 'Preserve direct customer language.', 'Mark low-confidence insights.'],
  },
  {
    title: 'Founder Weekly Update',
    description: 'Write a crisp weekly investor or stakeholder update with progress, metrics, asks, and risks.',
    category: 'Operations',
    tags: ['Founder', 'Update', 'Operations'],
    inputLabel: 'Weekly notes and metrics',
    deliverables: ['headline summary', 'wins', 'metrics', 'blockers', 'asks', 'next-week priorities'],
    rules: ['Keep it skimmable.', 'Quantify progress when possible.', 'Make asks explicit.'],
  },
  {
    title: 'Bug Report Triage',
    description: 'Convert messy bug notes into reproducible steps, expected behavior, severity, and owner-ready context.',
    category: 'Engineering',
    tags: ['Bug', 'QA', 'Engineering'],
    inputLabel: 'Bug report or user complaint',
    deliverables: ['reproduction steps', 'expected vs actual behavior', 'severity assessment', 'debugging hypotheses', 'missing information'],
    rules: ['Avoid assigning blame.', 'Prefer testable hypotheses.', 'Call out environment details.'],
  },
  {
    title: 'API Documentation Draft',
    description: 'Create developer-friendly API docs with endpoint behavior, examples, errors, and edge cases.',
    category: 'Engineering',
    tags: ['API', 'Documentation', 'Developer Experience'],
    inputLabel: 'Endpoint details or implementation notes',
    deliverables: ['endpoint summary', 'request schema', 'response examples', 'error cases', 'integration notes'],
    rules: ['Use clear examples.', 'Document required and optional fields.', 'Include authentication assumptions.'],
  },
  {
    title: 'SQL Query Review',
    description: 'Review SQL for correctness, indexing, performance, safety, and maintainability.',
    category: 'Data',
    tags: ['SQL', 'Database', 'Performance'],
    inputLabel: 'SQL query and table context',
    deliverables: ['correctness risks', 'performance risks', 'index suggestions', 'safer rewrite', 'test cases'],
    rules: ['Do not assume hidden indexes.', 'Explain trade-offs.', 'Prefer parameterized patterns.'],
  },
  {
    title: 'Experiment Design Plan',
    description: 'Design an A/B test with hypothesis, sample, metrics, guardrails, and decision rules.',
    category: 'Growth',
    tags: ['Experiment', 'A/B Test', 'Growth'],
    inputLabel: 'Experiment idea and available data',
    deliverables: ['hypothesis', 'variants', 'primary metric', 'guardrail metrics', 'sample considerations', 'decision rule'],
    rules: ['Avoid vanity metrics.', 'Define success before results.', 'Identify confounders.'],
  },
  {
    title: 'Launch Checklist Builder',
    description: 'Build a cross-functional launch checklist covering product, marketing, support, analytics, and risk.',
    category: 'Product',
    tags: ['Launch', 'Checklist', 'Product'],
    inputLabel: 'Launch context',
    deliverables: ['workstream checklist', 'owners', 'deadlines', 'dependencies', 'go/no-go criteria'],
    rules: ['Make tasks observable.', 'Separate pre-launch and post-launch work.', 'Include rollback criteria.'],
  },
  {
    title: 'PR FAQ Writer',
    description: 'Write an Amazon-style PR FAQ to clarify product narrative, customer value, and hard questions.',
    category: 'Product',
    tags: ['PRFAQ', 'Product Strategy', 'Narrative'],
    inputLabel: 'Product idea and target customer',
    deliverables: ['press release', 'customer FAQ', 'internal FAQ', 'risks', 'open questions'],
    rules: ['Write from the customer outcome backward.', 'Avoid vague claims.', 'Answer uncomfortable questions directly.'],
  },
  {
    title: 'Content Brief Generator',
    description: 'Create a content brief with search intent, angle, outline, examples, and quality bar.',
    category: 'Content',
    tags: ['Content', 'SEO', 'Brief'],
    inputLabel: 'Topic, audience, and goal',
    deliverables: ['search intent', 'reader promise', 'outline', 'examples to include', 'quality checklist'],
    rules: ['Prioritize usefulness over keyword stuffing.', 'Make the angle specific.', 'Include original examples.'],
  },
  {
    title: 'LinkedIn Post Refiner',
    description: 'Turn a rough idea into a concise LinkedIn post with hook, story, takeaway, and CTA.',
    category: 'Content',
    tags: ['LinkedIn', 'Social', 'Writing'],
    inputLabel: 'Rough post idea',
    deliverables: ['3 hook options', 'polished post', 'alternate shorter version', 'CTA options'],
    rules: ['Keep the voice natural.', 'Avoid empty inspiration.', 'Make the takeaway concrete.'],
  },
  {
    title: 'Cold Email Sequence',
    description: 'Write a respectful outbound sequence tailored to customer pain, proof, and next step.',
    category: 'Sales',
    tags: ['Cold Email', 'Sales', 'Outbound'],
    inputLabel: 'Prospect context and offer',
    deliverables: ['email 1', 'follow-up 1', 'follow-up 2', 'subject lines', 'personalization notes'],
    rules: ['Do not overpromise.', 'Keep each email short.', 'Lead with relevance, not features.'],
  },
  {
    title: 'Objection Handling Playbook',
    description: 'Create responses to common sales objections using evidence, empathy, and next-step probes.',
    category: 'Sales',
    tags: ['Objections', 'Sales Enablement', 'B2B'],
    inputLabel: 'Objections and product context',
    deliverables: ['objection categories', 'response scripts', 'proof points', 'diagnostic questions', 'follow-up actions'],
    rules: ['Acknowledge before responding.', 'Avoid defensive language.', 'Use questions to clarify intent.'],
  },
  {
    title: 'Support Macro Writer',
    description: 'Create customer support replies that are empathetic, accurate, and action-oriented.',
    category: 'Support',
    tags: ['Support', 'Customer Success', 'Communication'],
    inputLabel: 'Customer issue and policy context',
    deliverables: ['customer reply', 'internal note', 'escalation criteria', 'follow-up checklist'],
    rules: ['Do not admit fault unless confirmed.', 'Use plain language.', 'Give the customer a clear next step.'],
  },
  {
    title: 'Churn Risk Analysis',
    description: 'Analyze customer health signals and produce retention actions by risk level.',
    category: 'Customer Success',
    tags: ['Churn', 'Retention', 'Customer Success'],
    inputLabel: 'Customer usage and account notes',
    deliverables: ['risk diagnosis', 'health score rationale', 'retention actions', 'executive escalation note'],
    rules: ['Tie actions to evidence.', 'Separate product issues from relationship issues.', 'Prioritize high-leverage interventions.'],
  },
  {
    title: 'Hiring Scorecard',
    description: 'Define a role scorecard with outcomes, competencies, evidence, and interview signals.',
    category: 'People',
    tags: ['Hiring', 'Interview', 'Scorecard'],
    inputLabel: 'Role description and team context',
    deliverables: ['mission', '90-day outcomes', 'competencies', 'interview evidence', 'red flags'],
    rules: ['Make criteria observable.', 'Avoid personality stereotypes.', 'Separate must-have from nice-to-have.'],
  },
  {
    title: 'Interview Question Bank',
    description: 'Generate structured interview questions tied to outcomes, evidence, and scoring rubrics.',
    category: 'People',
    tags: ['Interview', 'Hiring', 'Rubric'],
    inputLabel: 'Role scorecard or requirements',
    deliverables: ['behavioral questions', 'work-sample prompts', 'follow-up probes', 'scoring rubric'],
    rules: ['Ask for evidence from real work.', 'Avoid leading questions.', 'Use consistent scoring criteria.'],
  },
  {
    title: 'Meeting Facilitator Agenda',
    description: 'Create a focused agenda with goals, roles, timeboxes, decisions, and pre-reads.',
    category: 'Operations',
    tags: ['Meeting', 'Facilitation', 'Agenda'],
    inputLabel: 'Meeting goal and participants',
    deliverables: ['objective', 'agenda table', 'decision points', 'pre-read list', 'follow-up template'],
    rules: ['Remove agenda items that do not support the goal.', 'Assign owners.', 'Protect time for decisions.'],
  },
  {
    title: 'SOP Builder',
    description: 'Transform a repeated workflow into a standard operating procedure with checks and exceptions.',
    category: 'Operations',
    tags: ['SOP', 'Process', 'Operations'],
    inputLabel: 'Workflow notes',
    deliverables: ['purpose', 'scope', 'steps', 'quality checks', 'exceptions', 'owner responsibilities'],
    rules: ['Use numbered steps.', 'Make handoffs explicit.', 'Include failure modes.'],
  },
  {
    title: 'Incident Postmortem',
    description: 'Write a blameless incident review with timeline, impact, root causes, and corrective actions.',
    category: 'Engineering',
    tags: ['Incident', 'Postmortem', 'Reliability'],
    inputLabel: 'Incident timeline and notes',
    deliverables: ['summary', 'customer impact', 'timeline', 'root causes', 'corrective actions', 'owner table'],
    rules: ['Stay blameless.', 'Separate detection, mitigation, and prevention.', 'Make actions measurable.'],
  },
  {
    title: 'Security Threat Model',
    description: 'Map assets, trust boundaries, threats, controls, and residual risks for a feature or system.',
    category: 'Security',
    tags: ['Security', 'Threat Modeling', 'Risk'],
    inputLabel: 'System or feature description',
    deliverables: ['assets', 'trust boundaries', 'threat scenarios', 'mitigations', 'residual risks'],
    rules: ['Consider authentication, data exposure, abuse, and operational risks.', 'Prioritize by likelihood and impact.', 'Avoid alarmism.'],
  },
  {
    title: 'Privacy Review Checklist',
    description: 'Review data collection, retention, consent, sharing, and user controls for a product flow.',
    category: 'Security',
    tags: ['Privacy', 'Compliance', 'Data'],
    inputLabel: 'Feature and data flow',
    deliverables: ['data inventory', 'purpose mapping', 'retention risks', 'user controls', 'privacy questions'],
    rules: ['Minimize collected data.', 'Identify sensitive fields.', 'Flag unclear consent.'],
  },
  {
    title: 'Architecture Decision Record',
    description: 'Draft an ADR with context, options, decision, consequences, and follow-up work.',
    category: 'Engineering',
    tags: ['Architecture', 'ADR', 'Decision'],
    inputLabel: 'Technical decision context',
    deliverables: ['context', 'options considered', 'decision', 'consequences', 'follow-up tasks'],
    rules: ['Represent alternatives fairly.', 'Call out trade-offs.', 'Make the decision reversible status clear.'],
  },
  {
    title: 'Refactoring Plan',
    description: 'Plan a low-risk refactor with scope, sequencing, tests, migration, and rollback strategy.',
    category: 'Engineering',
    tags: ['Refactoring', 'Planning', 'Code Quality'],
    inputLabel: 'Code smell or refactor goal',
    deliverables: ['current problems', 'target shape', 'step-by-step plan', 'test strategy', 'rollback plan'],
    rules: ['Keep behavior changes separate.', 'Reduce blast radius.', 'Name verification points.'],
  },
  {
    title: 'Design Critique Assistant',
    description: 'Review a UI or flow for hierarchy, clarity, accessibility, consistency, and conversion friction.',
    category: 'Design',
    tags: ['Design Review', 'UX', 'Accessibility'],
    inputLabel: 'Design description or screenshot notes',
    deliverables: ['top usability issues', 'accessibility concerns', 'visual hierarchy notes', 'copy improvements', 'priority fixes'],
    rules: ['Prioritize user impact.', 'Be specific about fixes.', 'Avoid personal taste unless tied to usability.'],
  },
  {
    title: 'User Story Mapper',
    description: 'Break an idea into user activities, stories, slices, acceptance criteria, and release sequence.',
    category: 'Product',
    tags: ['User Stories', 'Roadmap', 'Product'],
    inputLabel: 'Product idea or feature brief',
    deliverables: ['user activities', 'story map', 'MVP slice', 'acceptance criteria', 'release sequence'],
    rules: ['Focus on user outcomes.', 'Keep stories testable.', 'Identify dependencies.'],
  },
  {
    title: 'KPI Tree Builder',
    description: 'Turn a business goal into a metric tree with drivers, leading indicators, and instrumentation needs.',
    category: 'Data',
    tags: ['KPI', 'Metrics', 'Analytics'],
    inputLabel: 'Business goal and context',
    deliverables: ['north-star metric', 'driver tree', 'leading indicators', 'instrumentation gaps', 'review cadence'],
    rules: ['Avoid vanity metrics.', 'Define every metric.', 'Connect metrics to decisions.'],
  },
  {
    title: 'Dashboard Requirements',
    description: 'Create dashboard specs with users, decisions, metrics, filters, alerts, and data caveats.',
    category: 'Data',
    tags: ['Dashboard', 'Analytics', 'BI'],
    inputLabel: 'Dashboard audience and goal',
    deliverables: ['user decisions', 'metric definitions', 'layout plan', 'filters', 'alerts', 'data caveats'],
    rules: ['Design for decisions, not decoration.', 'Name refresh frequency.', 'Flag ambiguous metrics.'],
  },
  {
    title: 'Legal Clause Explainer',
    description: 'Explain contract clauses in plain language with obligations, risks, and negotiation questions.',
    category: 'Legal Ops',
    tags: ['Contract', 'Legal', 'Risk'],
    inputLabel: 'Contract clause text',
    deliverables: ['plain-language summary', 'obligations', 'risk areas', 'questions for counsel', 'negotiation points'],
    rules: ['Do not provide legal advice.', 'Preserve uncertainty.', 'Recommend professional review for high-risk clauses.'],
  },
  {
    title: 'Grant Proposal Outline',
    description: 'Structure a grant proposal with problem, impact, method, budget rationale, and evaluation plan.',
    category: 'Writing',
    tags: ['Grant', 'Proposal', 'Nonprofit'],
    inputLabel: 'Grant opportunity and project notes',
    deliverables: ['proposal outline', 'impact argument', 'method summary', 'budget rationale', 'evaluation plan'],
    rules: ['Align with funder priorities.', 'Make impact measurable.', 'Do not invent credentials.'],
  },
  {
    title: 'Academic Literature Review',
    description: 'Organize papers into themes, methods, findings, limitations, and research gaps.',
    category: 'Research',
    tags: ['Academic', 'Literature Review', 'Research'],
    inputLabel: 'Paper notes or abstracts',
    deliverables: ['theme map', 'method comparison', 'findings matrix', 'limitations', 'research gaps'],
    rules: ['Do not fabricate citations.', 'Represent disagreement fairly.', 'Separate summary from critique.'],
  },
  {
    title: 'Podcast Episode Planner',
    description: 'Plan a podcast episode with narrative arc, guest questions, segments, and promotional clips.',
    category: 'Content',
    tags: ['Podcast', 'Content', 'Interview'],
    inputLabel: 'Episode topic and guest context',
    deliverables: ['episode thesis', 'segment plan', 'question list', 'clip ideas', 'show notes outline'],
    rules: ['Create a clear arc.', 'Ask open-ended questions.', 'Avoid repetitive prompts.'],
  },
  {
    title: 'Video Script Blueprint',
    description: 'Create a short-form or long-form video script with hook, beats, visuals, and CTA.',
    category: 'Content',
    tags: ['Video', 'Script', 'Creator'],
    inputLabel: 'Video topic and audience',
    deliverables: ['hook options', 'script beats', 'visual notes', 'retention devices', 'CTA'],
    rules: ['Put value early.', 'Use concrete examples.', 'Keep visuals feasible.'],
  },
  {
    title: 'Brand Voice Guide',
    description: 'Define a brand voice with principles, examples, vocabulary, do-not-say rules, and sample copy.',
    category: 'Brand',
    tags: ['Brand Voice', 'Copywriting', 'Style Guide'],
    inputLabel: 'Brand context and sample copy',
    deliverables: ['voice principles', 'tone spectrum', 'vocabulary', 'before-and-after examples', 'sample snippets'],
    rules: ['Base guidance on provided samples.', 'Avoid generic adjectives.', 'Make rules easy to apply.'],
  },
  {
    title: 'Pricing Page Review',
    description: 'Improve pricing-page clarity, packaging, plan differentiation, objections, and conversion flow.',
    category: 'Marketing',
    tags: ['Pricing', 'Conversion', 'SaaS'],
    inputLabel: 'Pricing page copy or plan details',
    deliverables: ['clarity issues', 'plan positioning', 'objection handling', 'CTA improvements', 'test ideas'],
    rules: ['Tie suggestions to buyer decisions.', 'Avoid deceptive urgency.', 'Make plan differences obvious.'],
  },
  {
    title: 'Onboarding Flow Audit',
    description: 'Review onboarding for activation, friction, empty states, guidance, and success moments.',
    category: 'Product',
    tags: ['Onboarding', 'Activation', 'UX'],
    inputLabel: 'Onboarding flow notes',
    deliverables: ['friction points', 'activation moments', 'empty-state improvements', 'measurement plan', 'priority fixes'],
    rules: ['Optimize for first value.', 'Do not add unnecessary steps.', 'Name measurable outcomes.'],
  },
  {
    title: 'Email Newsletter Draft',
    description: 'Write a useful newsletter with subject lines, opening, sections, links, and reader takeaway.',
    category: 'Content',
    tags: ['Newsletter', 'Email', 'Writing'],
    inputLabel: 'Topic notes and audience',
    deliverables: ['subject lines', 'opening', 'main sections', 'reader takeaway', 'CTA'],
    rules: ['Respect reader time.', 'Use scannable sections.', 'Make the CTA low-friction.'],
  },
  {
    title: 'Community Post Moderator',
    description: 'Rewrite community announcements to be clear, respectful, actionable, and policy-safe.',
    category: 'Community',
    tags: ['Community', 'Moderation', 'Announcement'],
    inputLabel: 'Community update or moderation context',
    deliverables: ['polished announcement', 'tone rationale', 'risk notes', 'FAQ follow-ups'],
    rules: ['Avoid inflammatory phrasing.', 'Make next steps clear.', 'Preserve important policy details.'],
  },
  {
    title: 'Learning Quiz Generator',
    description: 'Create quiz questions that test recall, application, misconceptions, and deeper understanding.',
    category: 'Education',
    tags: ['Quiz', 'Learning', 'Assessment'],
    inputLabel: 'Lesson content or topic',
    deliverables: ['multiple-choice questions', 'short-answer questions', 'answer key', 'misconception notes'],
    rules: ['Test understanding, not trivia.', 'Explain correct answers.', 'Vary difficulty.'],
  },
  {
    title: 'Course Module Planner',
    description: 'Plan a course module with outcomes, lesson flow, activities, assessment, and resources.',
    category: 'Education',
    tags: ['Course Design', 'Education', 'Curriculum'],
    inputLabel: 'Course topic and learner context',
    deliverables: ['learning outcomes', 'lesson sequence', 'activities', 'assessment', 'resource list'],
    rules: ['Use measurable outcomes.', 'Include active practice.', 'Match difficulty to learner level.'],
  },
  {
    title: 'Personal Productivity System',
    description: 'Design a lightweight productivity system around priorities, energy, calendar, and weekly review.',
    category: 'Productivity',
    tags: ['Productivity', 'Planning', 'Workflow'],
    inputLabel: 'Current workload and constraints',
    deliverables: ['priority rules', 'weekly review template', 'daily planning flow', 'automation ideas', 'failure recovery plan'],
    rules: ['Keep the system simple.', 'Respect stated constraints.', 'Prefer habits that can survive busy weeks.'],
  },
  {
    title: 'Decision Journal Template',
    description: 'Create a decision journal entry that captures context, options, confidence, assumptions, and review date.',
    category: 'Productivity',
    tags: ['Decision', 'Reflection', 'Learning'],
    inputLabel: 'Decision context',
    deliverables: ['decision statement', 'options', 'assumptions', 'confidence score', 'review criteria', 'review date'],
    rules: ['Make predictions explicit.', 'Separate emotion from evidence.', 'Define how the decision will be reviewed.'],
  },
  {
    title: 'Executive One-Pager',
    description: 'Compress a complex initiative into a one-page executive summary with ask, impact, and trade-offs.',
    category: 'Strategy',
    tags: ['Executive Summary', 'One-Pager', 'Strategy'],
    inputLabel: 'Initiative notes',
    deliverables: ['headline ask', 'context', 'expected impact', 'trade-offs', 'risks', 'decision needed'],
    rules: ['Lead with the ask.', 'Use concise bullets.', 'Make trade-offs visible.'],
  },
]

const supplementalEnglishPrompts: PublicPrompt[] = supplementalPromptSpecs.map((spec, index) => ({
  id: 900013 + index,
  title: spec.title,
  description: spec.description,
  content: `You are an expert operator helping with ${spec.category.toLowerCase()} work.

${spec.inputLabel}:
{{input}}

Create the following:
${spec.deliverables.map((item, itemIndex) => `${itemIndex + 1}. ${item}`).join('\n')}

Rules:
${spec.rules.map(rule => `- ${rule}`).join('\n')}`,
  author: 'Note Prompt',
  author_id: 0,
  category: spec.category,
  tags: spec.tags,
  views_count: 132 + index * 7,
  favorites_count: 18 + index * 3,
  is_featured: true,
  created_at: publishedAt,
  updated_at: publishedAt,
}))

export const englishFeaturedPrompts: PublicPrompt[] = [
  ...baseEnglishFeaturedPrompts,
  ...supplementalEnglishPrompts,
]
