
import mysql from 'mysql2/promise';

type DbRow = Record<string, unknown>;

class MySQLDB {
  private pool: mysql.Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'root',
      database: process.env.MYSQL_DATABASE || 'agent_report',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+08:00',
      // 移除无效的配置参数
      multipleStatements: false,
    });
  }

  async query(sql: string, params?: unknown[]) {
    let connection;
    let retries = 3;
    
    while (retries > 0) {
      try {
        connection = await this.pool.getConnection();
        
        // 简化参数处理
        const cleanParams = params ? params.map(p => {
          if (p === undefined || p === null) return null;
          return p;
        }) : [];
        
        const [rows, fields] = await connection.execute(sql, cleanParams);
        return { rows, fields };
      } catch (error) {
        console.error(`数据库查询错误 (重试 ${4-retries}/3):`, error);
        retries--;
        
        if (retries === 0) {
          throw error;
        }
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }
    
    throw new Error('数据库查询失败，已重试3次');
  }

  // 直接执行SQL，不使用预处理语句
  async queryRaw(sql: string) {
    let connection;
    let retries = 3;
    
    while (retries > 0) {
      try {
        connection = await this.pool.getConnection();
        
        const [rows, fields] = await connection.query(sql);
        return { rows, fields };
      } catch (error) {
        console.error(`数据库原始查询错误 (重试 ${4-retries}/3):`, error);
        retries--;
        
        if (retries === 0) {
          throw error;
        }
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }
    
    throw new Error('数据库原始查询失败，已重试3次');
  }

  async end() {
    await this.pool.end();
  }

  // 用户相关方法
  async getUserByEmail(email: string) {
    const result = await this.query('SELECT * FROM users WHERE email = ?', [email]);
    return (result.rows as DbRow[])[0];
  }

  async getUserByUsername(username: string) {
    const result = await this.query('SELECT * FROM users WHERE username = ?', [username]);
    return (result.rows as DbRow[])[0];
  }

  async getUserById(id: number) {
    const result = await this.query('SELECT * FROM users WHERE id = ?', [id]);
    const user = (result.rows as DbRow[])[0];
    return user;
  }

  async createUser(userData: { 
    username: string; 
    email: string; 
    password_hash: string; 
    user_type?: string;
    is_admin?: boolean;
    permissions?: string;
    avatar_url?: string;
    is_active?: boolean;
  }) {
    const { 
      username, 
      email, 
      password_hash, 
      user_type = 'free',
      is_admin = false,
      permissions = JSON.stringify(["create_prompt", "favorite_prompt"]),
      avatar_url,
      is_active = true
    } = userData;
    
    const result = await this.query(
      `INSERT INTO users (username, email, password_hash, user_type, is_admin, permissions, avatar_url, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, email, password_hash, user_type, is_admin, permissions, avatar_url, is_active]
    );

    // 正确获取插入ID
    const insertId = (result.rows as any).insertId;
    if (!insertId) {
      throw new Error('用户创建失败：无法获取插入ID');
    }
    
    const newUser = await this.getUserById(insertId);
    if (!newUser) {
      throw new Error('用户创建失败：无法获取新创建的用户');
    }
    
    return newUser;
  }

  // 用户私有提示词相关方法
  async createUserPrompt(promptData: {
    title: string;
    content: string;
    description?: string | null;
    user_id: number;
    folder_id?: number | null;
    category_id?: number | null;
    mode?: string;
    is_public?: boolean;
  }) {
    const { title, content, description, user_id, folder_id, category_id, mode = 'normal', is_public = false } = promptData;
    const result = await this.query(
      'INSERT INTO user_prompts (title, content, description, user_id, folder_id, category_id, mode, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, content, description, user_id, folder_id, category_id, mode, is_public ? 1 : 0]
    );

    const insertId = (result.rows as any)[0]?.insertId;
    const newPrompt = await this.getUserPromptById(insertId);
    return newPrompt;
  }

  async getUserPromptById(id: number) {
    const result = await this.query(
      'SELECT up.*, u.username, u.avatar_url FROM user_prompts up JOIN users u ON up.user_id = u.id WHERE up.id = ?',
      [id]
    );
    return (result.rows as DbRow[])[0];
  }

  async getUserPromptsByUserId(userId: number, folderId?: number) {
    let query = '';
    const params: (string | number)[] = [];

    if (folderId !== undefined) {
      // 通过关联表查询特定文件夹的提示词（支持多文件夹共享）
      query = `
        SELECT DISTINCT up.*, u.username, u.avatar_url,
               GROUP_CONCAT(DISTINCT upf2.folder_id) as folder_ids,
               GROUP_CONCAT(DISTINCT f2.name) as folder_names
        FROM user_prompts up 
        JOIN users u ON up.user_id = u.id 
        JOIN user_prompt_folders upf ON up.id = upf.user_prompt_id 
        LEFT JOIN user_prompt_folders upf2 ON up.id = upf2.user_prompt_id
        LEFT JOIN folders f2 ON upf2.folder_id = f2.id
        WHERE up.user_id = ? AND upf.folder_id = ?
        GROUP BY up.id, up.title, up.content, up.description, up.user_id, up.category_id, up.created_at, up.updated_at, u.username, u.avatar_url
        ORDER BY up.created_at DESC
      `;
      params.push(userId, folderId);
    } else {
      // 查询用户的所有提示词（包含所有文件夹信息）
      query = `
        SELECT up.*, u.username, u.avatar_url,
               GROUP_CONCAT(DISTINCT upf.folder_id) as folder_ids,
               GROUP_CONCAT(DISTINCT f.name) as folder_names
        FROM user_prompts up 
        JOIN users u ON up.user_id = u.id 
        LEFT JOIN user_prompt_folders upf ON up.id = upf.user_prompt_id 
        LEFT JOIN folders f ON upf.folder_id = f.id
        WHERE up.user_id = ?
        GROUP BY up.id, up.title, up.content, up.description, up.user_id, up.category_id, up.created_at, up.updated_at, u.username, u.avatar_url
        ORDER BY up.created_at DESC
      `;
      params.push(userId);
    }

    const result = await this.query(query, params);
    return result.rows as DbRow[];
  }

  async updateUserPrompt(id: number, updates: Partial<{
    title: string;
    content: string;
    description: string;
    folder_id: number | null;
    category_id: number | null;
    is_public: boolean;
  }>) {
    const updateFields = Object.keys(updates)
      .filter(key => updates[key as keyof typeof updates] !== undefined)
      .map(key => `${key} = ?`);
    
    const updateValues = Object.values(updates).filter(value => value !== undefined);
    updateValues.push(id);

    const query = `UPDATE user_prompts SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await this.query(query, updateValues);

    return await this.getUserPromptById(id);
  }

  async deleteUserPrompt(id: number) {
    await this.query('DELETE FROM user_prompts WHERE id = ?', [id]);
    return true;
  }

  // 公共提示词相关方法
  async createPublicPrompt(promptData: {
    title: string;
    content: string;
    description?: string | null;
    author_id: number;
    category_id?: number | null;
  }) {
    const { title, content, description, author_id, category_id } = promptData;
    
    // 检查是否已经存在相同的提示词（基于标题和作者）
    const existingPrompt = await this.query(
      'SELECT id FROM public_prompts WHERE title = ? AND author_id = ?',
      [title, author_id]
    );
    
    if ((existingPrompt.rows as any[]).length > 0) {
      return (existingPrompt.rows as any[])[0];
    }
    
    const result = await this.query(
      'INSERT INTO public_prompts (title, content, description, author_id, category_id) VALUES (?, ?, ?, ?, ?)',
      [title, content, description, author_id, category_id]
    );

    const insertId = (result.rows as any)[0]?.insertId;
    const newPrompt = await this.getPublicPromptById(insertId);
    return newPrompt;
  }

  async getPublicPromptById(id: number) {
    try {
      const result = await this.query(
        'SELECT pp.*, u.username, u.avatar_url FROM public_prompts pp JOIN users u ON pp.author_id = u.id WHERE pp.id = ?',
        [id]
      );
      const prompt = (result.rows as DbRow[])[0];
      return prompt;
    } catch (error) {
      console.error(`查询公共提示词 ID ${id} 失败:`, error);
      return null;
    }
  }

  async getPublicPrompts(limit = 50, offset = 0) {
    const result = await this.query(
      'SELECT pp.*, u.username, u.avatar_url FROM public_prompts pp JOIN users u ON pp.author_id = u.id ORDER BY pp.created_at DESC LIMIT ?, ?',
      [offset, limit]
    );
    return result.rows as DbRow[];
  }

  async updatePublicPrompt(id: number, updates: Partial<{
    title: string;
    content: string;
    description: string;
    category_id: number | null;
  }>) {
    const updateFields = Object.keys(updates)
      .filter(key => updates[key as keyof typeof updates] !== undefined)
      .map(key => `${key} = ?`);
    
    const updateValues = Object.values(updates).filter(value => value !== undefined);
    updateValues.push(id);

    const query = `UPDATE public_prompts SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await this.query(query, updateValues);

    return await this.getPublicPromptById(id);
  }

  async deletePublicPrompt(id: number) {
    await this.query('DELETE FROM public_prompts WHERE id = ?', [id]);
    return true;
  }

  // 文件夹相关方法
  async createFolder(folderData: { name: string; user_id: number; parent_id?: number | null }) {
    const { name, user_id, parent_id } = folderData;
    const result = await this.query(
      'INSERT INTO folders (name, user_id, parent_id) VALUES (?, ?, ?)',
      [name, user_id, parent_id]
    );

    const insertId = (result.rows as any)[0]?.insertId;
    const newFolder = await this.getFolderById(insertId);
    return newFolder;
  }

  async getFolderById(id: number) {
    const result = await this.query('SELECT * FROM folders WHERE id = ?', [id]);
    return (result.rows as DbRow[])[0];
  }

  async getFoldersByUserId(userId: number) {
    const result = await this.query('SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    const folders = result.rows as DbRow[];
    
    // 为每个文件夹添加提示词数量
    const foldersWithCount = await Promise.all(
      folders.map(async (folder) => {
        const promptCount = await this.getFolderPromptCount(folder.id as number);
        return {
          ...folder,
          prompt_count: promptCount
        };
      })
    );
    
    return foldersWithCount;
  }

  async updateFolder(id: number, updates: Partial<{ name: string; parent_id: number | null }>) {
    const updateFields = Object.keys(updates)
      .filter(key => updates[key as keyof typeof updates] !== undefined)
      .map(key => `${key} = ?`);
    
    const updateValues = Object.values(updates).filter(value => value !== undefined);
    updateValues.push(id);

    const query = `UPDATE folders SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    await this.query(query, updateValues);

    return await this.getFolderById(id);
  }

  async deleteFolder(id: number) {
    // 删除文件夹时，将关联的提示词的folder_id设为NULL
    await this.query('UPDATE user_prompts SET folder_id = NULL WHERE folder_id = ?', [id]);
    await this.query('DELETE FROM folders WHERE id = ?', [id]);
    return true;
  }

  // 分类相关方法
  async getCategories() {
    const result = await this.query('SELECT * FROM categories WHERE is_active = true ORDER BY sort_order ASC');
    return result.rows as DbRow[];
  }

  // 收藏相关方法
  async addFavorite(userId: number, publicPromptId: number) {
    try {
      await this.query(
        'INSERT INTO user_favorites (user_id, public_prompt_id) VALUES (?, ?)',
        [userId, publicPromptId]
      );
      return true;
    } catch (error) {
      // 如果已经收藏过，返回false
      if (error instanceof Error && error.message.includes('Duplicate entry')) {
        return false;
      }
      throw error;
    }
  }

  async isFavoritedByUser(userId: number, publicPromptId: number): Promise<boolean> {
    const result = await this.query(
      'SELECT COUNT(*) as count FROM user_favorites WHERE user_id = ? AND public_prompt_id = ?',
      [userId, publicPromptId]
    );
    return Number((result.rows as DbRow[])[0]?.count) > 0;
  }

  async removeFavorite(userId: number, publicPromptId: number) {
    await this.query(
      'DELETE FROM user_favorites WHERE user_id = ? AND public_prompt_id = ?',
      [userId, publicPromptId]
    );
    return true;
  }

  async getFavoritesByUserId(userId: number) {
    try {
      const result = await this.query(
        `SELECT pp.*, u.username, u.avatar_url, uf.created_at as favorited_at, uf.public_prompt_id,
                (SELECT COUNT(*) FROM user_favorites uf2 WHERE uf2.public_prompt_id = pp.id) as favorites_count
         FROM user_favorites uf 
         JOIN public_prompts pp ON uf.public_prompt_id = pp.id 
         JOIN users u ON pp.author_id = u.id 
         WHERE uf.user_id = ? 
         ORDER BY uf.created_at DESC`,
        [userId]
      );
      return result.rows as DbRow[];
    } catch (error) {
      console.error('收藏查询失败:', error)
      throw error;
    }
  }

  // 用户统计相关方法
  async createUserStats(userId: number) {
    const result = await this.query(
      'INSERT INTO user_usage_stats (user_id) VALUES (?)',
      [userId]
    );
    return (result.rows as any)[0];
  }

  async getUserStats(userId: number) {
    const result = await this.query('SELECT * FROM user_usage_stats WHERE user_id = ?', [userId]);
    return (result.rows as DbRow[])[0];
  }

  async updateUserStats(userId: number, updates: Partial<{
    ai_optimize_count: number;
    ai_generate_count: number;
    total_ai_usage: number;
    monthly_usage: number;
    last_reset_date?: string;
  }>) {
    const updateFields = Object.keys(updates)
      .filter(key => updates[key as keyof typeof updates] !== undefined)
      .map(key => `${key} = ?`);
    
    const updateValues = Object.values(updates).filter(value => value !== undefined);
    updateValues.push(userId);

    const query = `UPDATE user_usage_stats SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`;
    await this.query(query, updateValues);

    return await this.getUserStats(userId);
  }

  async incrementAIUsage(userId: number, aiMode: 'ai_optimize' | 'ai_generate' = 'ai_optimize') {
    // 根据AI模式更新相应的统计字段
    if (aiMode === 'ai_optimize') {
      await this.query(
        'UPDATE user_usage_stats SET ai_optimize_count = ai_optimize_count + 1, total_ai_usage = total_ai_usage + 1, monthly_usage = monthly_usage + 1 WHERE user_id = ?',
        [userId]
      );
    } else if (aiMode === 'ai_generate') {
      await this.query(
        'UPDATE user_usage_stats SET ai_generate_count = ai_generate_count + 1, total_ai_usage = total_ai_usage + 1, monthly_usage = monthly_usage + 1 WHERE user_id = ?',
        [userId]
      );
    } else {
      // 默认更新优化次数
      await this.query(
        'UPDATE user_usage_stats SET ai_optimize_count = ai_optimize_count + 1, total_ai_usage = total_ai_usage + 1, monthly_usage = monthly_usage + 1 WHERE user_id = ?',
        [userId]
      );
    }
  }

  // 统计方法
  async getUserPromptCount(userId: number): Promise<number> {
    const result = await this.query('SELECT COUNT(*) as count FROM user_prompts WHERE user_id = ?', [userId]);
    return Number((result.rows as DbRow[])[0]?.count) || 0;
  }

  async getUserFolderCount(userId: number): Promise<number> {
    const result = await this.query('SELECT COUNT(*) as count FROM folders WHERE user_id = ?', [userId]);
    return Number((result.rows as DbRow[])[0]?.count) || 0;
  }

  async getUserFavoriteCount(userId: number): Promise<number> {
    const result = await this.query('SELECT COUNT(*) as count FROM user_favorites WHERE user_id = ?', [userId]);
    return Number((result.rows as DbRow[])[0]?.count) || 0;
  }

  // 标签相关方法
  async createTag(name: string, color?: string) {
    const result = await this.query(
      'INSERT INTO tags (name, color) VALUES (?, ?)',
      [name, color || '#6366f1']
    );
    return (result.rows as any)[0];
  }

  async getTags() {
    const result = await this.query('SELECT * FROM tags ORDER BY name ASC');
    return result.rows as DbRow[];
  }

  async addUserPromptTags(promptId: number, tagNames: string[]) {
    for (const tagName of tagNames) {
      // 创建标签（如果不存在）
      await this.query(
        'INSERT IGNORE INTO tags (name) VALUES (?)',
        [tagName]
      );

      // 获取标签ID
      const tagResult = await this.query('SELECT id FROM tags WHERE name = ?', [tagName]);
      const tagId = (tagResult.rows as DbRow[])[0]?.id;

      if (tagId) {
        // 添加标签关联
        await this.query(
          'INSERT IGNORE INTO user_prompt_tags (user_prompt_id, tag_id) VALUES (?, ?)',
          [promptId, tagId]
        );
      }
    }
  }

  async addPublicPromptTags(promptId: number, tagNames: string[]) {
    for (const tagName of tagNames) {
      // 创建标签（如果不存在）
      await this.query(
        'INSERT IGNORE INTO tags (name) VALUES (?)',
        [tagName]
      );

      // 获取标签ID
      const tagResult = await this.query('SELECT id FROM tags WHERE name = ?', [tagName]);
      const tagId = (tagResult.rows as DbRow[])[0]?.id;

      if (tagId) {
        // 添加标签关联
        await this.query(
          'INSERT IGNORE INTO public_prompt_tags (public_prompt_id, tag_id) VALUES (?, ?)',
          [promptId, tagId]
        );
      }
    }
  }

  async getUserPromptTags(promptId: number) {
    const result = await this.query(
      'SELECT t.* FROM user_prompt_tags upt JOIN tags t ON upt.tag_id = t.id WHERE upt.user_prompt_id = ?',
      [promptId]
    );
    return result.rows as DbRow[];
  }

  async removeUserPromptTags(promptId: number) {
    await this.query(
      'DELETE FROM user_prompt_tags WHERE user_prompt_id = ?',
      [promptId]
    );
  }

  async getPublicPromptTags(promptId: number) {
    const result = await this.query(
      'SELECT t.* FROM public_prompt_tags ppt JOIN tags t ON ppt.tag_id = t.id WHERE ppt.public_prompt_id = ?',
      [promptId]
    );
    return result.rows as DbRow[];
  }

  // 浏览统计
  async incrementPromptViews(id: number) {
    await this.query(
      'UPDATE public_prompts SET views_count = views_count + 1 WHERE id = ?',
      [id]
    );
  }

  // 文件夹提示词统计
  async getFolderPromptCount(folderId: number): Promise<number> {
    const result = await this.query('SELECT COUNT(*) as count FROM user_prompt_folders WHERE folder_id = ?', [folderId]);
    return Number((result.rows as DbRow[])[0]?.count) || 0;
  }

  // 公共文件夹相关方法
  async createPublicFolder(folderData: {
    name: string;
    description: string;
    user_id: number;
    original_folder_id: number;
  }) {
    const { name, description, user_id, original_folder_id } = folderData;
    
    const result = await this.query(
      `INSERT INTO public_folders (name, description, user_id, original_folder_id) 
       VALUES (?, ?, ?, ?)`,
      [name, description, user_id, original_folder_id]
    );

    const insertId = (result.rows as any).insertId;
    
    if (!insertId) {
      throw new Error('公共文件夹创建失败：无法获取插入ID');
    }
    
    const newPublicFolder = await this.getPublicFolderById(insertId);
    
    if (!newPublicFolder) {
      throw new Error('公共文件夹创建失败：无法获取新创建的文件夹');
    }
    
    return newPublicFolder;
  }

  async getPublicFolderById(id: number) {
    const result = await this.query(
      'SELECT * FROM public_folders WHERE id = ?',
      [id]
    );
    return (result.rows as DbRow[])[0];
  }

  async getPublicFolderPrompts(folderId: number) {
    // 首先获取公共文件夹信息
    const publicFolder = await this.getPublicFolderById(folderId)
    if (!publicFolder) {
      return []
    }
    
    // 通过original_folder_id获取用户文件夹中的提示词
    const result = await this.query(
      'SELECT up.*, u.username, u.avatar_url FROM user_prompts up JOIN users u ON up.user_id = u.id WHERE up.folder_id = ? ORDER BY up.created_at DESC',
      [publicFolder.original_folder_id]
    );
    return result.rows as DbRow[];
  }

  async findUserPromptByTitle(userId: number, title: string) {
    const result = await this.query(
      'SELECT * FROM user_prompts WHERE user_id = ? AND title = ?',
      [userId, title]
    );
    return (result.rows as DbRow[])[0];
  }

  // 用户导入文件夹相关方法
  async createImportedFolder(folderData: {
    user_id: number;
    public_folder_id: number;
    name: string;
    description?: string | null;
  }) {
    const { user_id, public_folder_id, name, description } = folderData;
    
    const result = await this.query(
      `INSERT INTO user_imported_folders (user_id, public_folder_id, name, description) 
       VALUES (?, ?, ?, ?)`,
      [user_id, public_folder_id, name, description]
    );

    const insertId = (result.rows as any).insertId;
    return await this.getImportedFolderById(insertId);
  }

  async getImportedFolderById(id: number) {
    const result = await this.query(
      'SELECT * FROM user_imported_folders WHERE id = ?',
      [id]
    );
    return (result.rows as DbRow[])[0];
  }

  async getImportedFolderByPublicFolderId(userId: number, publicFolderId: number) {
    const result = await this.query(
      'SELECT * FROM user_imported_folders WHERE user_id = ? AND public_folder_id = ?',
      [userId, publicFolderId]
    );
    return (result.rows as DbRow[])[0];
  }

  async getUserImportedFolders(userId: number) {
    const result = await this.query(
      `SELECT uif.*, pf.name as original_name, pf.description as original_description,
              u.username as author, pf.created_at as original_created_at
       FROM user_imported_folders uif
       JOIN public_folders pf ON uif.public_folder_id = pf.id
       JOIN users u ON pf.user_id = u.id
       WHERE uif.user_id = ?
       ORDER BY uif.created_at DESC`,
      [userId]
    );
    return result.rows as DbRow[];
  }

  async getImportedFolderPrompts(importedFolderId: number) {
    // 修复查询逻辑：通过导入文件夹的public_folder_id获取对应的公共提示词
    // 首先获取导入文件夹对应的公共文件夹ID
    const importedFolder = await this.query(
      'SELECT public_folder_id FROM user_imported_folders WHERE id = ?',
      [importedFolderId]
    );
    
    if (!importedFolder.rows || (importedFolder.rows as any[]).length === 0) {
      return [];
    }
    
    const publicFolderId = ((importedFolder.rows as any[])[0] as any).public_folder_id;
    
    // 获取公共文件夹对应的原始文件夹ID
    const publicFolder = await this.query(
      'SELECT original_folder_id FROM public_folders WHERE id = ?',
      [publicFolderId]
    );
    
    if (!publicFolder.rows || (publicFolder.rows as any[]).length === 0) {
      return [];
    }
    
    const originalFolderId = ((publicFolder.rows as any[])[0] as any).original_folder_id;
    
    // 获取原始文件夹中的用户提示词，包含标签和分类信息
    const result = await this.query(
      `SELECT up.*, u.username, u.avatar_url,
              GROUP_CONCAT(DISTINCT t.name) as tags_string,
              c.name as category_name,
              c.color as category_color
       FROM user_prompts up
       JOIN users u ON up.user_id = u.id
       LEFT JOIN user_prompt_tags upt ON up.id = upt.user_prompt_id
       LEFT JOIN tags t ON upt.tag_id = t.id
       LEFT JOIN categories c ON up.category_id = c.id
       WHERE up.folder_id = ?
       GROUP BY up.id, up.title, up.content, up.description, up.user_id, up.category_id, up.created_at, up.updated_at, u.username, u.avatar_url, c.name, c.color
       ORDER BY up.created_at DESC`,
      [originalFolderId]
    );
    
    return result.rows as DbRow[];
  }

  async deleteUserImportedFolder(folderId: number, userId: number) {
    try {
      const result = await this.query(
        'DELETE FROM user_imported_folders WHERE id = ? AND user_id = ?',
        [folderId, userId]
      );
      return (result.rows as any).affectedRows > 0;
    } catch (error) {
      console.error('删除用户导入文件夹失败:', error);
      return false;
    }
  }

  async getImportedFolderPromptCount(importedFolderId: number): Promise<number> {
    // 获取导入文件夹的提示词数量
    const importedFolder = await this.query(
      'SELECT public_folder_id FROM user_imported_folders WHERE id = ?',
      [importedFolderId]
    );
    
    if (!importedFolder.rows || (importedFolder.rows as any[]).length === 0) {
      return 0;
    }
    
    const publicFolderId = ((importedFolder.rows as any[])[0] as any).public_folder_id;
    
    // 获取公共文件夹对应的原始文件夹ID
    const publicFolder = await this.query(
      'SELECT original_folder_id FROM public_folders WHERE id = ?',
      [publicFolderId]
    );
    
    if (!publicFolder.rows || (publicFolder.rows as any[]).length === 0) {
      return 0;
    }
    
    const originalFolderId = ((publicFolder.rows as any[])[0] as any).original_folder_id;
    
    // 获取原始文件夹中的提示词数量
    const result = await this.query(
      'SELECT COUNT(*) as count FROM user_prompts WHERE folder_id = ?',
      [originalFolderId]
    );
    
    return ((result.rows as any[])[0] as any).count || 0;
  }

  // ===== 版本历史相关方法 =====

  async createPromptVersion(data: {
    prompt_id: number;
    user_id: number;
    title: string;
    content: string;
    change_summary?: string;
  }) {
    // 获取当前最大版本号
    const maxVersion = await this.query(
      'SELECT COALESCE(MAX(version_number), 0) as max_version FROM prompt_versions WHERE prompt_id = ?',
      [data.prompt_id]
    );
    const nextVersion = ((maxVersion.rows as any[])[0] as any).max_version + 1;

    const result = await this.query(
      'INSERT INTO prompt_versions (prompt_id, user_id, title, content, version_number, change_summary) VALUES (?, ?, ?, ?, ?, ?)',
      [data.prompt_id, data.user_id, data.title, data.content, nextVersion, data.change_summary || null]
    );

    return { id: (result.rows as any)[0]?.insertId, version_number: nextVersion };
  }

  async getPromptVersions(promptId: number) {
    const result = await this.query(
      'SELECT id, prompt_id, user_id, title, version_number, change_summary, created_at FROM prompt_versions WHERE prompt_id = ? ORDER BY version_number DESC',
      [promptId]
    );
    return result.rows as any[];
  }

  async getPromptVersion(versionId: number) {
    const result = await this.query(
      'SELECT * FROM prompt_versions WHERE id = ?',
      [versionId]
    );
    return (result.rows as any[])[0] || null;
  }

  async getPromptVersionByNumber(promptId: number, versionNumber: number) {
    const result = await this.query(
      'SELECT * FROM prompt_versions WHERE prompt_id = ? AND version_number = ?',
      [promptId, versionNumber]
    );
    return (result.rows as any[])[0] || null;
  }

  // ===== 全局搜索相关方法 =====

  async globalSearch(userId: number, keyword: string, options?: { page?: number; limit?: number }) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const offset = (page - 1) * limit;
    const searchTerm = `%${keyword}%`;

    // 搜索用户自己的提示词
    const userPromptsResult = await this.query(
      `SELECT id, title, content, folder_id, created_at, updated_at, 'user_prompt' as source_type
       FROM user_prompts
       WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      [userId, searchTerm, searchTerm, limit, offset]
    );

    const userPromptsCountResult = await this.query(
      'SELECT COUNT(*) as total FROM user_prompts WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)',
      [userId, searchTerm, searchTerm]
    );

    // 搜索公共提示词
    const publicPromptsResult = await this.query(
      `SELECT pp.id, pp.title, pp.content, pp.author, pp.created_at, pp.updated_at, 'public_prompt' as source_type
       FROM public_prompts pp
       WHERE pp.title LIKE ? OR pp.content LIKE ?
       ORDER BY pp.updated_at DESC
       LIMIT ? OFFSET ?`,
      [searchTerm, searchTerm, limit, offset]
    );

    const publicPromptsCountResult = await this.query(
      'SELECT COUNT(*) as total FROM public_prompts WHERE title LIKE ? OR content LIKE ?',
      [searchTerm, searchTerm]
    );

    // 搜索用户文件夹
    const foldersResult = await this.query(
      `SELECT id, name, created_at, 'folder' as source_type
       FROM folders
       WHERE user_id = ? AND name LIKE ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, searchTerm, 10]
    );

    return {
      userPrompts: {
        items: userPromptsResult.rows as any[],
        total: ((userPromptsCountResult.rows as any[])[0] as any).total
      },
      publicPrompts: {
        items: publicPromptsResult.rows as any[],
        total: ((publicPromptsCountResult.rows as any[])[0] as any).total
      },
      folders: {
        items: foldersResult.rows as any[]
      }
    };
  }
}

const db = new MySQLDB();
export default db;
