// === 编辑模式相关类型 ===
export type EditMode = 'normal' | 'professional'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: string
  structure: {
    role?: string
    background?: string
    task: string
    format?: string
    examples?: string
    constraints?: string[]
  }
}

export interface NormalModeData {
  title: string
  objective: string
  context?: string
  style?: string
  tone?: string
  format?: string
  examples?: string
}

export interface ProfessionalModeData {
  title: string
  content: string
  role?: string
  background?: string
  task: string
  format?: string
  outputStyle?: string
  constraints?: string[]
  examples?: string[]
  variables?: Record<string, string>
}

export interface EditorSettings {
  mode: EditMode
  autoSave: boolean
  aiAssistance: boolean
  showTemplates: boolean
  showStructureGuide: boolean
}

// === 用户认证相关类型 ===
export interface User {
  id: number
  username: string
  email: string
  password_hash?: string // 前端通常不需要
  user_type: 'free' | 'pro' | 'admin'
  is_admin: boolean
  permissions: string[] // JSON数组格式
  avatar_url?: string
  is_active: boolean
  email_verified?: boolean // 邮箱是否已验证
  verification_code?: string // 验证码（前端通常不需要）
  verification_expires?: string // 验证码过期时间
  email_verify_sent_at?: string // 验证码发送时间
  created_at: string
  updated_at: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

// 邮箱验证相关类型
export interface SendVerificationRequest {
  email: string
}

export interface VerifyEmailRequest {
  email: string
  code: string
}

export interface AuthResponse {
  success: boolean
  message?: string
  code?: string
  data?: {
    user?: User | Partial<User>
    token?: string
    email_verified?: boolean
    email_sent?: boolean
    requireVerification?: boolean
  }
  error?: string
}

export interface UserProfile {
  id: number
  username: string
  email: string
  user_type: 'free' | 'pro' | 'admin'
  is_admin: boolean
  permissions: string[]
  avatar_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// === 收藏功能相关类型 ===
export interface Favorite {
  id: number
  user_id: number
  public_prompt_id: number
  created_at: string
}

// === 分类相关类型 ===
export interface Category {
  id: number
  name: string
  description?: string
  color: string
  icon?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// === 公共提示词相关类型 ===
export interface PublicPrompt {
  id: number
  title: string
  content: string
  description?: string
  author: string
  author_id: number
  category: string
  tags: string[]
  views_count: number
  favorites_count: number
  is_featured: boolean
  created_at: string
  updated_at: string
  is_favorited?: boolean
}

export interface PublicPromptCategory {
  id: number
  name: string
  description?: string
  prompt_count: number
}

// === 用户提示词统计 ===
export interface UserStats {
  total_prompts: number
  total_folders: number
  total_favorites: number
  monthly_usage: number
  ai_optimize_count: number
  max_prompts: number // 根据用户类型限制
}

// === API权限检查 ===
export interface PermissionCheck {
  can_create_prompt: boolean
  can_favorite: boolean
  can_use_ai_optimize: boolean
  remaining_ai_usage: number
}

// === 数据库类型 ===
export interface DbPrompt {
  id: number
  title: string
  content: string
  description?: string
  folder_id: number
  user_id: number
  category_id?: number
  tags: string
  is_public: boolean
  views_count: number
  created_at: string
  updated_at: string
}

export interface DbPublicPrompt extends DbPrompt {
  author: string
  author_id: number
  category: string
  is_featured: boolean
}

export interface DbFolder {
  id: number
  name: string
  parent_id: number | null
  user_id: number
  created_at: string
}

export interface DbUser {
  id: number
  username: string
  email: string
  password_hash: string
  avatar_url?: string
  user_type: 'free' | 'pro' | 'admin'
  is_active: boolean
  is_admin: boolean
  permissions: string
  created_at: string
  updated_at: string
}

export interface Prompt {
  id: number
  title: string
  content: string
  description?: string
  folder_id: number | null // 主要文件夹ID，支持null
  folder_ids?: number[] // 所有关联的文件夹ID
  folder_names?: string[] // 所有关联的文件夹名称
  user_id: number
  category_id?: number
  tags: Tag[]
  views_count: number
  created_at: string
  updated_at: string
  is_favorited?: boolean
}

export interface Folder {
  id: number
  name: string
  parent_id: number | null
  user_id: number
  created_at: string
  children?: Folder[]
  prompt_count?: number
}

export interface Tag {
  id: number
  name: string
  color?: string
  created_at?: string
}

// 创建/更新Prompt的请求数据
export interface CreatePromptData {
  title: string
  content: string
  description?: string
  folder_id?: number
  category_id?: number
  tags?: string[] // 标签名数组
}

export interface UpdatePromptData {
  title?: string
  content?: string
  description?: string
  folder_id?: number
  category_id?: number
  tags?: string[]
}

// 创建文件夹的请求数据
export interface CreateFolderData {
  name: string
  parent_id: number | null
}

// Prompt优化请求数据
export interface OptimizePromptData {
  original_prompt: string
}

export interface OptimizePromptResponse {
  optimized_prompt: string
}

// 查询参数
export interface PromptQueryParams {
  folder_id?: number
  category_id?: number
  tag_name?: string
  search?: string
  page?: number
  limit?: number
}

export interface PublicPromptQueryParams {
  category_id?: number
  search?: string
  tag?: string
  sort?: 'latest' | 'popular' | 'featured' | 'favorites'
  page?: number
  limit?: number
}

// API响应包装
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data?: {
    items: T[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
  error?: string
}

// === AI优化功能相关类型 ===

// 对话消息类型
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// AI优化API响应类型
export interface AIOptimizeResponse {
  success: boolean
  originalPrompt?: string
  optimizedPrompt: string
  conversationId?: string
  error?: string
}

// 多轮优化API响应类型
export interface AIMultiTurnOptimizeResponse {
  success: boolean
  optimizedPrompt: string
  conversationHistory: ConversationMessage[]
  round: number
  error?: string
}

// AI优化请求类型
export interface AIOptimizeRequest {
  originalPrompt: string
  targetDescription?: string
  userRequirement?: string
  backgroundInfo?: string
  writingStyle?: string
  tone?: string
  outputFormat?: string
  examples?: { input: string; output: string }[]
  tags?: string[]
  mode?: 'normal' | 'professional'
  aiOptimization?: boolean
  templateName?: string
  modelType?: string
  modelName?: string
  temperature?: number // 添加temperature字段
  optimizationMode?: 'optimize' | 'rewrite' // 新增：优化模式
}

// 多轮优化请求类型
export interface AIMultiTurnOptimizeRequest {
  originalPrompt: string
  currentPrompt: string
  userFeedback: string
  conversationHistory: ConversationMessage[]
  optimizationMode?: 'optimize' | 'rewrite' // 新增：优化模式
  modelType?: string
  modelName?: string
  temperature?: number
}

export interface PublicFolder {
  id: number
  name: string
  description: string
  user_id: number
  original_folder_id: number
  is_featured: boolean
  created_at: string
  updated_at: string
  author: string
  prompt_count: number
}

export interface ImportedFolder {
  id: number
  user_id: number
  public_folder_id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
  original_name: string
  original_description: string | null
  author: string
  original_created_at: string
  prompt_count?: number
}

// 导出数据类型
export interface ExportData {
  user: UserProfile
  exported_at: string
  prompts: Prompt[]
  favorites: PublicPrompt[]
  folders: Folder[]
  settings?: {
    profilePublic: boolean
    showEmail: boolean
    allowIndexing: boolean
    emailNotifications: boolean
    browserNotifications: boolean
    weeklyDigest: boolean
    darkMode: boolean
    compactView: boolean
    showTips: boolean
  }
}

// === 管理员相关类型 ===
export interface AdminPrompt {
  id: number
  title: string
  content: string
  description?: string
  author_id: number
  author: string
  category_id?: number
  category?: string
  is_featured: boolean
  tags?: string[]
  created_at: string
  updated_at: string
}

export interface AdminFolder {
  id: number
  name: string
  description: string
  user_id: number
  author: string
  original_folder_id: number
  is_featured: boolean
  prompt_count: number
  created_at: string
  updated_at: string
}

// 提示词版本历史
export interface PromptVersion {
  id: number
  prompt_id: number
  user_id: number
  title: string
  content: string
  version_number: number
  change_summary: string | null
  created_at: string
}
