import { PublicPrompt } from '@/types'

const publishedAt = '2026-05-25T00:00:00.000Z'

export const englishFeaturedPrompts: PublicPrompt[] = [
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
