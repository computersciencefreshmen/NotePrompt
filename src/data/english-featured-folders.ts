import { PublicFolder } from '@/types'
import { englishFeaturedPrompts } from './english-featured-prompts'

const publishedAt = '2026-05-25T00:00:00.000Z'

export type EnglishFeaturedFolder = PublicFolder & {
  promptIds: number[]
}

export const englishFeaturedFolders: EnglishFeaturedFolder[] = [
  {
    id: 910001,
    name: 'Strategy & Executive Workflows',
    description: 'Decision briefs, risk registers, and operator-ready templates for strategy reviews, planning, and leadership communication.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 7,
    promptIds: [900001, 900010, 900006, 900013, 900015, 900052, 900050],
  },
  {
    id: 910002,
    name: 'Product & UX Research Kit',
    description: 'Reusable prompts for PRDs, user interviews, product discovery, and research synthesis.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 8,
    promptIds: [900002, 900007, 900004, 900020, 900021, 900037, 900038, 900046],
  },
  {
    id: 910003,
    name: 'Marketing & Sales Launch Pack',
    description: 'Copywriting, landing page, and sales discovery prompts for turning raw positioning into market-ready messaging.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 8,
    promptIds: [900005, 900011, 900014, 900022, 900023, 900024, 900043, 900045],
  },
  {
    id: 910004,
    name: 'Engineering & Data Quality Bench',
    description: 'Code review, data analysis planning, and prompt evaluation templates for technical teams.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 9,
    promptIds: [900003, 900008, 900012, 900016, 900017, 900032, 900033, 900034, 900035],
  },
  {
    id: 910005,
    name: 'Learning & Enablement System',
    description: 'Curriculum and learning path prompts for training, onboarding, and capability building.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 5,
    promptIds: [900009, 900012, 900049, 900050, 900051],
  },
  {
    id: 910006,
    name: 'Growth & Analytics Lab',
    description: 'Experiment design, KPI trees, dashboards, pricing, and onboarding prompts for growth teams.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 6,
    promptIds: [900019, 900036, 900037, 900043, 900046, 900044],
  },
  {
    id: 910007,
    name: 'People & Customer Operations',
    description: 'Hiring, support, retention, customer communication, and community operations templates.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 7,
    promptIds: [900025, 900026, 900027, 900028, 900029, 900047, 900048],
  },
  {
    id: 910008,
    name: 'Security, Legal & Risk Desk',
    description: 'Threat modeling, privacy review, legal clause explanation, risk registers, and incident reviews.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 5,
    promptIds: [900010, 900031, 900032, 900039, 900030],
  },
  {
    id: 910009,
    name: 'Creator & Brand Studio',
    description: 'Content briefs, social posts, newsletters, video scripts, podcast plans, and brand voice guides.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 8,
    promptIds: [900022, 900023, 900040, 900041, 900042, 900044, 900045, 900047],
  },
  {
    id: 910010,
    name: 'Documentation & Knowledge Base',
    description: 'API docs, SOPs, ADRs, proposals, literature reviews, and learning assets for reusable knowledge.',
    user_id: 0,
    original_folder_id: 0,
    is_featured: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    author: 'Note Prompt',
    prompt_count: 8,
    promptIds: [900017, 900030, 900033, 900035, 900040, 900041, 900049, 900051],
  },
]

export function findEnglishFeaturedFolder(id: number) {
  return englishFeaturedFolders.find(folder => folder.id === id) || null
}

export function getEnglishFeaturedFolderPrompts(id: number) {
  const folder = findEnglishFeaturedFolder(id)
  if (!folder) return null
  return folder.promptIds
    .map(promptId => englishFeaturedPrompts.find(prompt => prompt.id === promptId))
    .filter(Boolean)
}