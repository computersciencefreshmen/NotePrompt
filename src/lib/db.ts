import fs from 'fs/promises'
import path from 'path'
import bcrypt from 'bcryptjs'

const DB_DIR = path.join(process.cwd(), 'data')

// 确保数据目录存在
async function ensureDataDir() {
  try {
    await fs.access(DB_DIR)
  } catch {
    await fs.mkdir(DB_DIR, { recursive: true })
  }
}

// 读取JSON文件
async function readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
  await ensureDataDir()
  const filePath = path.join(DB_DIR, filename)

  try {
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return defaultValue
  }
}

// 写入JSON文件
async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  await ensureDataDir()
  const filePath = path.join(DB_DIR, filename)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

// 数据类型定义
export interface DBUser {
  id: number
  username: string
  email: string
  password_hash: string
  user_type: 'free' | 'pro'
  avatar_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DBPrompt {
  id: number
  title: string
  content: string
  description?: string
  user_id: number
  folder_id: number
  category_id?: number
  tags: string[]
  is_public: boolean
  likes_count: number
  views_count: number
  created_at: string
  updated_at: string
}

export interface DBFolder {
  id: number
  name: string
  user_id: number
  parent_id: number | null
  created_at: string
}

export interface DBFavorite {
  id: number
  user_id: number
  prompt_id: number
  created_at: string
}

export interface DBLike {
  id: number
  user_id: number
  prompt_id: number
  created_at: string
}

export interface DBCategory {
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

export interface DBUserStats {
  id: number
  user_id: number
  ai_optimize_count: number
  monthly_usage: number
  last_reset_date: string
  created_at: string
  updated_at: string
}

export interface DBPublicPrompt {
  id: number
  title: string
  content: string
  description?: string
  author: string
  author_id: number
  category: string
  tags: string[]
  likes_count: number
  views_count: number
  is_featured: boolean
  created_at: string
  updated_at: string
}

// 数据库操作类
export class SimpleDB {
  private static async getNextId(collection: string): Promise<number> {
    const counters = await readJsonFile<Record<string, number>>('counters.json', {})
    const nextId = (counters[collection] || 0) + 1
    counters[collection] = nextId
    await writeJsonFile('counters.json', counters)
    return nextId
  }

  // 用户操作
  static async createUser(data: Omit<DBUser, 'id' | 'created_at' | 'updated_at'>): Promise<DBUser> {
    const users = await readJsonFile<DBUser[]>('users.json', [])
    const id = await this.getNextId('users')
    const now = new Date().toISOString()

    const user: DBUser = {
      ...data,
      id,
      is_active: true,
      created_at: now,
      updated_at: now
    }

    users.push(user)
    await writeJsonFile('users.json', users)

    // 为新用户创建使用统计记录
    await this.createUserStats(id)

    // 为新用户创建默认文件夹
    await this.createFolder({
      name: '默认文件夹',
      user_id: id,
      parent_id: null
    })

    return user
  }

  static async findUserByUsername(username: string): Promise<DBUser | null> {
    const users = await readJsonFile<DBUser[]>('users.json', [])
    return users.find(u => u.username === username) || null
  }

  static async findUserByEmail(email: string): Promise<DBUser | null> {
    const users = await readJsonFile<DBUser[]>('users.json', [])
    return users.find(u => u.email === email) || null
  }

  static async findUserById(id: number): Promise<DBUser | null> {
    const users = await readJsonFile<DBUser[]>('users.json', [])
    return users.find(u => u.id === id) || null
  }

  static async updateUser(id: number, data: Partial<Omit<DBUser, 'id' | 'created_at'>>): Promise<DBUser | null> {
    const users = await readJsonFile<DBUser[]>('users.json', [])
    const index = users.findIndex(u => u.id === id)

    if (index === -1) return null

    users[index] = {
      ...users[index],
      ...data,
      updated_at: new Date().toISOString()
    }

    await writeJsonFile('users.json', users)
    return users[index]
  }

  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword)
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10)
  }

  // 分类操作
  static async getCategories(): Promise<DBCategory[]> {
    return readJsonFile<DBCategory[]>('categories.json', [])
  }

  static async createCategory(data: Omit<DBCategory, 'id' | 'created_at' | 'updated_at'>): Promise<DBCategory> {
    const categories = await readJsonFile<DBCategory[]>('categories.json', [])
    const id = await this.getNextId('categories')
    const now = new Date().toISOString()

    const category: DBCategory = {
      ...data,
      id,
      created_at: now,
      updated_at: now
    }

    categories.push(category)
    await writeJsonFile('categories.json', categories)
    return category
  }

  // 提示词操作
  static async createPrompt(data: Omit<DBPrompt, 'id' | 'created_at' | 'updated_at'>): Promise<DBPrompt> {
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    const id = await this.getNextId('prompts')
    const now = new Date().toISOString()

    const prompt: DBPrompt = {
      ...data,
      id,
      likes_count: 0,
      views_count: 0,
      created_at: now,
      updated_at: now
    }

    prompts.push(prompt)
    await writeJsonFile('prompts.json', prompts)
    return prompt
  }

  static async findPromptsByUserId(userId: number, params?: {
    folder_id?: number
    category_id?: number
    search?: string
    page?: number
    limit?: number
  }): Promise<{ items: DBPrompt[], total: number }> {
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    let filteredPrompts = prompts.filter(p => p.user_id === userId)

    // 应用筛选条件
    if (params?.folder_id) {
      filteredPrompts = filteredPrompts.filter(p => p.folder_id === params.folder_id)
    }

    if (params?.category_id) {
      filteredPrompts = filteredPrompts.filter(p => p.category_id === params.category_id)
    }

    if (params?.search) {
      const searchLower = params.search.toLowerCase()
      filteredPrompts = filteredPrompts.filter(p =>
        p.title.toLowerCase().includes(searchLower) ||
        p.content.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      )
    }

    const total = filteredPrompts.length

    // 排序：最新创建的在前
    filteredPrompts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // 分页
    const page = params?.page || 1
    const limit = params?.limit || 12
    const startIndex = (page - 1) * limit
    const items = filteredPrompts.slice(startIndex, startIndex + limit)

    return { items, total }
  }

  static async findPromptById(id: number): Promise<DBPrompt | null> {
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    return prompts.find(p => p.id === id) || null
  }

  static async updatePrompt(id: number, data: Partial<Omit<DBPrompt, 'id' | 'created_at'>>): Promise<DBPrompt | null> {
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    const index = prompts.findIndex(p => p.id === id)

    if (index === -1) return null

    prompts[index] = {
      ...prompts[index],
      ...data,
      updated_at: new Date().toISOString()
    }

    await writeJsonFile('prompts.json', prompts)
    return prompts[index]
  }

  static async deletePrompt(id: number): Promise<boolean> {
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    const index = prompts.findIndex(p => p.id === id)

    if (index === -1) return false

    prompts.splice(index, 1)
    await writeJsonFile('prompts.json', prompts)

    // 同时删除相关的收藏和点赞
    await this.deleteFavoritesByPromptId(id)
    await this.deleteLikesByPromptId(id)

    return true
  }

  // 增加浏览量
  static async incrementViews(promptId: number): Promise<void> {
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    const index = prompts.findIndex(p => p.id === promptId)

    if (index !== -1) {
      prompts[index].views_count += 1
      await writeJsonFile('prompts.json', prompts)
    }
  }

  // 文件夹操作
  static async createFolder(data: Omit<DBFolder, 'id' | 'created_at'>): Promise<DBFolder> {
    const folders = await readJsonFile<DBFolder[]>('folders.json', [])
    const id = await this.getNextId('folders')

    const folder: DBFolder = {
      ...data,
      id,
      created_at: new Date().toISOString()
    }

    folders.push(folder)
    await writeJsonFile('folders.json', folders)
    return folder
  }

  static async findFoldersByUserId(userId: number): Promise<DBFolder[]> {
    const folders = await readJsonFile<DBFolder[]>('folders.json', [])
    return folders.filter(f => f.user_id === userId)
  }

  // 点赞操作
  static async createLike(userId: number, promptId: number): Promise<DBLike | null> {
    const likes = await readJsonFile<DBLike[]>('likes.json', [])

    // 检查是否已经点赞
    const existingLike = likes.find(l => l.user_id === userId && l.prompt_id === promptId)
    if (existingLike) return null

    const id = await this.getNextId('likes')
    const like: DBLike = {
      id,
      user_id: userId,
      prompt_id: promptId,
      created_at: new Date().toISOString()
    }

    likes.push(like)
    await writeJsonFile('likes.json', likes)

    // 更新提示词的点赞数
    await this.updatePromptLikesCount(promptId)

    return like
  }

  static async deleteLike(userId: number, promptId: number): Promise<boolean> {
    const likes = await readJsonFile<DBLike[]>('likes.json', [])
    const index = likes.findIndex(l => l.user_id === userId && l.prompt_id === promptId)

    if (index === -1) return false

    likes.splice(index, 1)
    await writeJsonFile('likes.json', likes)

    // 更新提示词的点赞数
    await this.updatePromptLikesCount(promptId)

    return true
  }

  static async isLikedByUser(userId: number, promptId: number): Promise<boolean> {
    const likes = await readJsonFile<DBLike[]>('likes.json', [])
    return likes.some(l => l.user_id === userId && l.prompt_id === promptId)
  }

  private static async updatePromptLikesCount(promptId: number): Promise<void> {
    const likes = await readJsonFile<DBLike[]>('likes.json', [])
    const likesCount = likes.filter(l => l.prompt_id === promptId).length

    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    const index = prompts.findIndex(p => p.id === promptId)

    if (index !== -1) {
      prompts[index].likes_count = likesCount
      await writeJsonFile('prompts.json', prompts)
    }
  }

  private static async deleteLikesByPromptId(promptId: number): Promise<void> {
    const likes = await readJsonFile<DBLike[]>('likes.json', [])
    const filteredLikes = likes.filter(l => l.prompt_id !== promptId)
    await writeJsonFile('likes.json', filteredLikes)
  }

  // 收藏操作
  static async createFavorite(userId: number, promptId: number): Promise<DBFavorite | null> {
    const favorites = await readJsonFile<DBFavorite[]>('favorites.json', [])

    // 检查是否已经收藏
    const existingFavorite = favorites.find(f => f.user_id === userId && f.prompt_id === promptId)
    if (existingFavorite) return null

    const id = await this.getNextId('favorites')
    const favorite: DBFavorite = {
      id,
      user_id: userId,
      prompt_id: promptId,
      created_at: new Date().toISOString()
    }

    favorites.push(favorite)
    await writeJsonFile('favorites.json', favorites)
    return favorite
  }

  static async findFavoritesByUserId(userId: number): Promise<DBFavorite[]> {
    const favorites = await readJsonFile<DBFavorite[]>('favorites.json', [])
    return favorites.filter(f => f.user_id === userId)
  }

  static async deleteFavorite(userId: number, promptId: number): Promise<boolean> {
    const favorites = await readJsonFile<DBFavorite[]>('favorites.json', [])
    const index = favorites.findIndex(f => f.user_id === userId && f.prompt_id === promptId)

    if (index === -1) return false

    favorites.splice(index, 1)
    await writeJsonFile('favorites.json', favorites)
    return true
  }

  static async isFavoritedByUser(userId: number, promptId: number): Promise<boolean> {
    const favorites = await readJsonFile<DBFavorite[]>('favorites.json', [])
    return favorites.some(f => f.user_id === userId && f.prompt_id === promptId)
  }

  private static async deleteFavoritesByPromptId(promptId: number): Promise<void> {
    const favorites = await readJsonFile<DBFavorite[]>('favorites.json', [])
    const filteredFavorites = favorites.filter(f => f.prompt_id !== promptId)
    await writeJsonFile('favorites.json', filteredFavorites)
  }

  // 用户统计操作
  static async createUserStats(userId: number): Promise<DBUserStats> {
    const stats = await readJsonFile<DBUserStats[]>('user_stats.json', [])
    const id = await this.getNextId('user_stats')
    const now = new Date().toISOString()

    const userStats: DBUserStats = {
      id,
      user_id: userId,
      ai_optimize_count: 0,
      monthly_usage: 0,
      last_reset_date: new Date().toISOString().split('T')[0],
      created_at: now,
      updated_at: now
    }

    stats.push(userStats)
    await writeJsonFile('user_stats.json', stats)
    return userStats
  }

  static async getUserStats(userId: number): Promise<DBUserStats | null> {
    const stats = await readJsonFile<DBUserStats[]>('user_stats.json', [])
    return stats.find(s => s.user_id === userId) || null
  }

  static async incrementAIUsage(userId: number): Promise<void> {
    const stats = await readJsonFile<DBUserStats[]>('user_stats.json', [])
    const index = stats.findIndex(s => s.user_id === userId)

    if (index !== -1) {
      stats[index].ai_optimize_count += 1
      stats[index].monthly_usage += 1
      stats[index].updated_at = new Date().toISOString()
      await writeJsonFile('user_stats.json', stats)
    }
  }

  // 公共提示词（示例数据）
  static async getPublicPrompts(params?: {
    category_id?: number
    search?: string
    sort?: 'latest' | 'popular' | 'featured'
    page?: number
    limit?: number
  }): Promise<{ items: DBPublicPrompt[], total: number }> {
    // 获取公开的用户提示词作为公共提示词
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    const users = await readJsonFile<DBUser[]>('users.json', [])

    let publicPrompts = prompts.filter(p => p.is_public)

    // 转换为公共提示词格式
    const publicPromptsData: DBPublicPrompt[] = publicPrompts.map(p => {
      const author = users.find(u => u.id === p.user_id)
      return {
        id: p.id,
        title: p.title,
        content: p.content,
        description: p.description,
        author: author?.username || '未知用户',
        author_id: p.user_id,
        category: p.category_id?.toString() || 'other',
        tags: p.tags,
        likes_count: p.likes_count,
        views_count: p.views_count,
        is_featured: p.likes_count > 50, // 点赞数超过50的标记为精选
        created_at: p.created_at,
        updated_at: p.updated_at
      }
    })

    let filteredPrompts = [...publicPromptsData]

    // 应用筛选
    if (params?.category_id && params.category_id > 0) {
      filteredPrompts = filteredPrompts.filter(p => p.category === params.category_id?.toString())
    }

    if (params?.search) {
      const searchLower = params.search.toLowerCase()
      filteredPrompts = filteredPrompts.filter(p =>
        p.title.toLowerCase().includes(searchLower) ||
        p.content.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      )
    }

    // 排序
    if (params?.sort === 'popular') {
      filteredPrompts.sort((a, b) => b.likes_count - a.likes_count)
    } else if (params?.sort === 'featured') {
      filteredPrompts.sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
    } else {
      // 默认按最新排序
      filteredPrompts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    const total = filteredPrompts.length

    // 分页
    const page = params?.page || 1
    const limit = params?.limit || 12
    const startIndex = (page - 1) * limit
    const items = filteredPrompts.slice(startIndex, startIndex + limit)

    return { items, total }
  }

  // 初始化默认数据
  static async initializeDefaultData(): Promise<void> {
    // 初始化默认分类
    const categories = await readJsonFile<DBCategory[]>('categories.json', [])
    if (categories.length === 0) {
      const defaultCategories: Omit<DBCategory, 'id' | 'created_at' | 'updated_at'>[] = [
        { name: '写作助手', description: '各类文案、文章、创意写作相关的提示词', color: 'blue', icon: 'pen', sort_order: 1, is_active: true },
        { name: '编程开发', description: '代码生成、调试、架构设计等编程相关', color: 'green', icon: 'code', sort_order: 2, is_active: true },
        { name: '教育学习', description: '学习计划、知识总结、教学辅助工具', color: 'purple', icon: 'book', sort_order: 3, is_active: true },
        { name: '商业营销', description: '营销策划、商业分析、客服支持等', color: 'orange', icon: 'briefcase', sort_order: 4, is_active: true },
        { name: '创意设计', description: '设计理念、创意思维、艺术创作辅助', color: 'pink', icon: 'palette', sort_order: 5, is_active: true },
        { name: '数据分析', description: '数据处理、统计分析、报告生成', color: 'cyan', icon: 'chart', sort_order: 6, is_active: true },
        { name: '生活助手', description: '日常生活、健康建议、旅行规划等', color: 'yellow', icon: 'home', sort_order: 7, is_active: true },
        { name: '其他', description: '未分类或其他类型的提示词', color: 'gray', icon: 'more', sort_order: 99, is_active: true }
      ]

      for (const category of defaultCategories) {
        await this.createCategory(category)
      }
    }

    // 确保有默认的管理员用户
    const adminUser = await this.findUserByUsername('admin')
    if (!adminUser) {
      const hashedPassword = await this.hashPassword('admin123')
      await this.createUser({
        username: 'admin',
        email: 'admin@noteprompt.com',
        password_hash: hashedPassword,
        user_type: 'pro',
        is_active: true
      })
    }

    // 创建示例用户
    const users = await readJsonFile<DBUser[]>('users.json', [])
    if (users.length === 0) {
      // 创建示例用户
      const sampleUsers = [
        { username: 'demo_user', email: 'demo@example.com', user_type: 'free' as const },
        { username: 'content_creator', email: 'creator@example.com', user_type: 'pro' as const },
        { username: 'developer', email: 'dev@example.com', user_type: 'free' as const }
      ]

      for (const userData of sampleUsers) {
        const hashedPassword = await this.hashPassword('demo123')
        await this.createUser({
          ...userData,
          password_hash: hashedPassword,
          is_active: true
        })
      }
    }

    // 为每个用户创建默认文件夹
    const allUsers = await readJsonFile<DBUser[]>('users.json', [])
    const folders = await readJsonFile<DBFolder[]>('folders.json', [])

    for (const user of allUsers) {
      const userFolders = folders.filter(f => f.user_id === user.id)
      if (userFolders.length === 0) {
        await this.createFolder({
          name: '默认文件夹',
          user_id: user.id,
          parent_id: null
        })
      }

      // 确保用户有统计记录
      const userStats = await this.getUserStats(user.id)
      if (!userStats) {
        await this.createUserStats(user.id)
      }
    }

    // 添加高质量示例提示词
    const prompts = await readJsonFile<DBPrompt[]>('prompts.json', [])
    if (prompts.length === 0) {
      const samplePrompts = [
        {
          title: '专业文案写作助手',
          content: '你是一位经验丰富的文案写作专家，擅长创作各种类型的营销文案、产品描述和广告语。\n\n请根据以下要求创作文案：\n- 产品/服务：[请描述产品或服务]\n- 目标受众：[请描述目标客户群体]\n- 文案用途：[请说明用途，如网站首页、广告、邮件等]\n- 风格要求：[请描述期望的风格，如专业、亲和、幽默等]\n\n创作要求：\n1. 语言简洁有力，突出核心卖点\n2. 符合目标受众的语言习惯\n3. 具有强烈的行动召唤\n4. 富有创意且易于记忆\n\n请提供3个不同风格的版本供选择。',
          description: '专业的文案写作助手，帮你创作高质量的营销文案，适用于各种商业场景',
          user_id: 3,
          folder_id: 1,
          category_id: 1,
          tags: ['文案写作', '营销策划', 'AI提示词'],
          is_public: true,
          likes_count: 156,
          views_count: 2340
        },
        {
          title: '代码审查专家',
          content: '你是一位经验丰富的高级软件工程师，专门负责代码审查工作。请对用户提供的代码进行全面分析。\n\n分析维度：\n🔍 **代码质量评估**\n- 可读性：变量命名、注释质量、代码结构\n- 可维护性：模块化程度、代码复用性\n- 性能：算法效率、资源使用\n\n⚡ **最佳实践检查**\n- 编程规范：代码风格、命名约定\n- 设计模式：是否正确使用设计模式\n- 架构原则：SOLID原则、DRY原则等\n\n🛡️ **安全性审查**\n- 输入验证：SQL注入、XSS等漏洞\n- 权限控制：访问控制、数据保护\n- 依赖安全：第三方库安全性\n\n📝 **改进建议**\n- 具体的修改建议\n- 推荐的重构方案\n- 性能优化建议\n\n请提供详细的审查报告和改进建议。',
          description: '专业的代码审查工具，提供详细的代码质量分析和改进建议',
          user_id: 4,
          folder_id: 1,
          category_id: 2,
          tags: ['代码审查', '技术开发', '项目管理'],
          is_public: true,
          likes_count: 203,
          views_count: 3100
        },
        {
          title: '个性化学习计划制定师',
          content: '你是一位专业的学习规划师，擅长为不同背景的学习者制定科学有效的学习计划。\n\n请根据以下信息制定学习计划：\n📚 **学习目标**：[请描述你的学习目标]\n⏰ **可用时间**：[请说明每天/每周的学习时间]\n📖 **基础水平**：[请描述当前的基础水平]\n🎯 **期望成果**：[请说明期望达到的效果]\n\n学习计划将包含：\n1. **目标分解**：将大目标拆分为可执行的小目标\n2. **时间安排**：合理分配学习时间和进度\n3. **学习方法**：推荐适合的学习策略和技巧\n4. **资源推荐**：书籍、课程、工具等学习资源\n5. **进度检查**：设置里程碑和自我评估方法\n6. **激励机制**：保持学习动力的方法\n\n请提供详细的学习计划方案。',
          description: '个性化学习计划制定，帮你高效达成学习目标，适用于各种技能学习',
          user_id: 2,
          folder_id: 1,
          category_id: 3,
          tags: ['学习计划', '教育培训', '工作效率'],
          is_public: true,
          likes_count: 134,
          views_count: 2890
        },
        {
          title: 'SWOT分析专家',
          content: '你是一位资深的商业战略分析师，擅长通过SWOT分析帮助企业制定战略决策。\n\n请对以下企业/项目进行SWOT分析：\n🏢 **企业/项目**：[请描述企业或项目基本情况]\n🎯 **分析目的**：[请说明分析的具体目的]\n📊 **背景信息**：[请提供相关背景信息]\n\n分析框架：\n💪 **优势（Strengths）**\n- 内部优势资源\n- 核心竞争力\n- 独特价值主张\n\n⚠️ **劣势（Weaknesses）**\n- 内部限制因素\n- 能力短板\n- 需要改进的方面\n\n🚀 **机会（Opportunities）**\n- 市场机会\n- 行业趋势\n- 外部有利因素\n\n⚡ **威胁（Threats）**\n- 市场威胁\n- 竞争压力\n- 外部风险因素\n\n📋 **战略建议**\n基于SWOT分析结果，提供具体的战略建议和行动计划。',
          description: '专业的SWOT分析工具，帮助企业和个人进行战略分析和决策',
          user_id: 3,
          folder_id: 1,
          category_id: 4,
          tags: ['商业分析', '项目管理', '品牌策略'],
          is_public: true,
          likes_count: 78,
          views_count: 1670
        },
        {
          title: '品牌视觉设计简报助手',
          content: '你是一位资深品牌视觉总监，请基于以下信息输出可直接执行的视觉设计简报。\n\n输入信息：\n- 品牌名称与行业：[填写]\n- 核心受众：[填写]\n- 品牌关键词（3-5个）：[填写]\n- 投放场景（网页/海报/社媒等）：[填写]\n- 竞品参考（可选）：[填写]\n\n请按以下结构输出：\n1. 视觉定位：品牌气质、情绪关键词、差异化方向\n2. 色彩系统：主色/辅色/强调色（给出HEX）与使用建议\n3. 字体系统：标题/正文字体建议与层级规范\n4. 构图规则：版式网格、留白、信息优先级\n5. 素材风格：插画/摄影/图标统一规范\n6. 交付清单：设计文件与尺寸规格建议\n\n要求：可执行、可落地、避免空泛描述。',
          description: '生成可执行的品牌视觉设计简报，适用于海报、落地页和社媒视觉项目',
          user_id: 2,
          folder_id: 1,
          category_id: 5,
          tags: ['品牌设计', '视觉规范', '创意设计'],
          is_public: true,
          likes_count: 96,
          views_count: 1940
        },
        {
          title: '业务数据周报分析助手',
          content: '你是一位数据分析顾问。请根据我提供的周度数据，输出一份面向业务负责人可直接阅读的分析周报。\n\n输入信息：\n- 业务线名称：[填写]\n- 本周核心指标（含本周值、上周值、目标值）：[填写]\n- 关键事件/活动：[填写]\n- 风险信号（可选）：[填写]\n\n输出结构：\n1. 结论摘要（3-5条）：先给结论，突出变化最大的指标\n2. 指标拆解：按增长、下滑、持平分类分析原因\n3. 归因分析：区分内部因素与外部因素\n4. 下周建议：给出3条可执行动作（含优先级与预期影响）\n5. 风险预警：列出可能影响目标达成的风险与应对方案\n\n要求：逻辑清晰、量化表达、避免仅复述数据。',
          description: '自动生成结构化业务数据周报，帮助团队快速发现增长机会与风险',
          user_id: 4,
          folder_id: 1,
          category_id: 6,
          tags: ['数据分析', '周报', '经营复盘'],
          is_public: true,
          likes_count: 121,
          views_count: 2260
        },
        {
          title: '7天健康饮食计划生成器',
          content: '你是一位营养与健康生活顾问，请基于我的情况制定一个可执行的7天饮食计划。\n\n我的信息：\n- 目标（减脂/增肌/维持健康）：[填写]\n- 年龄与性别：[填写]\n- 身高体重：[填写]\n- 饮食限制（过敏/忌口/素食等）：[填写]\n- 可接受预算与烹饪时间：[填写]\n\n请输出：\n1. 每日三餐建议（含食材与大致分量）\n2. 每日加餐与饮水建议\n3. 一周采购清单（按食材类别汇总）\n4. 计划执行提示（备餐、替代食材、外食建议）\n5. 注意事项（不替代医疗建议）\n\n要求：简单实用、食材易获取、可坚持。',
          description: '根据个人目标与饮食限制生成7天健康饮食计划，便于日常执行',
          user_id: 3,
          folder_id: 1,
          category_id: 7,
          tags: ['健康生活', '饮食计划', '生活助手'],
          is_public: true,
          likes_count: 88,
          views_count: 1730
        }
      ]

      for (const promptData of samplePrompts) {
        await this.createPrompt(promptData)
      }

      // 添加一些点赞和收藏数据
      const likes = [
        { user_id: 2, prompt_id: 1 },
        { user_id: 3, prompt_id: 1 },
        { user_id: 4, prompt_id: 1 },
        { user_id: 1, prompt_id: 2 },
        { user_id: 2, prompt_id: 2 },
        { user_id: 3, prompt_id: 3 },
        { user_id: 4, prompt_id: 3 },
        { user_id: 1, prompt_id: 4 },
        { user_id: 2, prompt_id: 4 }
      ]

      for (const like of likes) {
        await this.createLike(like.user_id, like.prompt_id)
      }

      const favorites = [
        { user_id: 2, prompt_id: 1 },
        { user_id: 3, prompt_id: 1 },
        { user_id: 1, prompt_id: 2 },
        { user_id: 4, prompt_id: 2 },
        { user_id: 2, prompt_id: 3 },
        { user_id: 1, prompt_id: 4 }
      ]

      for (const favorite of favorites) {
        await this.createFavorite(favorite.user_id, favorite.prompt_id)
      }
    }
  }
}

export const db = new SimpleDB()
