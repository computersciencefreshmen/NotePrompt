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
    prompt_count: 3,
    promptIds: [900001, 900010, 900006],
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
    prompt_count: 3,
    promptIds: [900002, 900007, 900004],
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
    prompt_count: 2,
    promptIds: [900005, 900011],
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
    prompt_count: 3,
    promptIds: [900003, 900008, 900012],
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
    prompt_count: 2,
    promptIds: [900009, 900012],
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