
import mysql from 'mysql2/promise';
import { hasCompleteOwnership } from './resource-authorization';
import schemaRequirements from '../../database/schema-requirements.json';
import {
  composePromptEditorContent,
  normalizePromptEditorState,
  promptEditorTitle,
  resolveStoredPromptEditorState,
  serializePromptEditorPayload,
  withPromptEditorTitle,
} from './prompt-editor-state';
import type { EditMode, NormalModeData, ProfessionalModeData } from '@/types';
import { mysqlErrorMetadata, mysqlQueryAttemptLimit } from './mysql-query-policy';
import {
  EntitlementLimitError,
  getUserLimits,
  resolveEntitlementUserType,
  type EntitlementResource,
} from './entitlement-policy';
import { normalizePromptTagNames } from './tag-policy';
import { PROMPT_LIST_PREVIEW_CHARS } from './prompt-list-policy';
import { MAX_FOLDER_PROMPT_CONTENT_CHARS } from './prompt-list-policy';

type DbRow = Record<string, unknown>;
type OwnedDbRow = DbRow & { id: unknown; user_id: unknown };
type MutationResult = { insertId?: number; affectedRows?: number };
type PromptVersionRow = DbRow & { title?: string; content?: string };
type SchemaColumnRow = { TABLE_NAME: string; COLUMN_NAME: string };
type MySQLParameter = string | number | bigint | boolean | Date | null | Buffer | Uint8Array;
type SnapshotQuery = (sql: string, params?: unknown[]) => Promise<{ rows: unknown }>;
const MYSQL_DB_INSTANCE_VERSION = 8;

function normalizeMySQLParameter(value: unknown): MySQLParameter {
  if (value === undefined || value === null) return null;
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || typeof value === 'boolean'
    || value instanceof Date
    || Buffer.isBuffer(value)
    || value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError('Unsupported database parameter type');
}

function requireInsertId(result: MutationResult, message: string) {
  const insertId = Number(result.insertId)
  if (!Number.isSafeInteger(insertId) || insertId <= 0) throw new Error(message)
  return insertId
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class MySQLDB {
  private pool: mysql.Pool;
  private schemaValidation: Promise<void> | null = null;

  constructor() {
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || '',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'agent_report',
      waitForConnections: true,
      connectionLimit: 50,
      queueLimit: 100,
      connectTimeout: 10000,
      charset: 'utf8mb4',
      timezone: '+08:00',
      // 移除无效的配置参数
      multipleStatements: false,
    });
  }

  async assertSchemaReady() {
    if (!this.schemaValidation) {
      this.schemaValidation = this.validateSchema();
    }
    return this.schemaValidation;
  }

  async checkReadiness() {
    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const password = process.env.MYSQL_PASSWORD;
    const database = process.env.MYSQL_DATABASE;
    const port = Number.parseInt(process.env.MYSQL_PORT || '3306', 10);

    if (!host || !user || !password || !database || !Number.isInteger(port)) {
      throw new Error('Database readiness configuration is incomplete');
    }
    if (user.trim().toLowerCase() === 'root') {
      throw new Error('Database readiness refuses the root account');
    }

    // Reuse the application pool so repeated readiness probes cannot create an
    // independent connection storm. mysql2 releases the pooled connection when
    // the query settles, including timeout and error paths.
    await this.pool.query({ sql: 'SELECT 1', timeout: 1500 });
  }

  private async validateSchema() {
    const connection = await this.pool.getConnection();
    try {
      const [columnResult] = await connection.execute(
        `SELECT TABLE_NAME, COLUMN_NAME
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()`
      );
      const availableColumns = new Map<string, Set<string>>();
      for (const row of columnResult as SchemaColumnRow[]) {
        const columns = availableColumns.get(row.TABLE_NAME) || new Set<string>();
        columns.add(row.COLUMN_NAME);
        availableColumns.set(row.TABLE_NAME, columns);
      }

      const missing: string[] = [];
      const requiredTables = schemaRequirements.tables as Record<string, string[]>;
      for (const [tableName, columns] of Object.entries(requiredTables)) {
        const available = availableColumns.get(tableName);
        if (!available) {
          missing.push(`${tableName}.*`);
          continue;
        }
        for (const columnName of columns) {
          if (!available.has(columnName)) missing.push(`${tableName}.${columnName}`);
        }
      }

      if (availableColumns.has('schema_migrations')) {
        const [migrationResult] = await connection.execute('SELECT version FROM schema_migrations');
        const applied = new Set(
          (migrationResult as Array<{ version: string | number }>).map(row => String(row.version))
        );
        for (const version of schemaRequirements.requiredMigrations) {
          if (!applied.has(version)) missing.push(`migration:${version}`);
        }
      }

      if (missing.length > 0) {
        const details = missing.slice(0, 12).join(', ');
        const remainder = missing.length > 12 ? ` (+${missing.length - 12} more)` : '';
        throw new Error(
          `Database schema is not ready. Run "node scripts/mysql-migrate.cjs up" before starting the app. Missing: ${details}${remainder}`
        );
      }
    } finally {
      connection.release();
    }
  }

  /**
   * Serializes resource creation on the owning user row so concurrent requests
   * cannot all observe the same pre-insert count and overrun the plan limit.
   */
  private async enforceResourceCreationLimit(
    connection: mysql.PoolConnection,
    userId: number,
    resource: EntitlementResource,
  ) {
    const [userRows] = await connection.execute(
      `SELECT user_type, is_admin, is_active
         FROM users
        WHERE id = ?
        FOR UPDATE`,
      [userId],
    );
    const user = (userRows as DbRow[])[0];
    if (!user || Number(user.is_active) !== 1) {
      throw new Error('用户不存在或未激活');
    }

    const limits = getUserLimits(resolveEntitlementUserType(user));
    const limit = resource === 'prompt' ? limits.max_prompts : limits.max_folders;
    if (limit < 0) return;

    const countSql = resource === 'prompt'
      ? 'SELECT COUNT(*) AS resource_count FROM user_prompts WHERE user_id = ?'
      : 'SELECT COUNT(*) AS resource_count FROM folders WHERE user_id = ?';
    const [countRows] = await connection.execute(countSql, [userId]);
    const currentCount = Number((countRows as DbRow[])[0]?.resource_count);
    if (!Number.isSafeInteger(currentCount) || currentCount < 0) {
      throw new Error('无法验证当前方案资源用量');
    }
    if (currentCount >= limit) {
      throw new EntitlementLimitError(resource, limit);
    }
  }

  private async replaceUserPromptTags(
    connection: mysql.PoolConnection,
    promptId: number,
    tagNames: string[],
  ) {
    const normalizedTags = normalizePromptTagNames(tagNames);
    await connection.execute(
      'DELETE FROM user_prompt_tags WHERE user_prompt_id = ?',
      [promptId],
    );
    for (const tagName of normalizedTags) {
      await connection.execute('INSERT IGNORE INTO tags (name) VALUES (?)', [tagName]);
      const [tagRows] = await connection.execute(
        'SELECT id FROM tags WHERE name = ? LIMIT 1',
        [tagName],
      );
      const tagId = Number((tagRows as DbRow[])[0]?.id);
      if (!Number.isSafeInteger(tagId) || tagId <= 0) {
        throw new Error('标签写入失败');
      }
      await connection.execute(
        'INSERT INTO user_prompt_tags (user_prompt_id, tag_id) VALUES (?, ?)',
        [promptId, tagId],
      );
    }
  }

  private async replacePublicPromptTags(
    connection: mysql.PoolConnection,
    promptId: number,
    tagNames: string[],
  ) {
    const normalizedTags = normalizePromptTagNames(tagNames);
    await connection.execute(
      'DELETE FROM public_prompt_tags WHERE public_prompt_id = ?',
      [promptId],
    );
    for (const tagName of normalizedTags) {
      await connection.execute('INSERT IGNORE INTO tags (name) VALUES (?)', [tagName]);
      const [tagRows] = await connection.execute(
        'SELECT id FROM tags WHERE name = ? LIMIT 1',
        [tagName],
      );
      const tagId = Number((tagRows as DbRow[])[0]?.id);
      if (!Number.isSafeInteger(tagId) || tagId <= 0) {
        throw new Error('标签写入失败');
      }
      await connection.execute(
        'INSERT INTO public_prompt_tags (public_prompt_id, tag_id) VALUES (?, ?)',
        [promptId, tagId],
      );
    }
  }

  async query(sql: string, params?: unknown[]) {
    await this.assertSchemaReady();
    let connection;
    const attemptLimit = mysqlQueryAttemptLimit(sql);
    let attemptsRemaining = attemptLimit;
    
    while (attemptsRemaining > 0) {
      try {
        connection = await this.pool.getConnection();
        
        // 简化参数处理
        const cleanParams = params?.map(normalizeMySQLParameter) || [];
        
        const [rows, fields] = await connection.execute(sql, cleanParams);
        return { rows, fields };
      } catch (error) {
        const attempt = attemptLimit - attemptsRemaining + 1;
        console.error('数据库查询失败', {
          attempt,
          attemptLimit,
          ...mysqlErrorMetadata(error),
        });
        attemptsRemaining--;
        
        if (attemptsRemaining === 0) {
          throw error;
        }
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      } finally {
        if (connection) {
          connection.release();
        }
      }
    }
    
    throw new Error('数据库查询失败');
  }

  async withConsistentReadSnapshot<T>(operation: (query: SnapshotQuery) => Promise<T>): Promise<T> {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION READ ONLY');
      const snapshotQuery: SnapshotQuery = async (sql, params) => {
        const cleanParams = params?.map(normalizeMySQLParameter) || [];
        const [rows] = await connection.execute(sql, cleanParams);
        return { rows };
      };
      const result = await operation(snapshotQuery);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async execute(sql: string, params?: unknown[]) {
    const result = await this.query(sql, params);
    return [result.rows, result.fields] as const;
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
    const insertId = requireInsertId(result.rows as MutationResult, '用户创建失败：无法获取插入ID');
    
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
    editor_mode?: 'normal' | 'professional';
    payload?: unknown;
    schema_version?: number;
    is_public?: boolean;
    tags?: string[];
  }) {
    const { title, content, description, user_id, folder_id, category_id, mode, is_public } = promptData;
    const editorState = normalizePromptEditorState({
      editor_mode: promptData.editor_mode ?? mode,
      payload: promptData.payload,
      schema_version: promptData.schema_version,
    }, { title, content, mode });
    const canonicalTitle = promptEditorTitle(editorState);
    const canonicalContent = composePromptEditorContent(editorState);
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.enforceResourceCreationLimit(connection, user_id, 'prompt');
      const normalizedFolderId = folder_id ?? null;
      if (normalizedFolderId !== null) {
        const [folderRows] = await connection.execute(
          'SELECT id FROM folders WHERE id = ? AND user_id = ? FOR UPDATE',
          [normalizedFolderId, user_id]
        );
        if ((folderRows as DbRow[]).length === 0) {
          throw new Error('文件夹不存在或不属于当前用户');
        }
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO user_prompts
          (title, content, description, user_id, folder_id, category_id, mode, editor_mode, payload, schema_version, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          canonicalTitle,
          canonicalContent,
          description ?? null,
          user_id,
          normalizedFolderId,
          category_id ?? null,
          editorState.editor_mode,
          editorState.editor_mode,
          serializePromptEditorPayload(editorState),
          editorState.schema_version,
          is_public ? 1 : 0,
        ]
      );
      const insertId = requireInsertId(insertResult as MutationResult, '提示词创建失败：无法获取插入ID');

      if (normalizedFolderId !== null) {
        await connection.execute(
          `INSERT INTO user_prompt_folders (user_prompt_id, folder_id)
           VALUES (?, ?)`,
          [insertId, normalizedFolderId]
        );
      }
      if (promptData.tags !== undefined) {
        await this.replaceUserPromptTags(connection, insertId, promptData.tags);
      }

      const [createdRows] = await connection.execute(
        `SELECT up.*, u.username, u.avatar_url
           FROM user_prompts up
           JOIN users u ON up.user_id = u.id
          WHERE up.id = ? AND up.user_id = ?`,
        [insertId, user_id]
      );
      await connection.commit();
      return (createdRows as DbRow[])[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getUserPromptById(id: number) {
    const result = await this.query(
      'SELECT up.*, u.username, u.avatar_url FROM user_prompts up JOIN users u ON up.user_id = u.id WHERE up.id = ?',
      [id]
    );
    return (result.rows as DbRow[])[0];
  }

  async getOwnedUserPromptById(id: number, userId: number) {
    const result = await this.query(
      `SELECT up.*, u.username, u.avatar_url
         FROM user_prompts up
         JOIN users u ON up.user_id = u.id
        WHERE up.id = ? AND up.user_id = ?`,
      [id, userId],
    );
    return (result.rows as DbRow[])[0];
  }

  async getUserPromptsByUserId(userId: number, folderId?: number) {
    const folderFilter = folderId === undefined
      ? ''
      : `AND EXISTS (
          SELECT 1
            FROM user_prompt_folders selected_relation
           WHERE selected_relation.user_prompt_id = up.id
             AND selected_relation.folder_id = ?
        )`;
    const params: (string | number)[] = folderId === undefined
      ? [userId]
      : [userId, folderId];
    const query = `
      SELECT up.*, u.username, u.avatar_url,
             (
               SELECT GROUP_CONCAT(DISTINCT all_relation.folder_id ORDER BY all_relation.folder_id)
                 FROM user_prompt_folders all_relation
                WHERE all_relation.user_prompt_id = up.id
             ) AS folder_ids,
             (
               SELECT GROUP_CONCAT(DISTINCT owned_folder.name ORDER BY owned_folder.name SEPARATOR ',')
                 FROM user_prompt_folders named_relation
                 JOIN folders owned_folder ON owned_folder.id = named_relation.folder_id
                WHERE named_relation.user_prompt_id = up.id
                  AND owned_folder.user_id = up.user_id
             ) AS folder_names
        FROM user_prompts up
        JOIN users u ON up.user_id = u.id
       WHERE up.user_id = ?
         ${folderFilter}
       ORDER BY up.created_at DESC, up.id DESC
    `;

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

  async updateOwnedUserPromptWithVersion(
    promptId: number,
    userId: number,
    updates: {
      editor_mode: EditMode;
      payload: NormalModeData | ProfessionalModeData;
      schema_version: number;
      title: string;
      content: string;
      description?: string | null;
      folder_id?: number | null;
      category_id?: number | null;
      is_public?: boolean;
      change_summary?: string;
      tags?: string[];
    },
  ) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [currentRows] = await connection.execute(
        `SELECT *
           FROM user_prompts
          WHERE id = ? AND user_id = ?
          FOR UPDATE`,
        [promptId, userId]
      );
      const current = (currentRows as DbRow[])[0];
      if (!current) {
        await connection.rollback();
        return null;
      }

      const currentFolderId = current.folder_id == null ? null : Number(current.folder_id);
      const currentCategoryId = current.category_id == null ? null : Number(current.category_id);
      const nextFolderId = updates.folder_id === undefined ? currentFolderId : updates.folder_id;
      const nextCategoryId = updates.category_id === undefined ? currentCategoryId : updates.category_id;
      const nextDescription = updates.description === undefined
        ? current.description == null ? null : String(current.description)
        : updates.description;
      const nextIsPublic = updates.is_public === undefined
        ? Number(current.is_public) === 1
        : updates.is_public;

      if (updates.folder_id !== undefined && nextFolderId !== null) {
        const [folderRows] = await connection.execute(
          'SELECT id FROM folders WHERE id = ? AND user_id = ? FOR UPDATE',
          [nextFolderId, userId]
        );
        if ((folderRows as DbRow[]).length === 0) {
          throw new Error('文件夹不存在或不属于当前用户');
        }
      }

      const editorState = normalizePromptEditorState({
        editor_mode: updates.editor_mode,
        payload: updates.payload,
        schema_version: updates.schema_version,
      }, {
        title: updates.title,
        content: updates.content,
        mode: updates.editor_mode,
      });
      const title = promptEditorTitle(editorState);
      const content = composePromptEditorContent(editorState);
      const payload = serializePromptEditorPayload(editorState);
      const currentState = withPromptEditorTitle(
        resolveStoredPromptEditorState(current),
        String(current.title || ''),
      );
      const currentPayload = serializePromptEditorPayload(currentState);
      const shouldCreateVersion =
        String(current.title || '') !== title
        || String(current.content || '') !== content
        || currentState.editor_mode !== editorState.editor_mode
        || currentState.schema_version !== editorState.schema_version
        || currentPayload !== payload;

      if (shouldCreateVersion) {
        const [versionRows] = await connection.execute(
          'SELECT COALESCE(MAX(version_number), 0) AS max_version FROM prompt_versions WHERE prompt_id = ?',
          [promptId]
        );
        const nextVersion = (Number((versionRows as DbRow[])[0]?.max_version) || 0) + 1;
        await connection.execute(
          `INSERT INTO prompt_versions
            (prompt_id, user_id, title, content, version_number, change_summary, editor_mode, payload, schema_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            promptId,
            userId,
            String(current.title || ''),
            String(current.content || ''),
            nextVersion,
            updates.change_summary || '更新提示词',
            currentState.editor_mode,
            currentPayload,
            currentState.schema_version,
          ]
        );
      }

      await connection.execute(
        `UPDATE user_prompts
            SET title = ?,
                content = ?,
                mode = ?,
                editor_mode = ?,
                payload = ?,
                schema_version = ?,
                description = ?,
                folder_id = ?,
                category_id = ?,
                is_public = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?`,
        [
          title,
          content,
          editorState.editor_mode,
          editorState.editor_mode,
          payload,
          editorState.schema_version,
          nextDescription,
          nextFolderId,
          nextCategoryId,
          nextIsPublic ? 1 : 0,
          promptId,
          userId,
        ]
      );

      if (updates.folder_id !== undefined) {
        await connection.execute(
          'DELETE FROM user_prompt_folders WHERE user_prompt_id = ?',
          [promptId]
        );
        if (nextFolderId !== null) {
          await connection.execute(
            `INSERT INTO user_prompt_folders (user_prompt_id, folder_id)
             VALUES (?, ?)`,
            [promptId, nextFolderId]
          );
        }
      }
      if (updates.tags !== undefined) {
        await this.replaceUserPromptTags(connection, promptId, updates.tags);
      }

      const [updatedRows] = await connection.execute(
        `SELECT up.*, u.username, u.avatar_url
           FROM user_prompts up
           JOIN users u ON up.user_id = u.id
          WHERE up.id = ? AND up.user_id = ?`,
        [promptId, userId]
      );
      await connection.commit();
      return (updatedRows as DbRow[])[0] || null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteUserPrompt(id: number) {
    await this.query('DELETE FROM user_prompts WHERE id = ?', [id]);
    return true;
  }

  // 公共提示词相关方法
  async createExternalPublicPrompt(
    promptData: {
      title: string;
      content: string;
      description?: string | null;
      author_id: number;
      category_id?: number | null;
    },
    accountLimit: number,
  ) {
    if (!Number.isSafeInteger(accountLimit) || accountLimit <= 0) {
      throw new RangeError('External publication account limit must be a positive safe integer');
    }

    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [userRows] = await connection.execute(
        'SELECT id, is_active FROM users WHERE id = ? FOR UPDATE',
        [promptData.author_id],
      );
      const user = (userRows as DbRow[])[0];
      if (!user || Number(user.is_active) !== 1) {
        await connection.rollback();
        return { status: 'author_not_found' as const };
      }

      // Withdrawn detached publications still consume the account cap so an API
      // client cannot evade the bounded resource limit by cycling visibility.
      const [countRows] = await connection.execute(
        'SELECT COUNT(*) AS publication_count FROM public_prompts WHERE author_id = ?',
        [promptData.author_id],
      );
      const publicationCount = Number((countRows as DbRow[])[0]?.publication_count);
      if (!Number.isSafeInteger(publicationCount) || publicationCount < 0) {
        throw new Error('无法验证外部 API 公共提示词用量');
      }
      if (publicationCount >= accountLimit) {
        await connection.rollback();
        return { status: 'account_limit_reached' as const };
      }

      const [insertResult] = await connection.execute(
        `INSERT INTO public_prompts
          (source_prompt_id, publication_state, title, content, description,
           category_id, author_id, created_at, updated_at)
         VALUES (NULL, 'published', ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          promptData.title,
          promptData.content,
          promptData.description ?? null,
          promptData.category_id ?? null,
          promptData.author_id,
        ],
      );
      const promptId = requireInsertId(
        insertResult as MutationResult,
        'Public prompt insert did not return a valid ID',
      );
      const [promptRows] = await connection.execute(
        `SELECT
           pp.id,
           pp.title,
           pp.content,
           pp.description,
           pp.category_id,
           pp.views_count,
           pp.is_featured,
           pp.publication_state,
           pp.created_at,
           pp.updated_at,
           u.username AS author_name,
           c.name AS category_name
         FROM public_prompts pp
         JOIN users u ON pp.author_id = u.id
         LEFT JOIN categories c ON pp.category_id = c.id
         WHERE pp.id = ? AND pp.author_id = ?`,
        [promptId, promptData.author_id],
      );
      await connection.commit();
      return { status: 'created' as const, prompt: (promptRows as DbRow[])[0] };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async publishOwnedUserPrompts(userId: number, promptIds: number[]): Promise<DbRow[] | null> {
    if (promptIds.length === 0) return [];
    if (
      promptIds.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(promptIds).size !== promptIds.length
    ) {
      throw new RangeError('Prompt IDs must be unique positive safe integers');
    }

    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock private sources and their publications in a deterministic order so
      // overlapping batch requests cannot acquire the same rows in reverse order.
      const orderedPromptIds = [...promptIds].sort((left, right) => left - right);
      const placeholders = orderedPromptIds.map(() => '?').join(', ');
      const [promptRowsResult] = await connection.execute(
        `SELECT id, user_id
         FROM user_prompts
         WHERE user_id = ? AND id IN (${placeholders})
         ORDER BY id
         FOR UPDATE`,
        [userId, ...orderedPromptIds]
      );
      const prompts = promptRowsResult as OwnedDbRow[];

      if (!hasCompleteOwnership(prompts, orderedPromptIds, userId)) {
        await connection.rollback();
        return null;
      }

      const publishedPrompts: DbRow[] = [];

      for (const promptId of orderedPromptIds) {
        const [existingRowsResult] = await connection.execute(
          `SELECT id, author_id
           FROM public_prompts
           WHERE source_prompt_id = ?
           FOR UPDATE`,
          [promptId]
        );
        const existingPublicPrompt = (existingRowsResult as DbRow[])[0];
        let publicPromptId = existingPublicPrompt ? Number(existingPublicPrompt.id) : null;

        if (existingPublicPrompt) {
          if (Number(existingPublicPrompt.author_id) !== userId) {
            throw new Error('Publication source ownership invariant is violated');
          }
          await connection.execute(
            `UPDATE public_prompts publication
             JOIN user_prompts source
               ON source.id = publication.source_prompt_id
              AND source.id = ?
              AND source.user_id = ?
             SET publication.title = source.title,
                 publication.content = source.content,
                 publication.description = source.description,
                 publication.author_id = source.user_id,
                 publication.category_id = source.category_id,
                 publication.editor_mode = source.editor_mode,
                 publication.payload = source.payload,
                 publication.schema_version = source.schema_version,
                 publication.publication_state = 'published',
                 publication.updated_at = CURRENT_TIMESTAMP
             WHERE publication.id = ?`,
            [promptId, userId, publicPromptId]
          );
        } else {
          const [insertResult] = await connection.execute(
            `INSERT INTO public_prompts
               (source_prompt_id, publication_state, title, content, description,
                author_id, category_id, editor_mode, payload, schema_version,
                created_at, updated_at)
             SELECT source.id,
                    'published',
                    source.title,
                    source.content,
                    source.description,
                    source.user_id,
                    source.category_id,
                    source.editor_mode,
                    source.payload,
                    source.schema_version,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
               FROM user_prompts source
              WHERE source.id = ? AND source.user_id = ?`,
            [promptId, userId]
          );
          publicPromptId = requireInsertId(
            insertResult as MutationResult,
            '公共提示词创建失败：无法获取有效 ID',
          );
        }

        if (
          typeof publicPromptId !== 'number'
          || !Number.isSafeInteger(publicPromptId)
          || publicPromptId <= 0
        ) {
          throw new Error('公共提示词创建失败：无法获取有效 ID');
        }

        // Tags are part of the publication snapshot. Replace the set instead of
        // appending so removed private tags never survive a later publication.
        await connection.execute(
          'DELETE FROM public_prompt_tags WHERE public_prompt_id = ?',
          [publicPromptId]
        );
        await connection.execute(
          `INSERT INTO public_prompt_tags (public_prompt_id, tag_id)
           SELECT ?, tag_id FROM user_prompt_tags WHERE user_prompt_id = ?`,
          [publicPromptId, promptId]
        );

        const [publishedRowsResult] = await connection.execute(
          `SELECT pp.id,
                  pp.title,
                  pp.content,
                  pp.description,
                  pp.author_id,
                  pp.category_id,
                  pp.views_count,
                  pp.is_featured,
                  pp.editor_mode,
                  pp.payload,
                  pp.schema_version,
                  pp.publication_state,
                  pp.created_at,
                  pp.updated_at,
                  u.username,
                  u.avatar_url
           FROM public_prompts pp
           JOIN users u ON pp.author_id = u.id
           WHERE pp.id = ? AND pp.author_id = ?`,
          [publicPromptId, userId]
        );
        const publishedPrompt = (publishedRowsResult as DbRow[])[0];
        if (!publishedPrompt) {
          throw new Error('公共提示词创建后无法读取');
        }
        publishedPrompts.push(publishedPrompt);
      }

      await connection.commit();
      return publishedPrompts;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPublicPromptById(id: number) {
    const result = await this.query(
      `SELECT pp.id,
              pp.title,
              pp.content,
              pp.description,
              pp.author_id,
              pp.category_id,
              pp.views_count,
              pp.is_featured,
              pp.editor_mode,
              pp.payload,
              pp.schema_version,
              pp.created_at,
              pp.updated_at,
              u.username,
              u.avatar_url
         FROM public_prompts pp
         JOIN users u ON pp.author_id = u.id
        WHERE pp.id = ? AND pp.publication_state = 'published'`,
      [id]
    );
    return (result.rows as DbRow[])[0];
  }

  async getOwnedPublicPromptById(userId: number, id: number) {
    const result = await this.query(
      `SELECT pp.id,
              pp.title,
              pp.content,
              pp.description,
              pp.author_id,
              pp.category_id,
              pp.views_count,
              pp.is_featured,
              pp.editor_mode,
              pp.payload,
              pp.schema_version,
              pp.publication_state,
              pp.created_at,
              pp.updated_at,
              u.username,
              u.avatar_url
         FROM public_prompts pp
         JOIN users u ON pp.author_id = u.id
        WHERE pp.id = ? AND pp.author_id = ?`,
      [id, userId]
    );
    return (result.rows as DbRow[])[0];
  }

  async getPublicPrompts(limit = 50, offset = 0) {
    const result = await this.query(
      `SELECT pp.id,
              pp.title,
              pp.content,
              pp.description,
              pp.author_id,
              pp.category_id,
              pp.views_count,
              pp.is_featured,
              pp.editor_mode,
              pp.payload,
              pp.schema_version,
              pp.created_at,
              pp.updated_at,
              u.username,
              u.avatar_url
         FROM public_prompts pp
         JOIN users u ON pp.author_id = u.id
        WHERE pp.publication_state = 'published'
        ORDER BY pp.created_at DESC
        LIMIT ?, ?`,
      [offset, limit]
    );
    return result.rows as DbRow[];
  }

  async withdrawOwnedPublicPrompt(userId: number, id: number): Promise<boolean> {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, publication_state
           FROM public_prompts
          WHERE id = ? AND author_id = ?
          FOR UPDATE`,
        [id, userId]
      );
      const publication = (rows as DbRow[])[0];
      if (!publication) {
        await connection.rollback();
        return false;
      }
      if (publication.publication_state !== 'withdrawn') {
        await connection.execute(
          `UPDATE public_prompts
              SET publication_state = 'withdrawn', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND author_id = ?`,
          [id, userId]
        );
      }
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updatePublicPromptWithTags(
    id: number,
    updates: Partial<{
      title: string;
      content: string;
      description: string | null;
      is_featured: boolean;
      tags: string[];
    }>,
  ) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.execute(
        `SELECT id FROM public_prompts WHERE id = ? AND publication_state = 'published' FOR UPDATE`,
        [id],
      );
      if ((existingRows as DbRow[]).length === 0) {
        await connection.rollback();
        return false;
      }

      const updateFields: string[] = [];
      const values: MySQLParameter[] = [];
      if (updates.title !== undefined) {
        updateFields.push('title = ?');
        values.push(updates.title);
      }
      if (updates.content !== undefined) {
        updateFields.push('content = ?');
        values.push(updates.content);
      }
      if (updates.description !== undefined) {
        updateFields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.is_featured !== undefined) {
        updateFields.push('is_featured = ?');
        values.push(updates.is_featured ? 1 : 0);
      }
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      await connection.execute(
        `UPDATE public_prompts SET ${updateFields.join(', ')} WHERE id = ?`,
        values,
      );

      if (updates.tags !== undefined) {
        await this.replacePublicPromptTags(connection, id, updates.tags);
      }
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // 文件夹相关方法
  async createFolder(folderData: { name: string; user_id: number; parent_id?: number | null }) {
    const { name, user_id, parent_id } = folderData;
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.enforceResourceCreationLimit(connection, user_id, 'folder');

      const normalizedParentId = parent_id ?? null;
      if (normalizedParentId !== null) {
        const [parentRows] = await connection.execute(
          'SELECT id FROM folders WHERE id = ? AND user_id = ? FOR UPDATE',
          [normalizedParentId, user_id],
        );
        if ((parentRows as DbRow[]).length === 0) {
          throw new Error('父文件夹不存在或不属于当前用户');
        }
      }

      const [insertResult] = await connection.execute(
        'INSERT INTO folders (name, user_id, parent_id) VALUES (?, ?, ?)',
        [name, user_id, normalizedParentId],
      );
      const insertId = requireInsertId(
        insertResult as MutationResult,
        '文件夹创建失败：无法获取插入ID',
      );
      const [createdRows] = await connection.execute(
        'SELECT * FROM folders WHERE id = ? AND user_id = ?',
        [insertId, user_id],
      );
      await connection.commit();
      return (createdRows as DbRow[])[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getFolderById(id: number) {
    const result = await this.query('SELECT * FROM folders WHERE id = ?', [id]);
    return (result.rows as DbRow[])[0];
  }

  async getOwnedFolderById(id: number, userId: number) {
    const result = await this.query(
      'SELECT * FROM folders WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return (result.rows as DbRow[])[0];
  }

  async getFoldersByUserId(userId: number) {
    const result = await this.query(
      `SELECT folder.*,
              (SELECT COUNT(*)
                 FROM user_prompt_folders relation
                WHERE relation.folder_id = folder.id) AS prompt_count
         FROM folders folder
        WHERE folder.user_id = ?
        ORDER BY folder.created_at DESC, folder.id DESC`,
      [userId],
    );
    return result.rows as DbRow[];
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

  // 用户统计相关方法
  async createUserStats(userId: number) {
    await this.assertSchemaReady()
    const result = await this.query(
      'INSERT IGNORE INTO user_usage_stats (user_id) VALUES (?)',
      [userId]
    );
    return (result.rows as DbRow[])[0];
  }

  async getUserStats(userId: number) {
    await this.assertSchemaReady()
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
    const now = new Date()
    const today = formatLocalDate(now)
    const monthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const nextMonthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))
    const optimizeInc = aiMode === 'ai_generate' ? 0 : 1
    const generateInc = aiMode === 'ai_generate' ? 1 : 0
    await this.assertSchemaReady()

    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('INSERT IGNORE INTO user_usage_stats (user_id) VALUES (?)', [userId])
      await connection.execute(
        `INSERT INTO ai_usage_daily (user_id, usage_date, optimize_count, generate_count, total_count)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           optimize_count = optimize_count + VALUES(optimize_count),
           generate_count = generate_count + VALUES(generate_count),
           total_count = total_count + 1`,
        [userId, today, optimizeInc, generateInc]
      )
      await connection.execute(
        `UPDATE user_usage_stats
         SET ai_optimize_count = ai_optimize_count + ?,
             ai_generate_count = ai_generate_count + ?,
             total_ai_usage = total_ai_usage + 1,
             monthly_usage = (
               SELECT COALESCE(SUM(total_count), 0)
               FROM ai_usage_daily
               WHERE user_id = ? AND usage_date >= ? AND usage_date < ?
             ),
             last_reset_date = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [optimizeInc, generateInc, userId, monthStart, nextMonthStart, monthStart, userId]
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async reserveAIUsage(
    userId: number,
    aiMode: 'ai_optimize' | 'ai_generate' = 'ai_optimize',
    monthlyLimit = -1,
  ): Promise<{ allowed: boolean; monthlyUsage: number; usageDate: string }> {
    const now = new Date()
    const today = formatLocalDate(now)
    const monthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const nextMonthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))
    const optimizeInc = aiMode === 'ai_generate' ? 0 : 1
    const generateInc = aiMode === 'ai_generate' ? 1 : 0
    await this.assertSchemaReady()

    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('INSERT IGNORE INTO user_usage_stats (user_id) VALUES (?)', [userId])
      await connection.execute('SELECT id FROM user_usage_stats WHERE user_id = ? FOR UPDATE', [userId])

      const [usageRows] = await connection.execute(
        `SELECT COALESCE(SUM(total_count), 0) AS monthly_usage
         FROM ai_usage_daily
         WHERE user_id = ? AND usage_date >= ? AND usage_date < ?`,
        [userId, monthStart, nextMonthStart]
      )
      const currentUsage = Number((usageRows as Array<{ monthly_usage?: number | string }>)[0]?.monthly_usage) || 0

      if (monthlyLimit >= 0 && currentUsage >= monthlyLimit) {
        await connection.commit()
        return { allowed: false, monthlyUsage: currentUsage, usageDate: today }
      }

      await connection.execute(
        `INSERT INTO ai_usage_daily (user_id, usage_date, optimize_count, generate_count, total_count)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           optimize_count = optimize_count + VALUES(optimize_count),
           generate_count = generate_count + VALUES(generate_count),
           total_count = total_count + 1`,
        [userId, today, optimizeInc, generateInc]
      )
      await connection.execute(
        `UPDATE user_usage_stats
         SET ai_optimize_count = ai_optimize_count + ?,
             ai_generate_count = ai_generate_count + ?,
             total_ai_usage = total_ai_usage + 1,
             monthly_usage = ?,
             last_reset_date = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [optimizeInc, generateInc, currentUsage + 1, monthStart, userId]
      )
      await connection.commit()
      return { allowed: true, monthlyUsage: currentUsage + 1, usageDate: today }
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async rollbackAIUsage(
    userId: number,
    aiMode: 'ai_optimize' | 'ai_generate' = 'ai_optimize',
    usageDate?: string,
  ) {
    const now = new Date()
    const today = formatLocalDate(now)
    const monthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))
    const nextMonthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 1))
    const optimizeDec = aiMode === 'ai_generate' ? 0 : 1
    const generateDec = aiMode === 'ai_generate' ? 1 : 0
    await this.assertSchemaReady()

    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('INSERT IGNORE INTO user_usage_stats (user_id) VALUES (?)', [userId])
      await connection.execute('SELECT id FROM user_usage_stats WHERE user_id = ? FOR UPDATE', [userId])
      const [dailyResult] = await connection.execute(
        `UPDATE ai_usage_daily
         SET optimize_count = GREATEST(optimize_count - ?, 0),
             generate_count = GREATEST(generate_count - ?, 0),
             total_count = GREATEST(total_count - 1, 0)
         WHERE user_id = ? AND usage_date = ?
           AND total_count > 0
           AND ((? = 1 AND optimize_count > 0) OR (? = 1 AND generate_count > 0))`,
        [optimizeDec, generateDec, userId, usageDate || today, optimizeDec, generateDec]
      )

      if (Number((dailyResult as { affectedRows?: number }).affectedRows) > 0) {
        const [usageRows] = await connection.execute(
          `SELECT COALESCE(SUM(total_count), 0) AS monthly_usage
           FROM ai_usage_daily
           WHERE user_id = ? AND usage_date >= ? AND usage_date < ?`,
          [userId, monthStart, nextMonthStart]
        )
        const monthlyUsage = Number((usageRows as Array<{ monthly_usage?: number | string }>)[0]?.monthly_usage) || 0
        await connection.execute(
          `UPDATE user_usage_stats
           SET ai_optimize_count = GREATEST(ai_optimize_count - ?, 0),
               ai_generate_count = GREATEST(ai_generate_count - ?, 0),
               total_ai_usage = GREATEST(total_ai_usage - 1, 0),
               monthly_usage = ?,
               last_reset_date = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [optimizeDec, generateDec, monthlyUsage, monthStart, userId]
        )
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
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
    return (result.rows as DbRow[])[0];
  }

  async getTags() {
    const result = await this.query('SELECT * FROM tags ORDER BY name ASC');
    return result.rows as DbRow[];
  }

  async addUserPromptTags(promptId: number, tagNames: string[]) {
    for (const tagName of normalizePromptTagNames(tagNames)) {
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
    for (const tagName of normalizePromptTagNames(tagNames)) {
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
      `UPDATE public_prompts SET views_count = views_count + 1 WHERE id = ? AND publication_state = 'published'`,
      [id]
    );
  }

  // 文件夹提示词统计
  async getFolderPromptCount(folderId: number): Promise<number> {
    const result = await this.query(
      `SELECT COUNT(*) as count FROM user_prompt_folders upf
       JOIN user_prompts up ON upf.user_prompt_id = up.id
       JOIN folders f ON upf.folder_id = f.id
       WHERE upf.folder_id = ? AND up.user_id = f.user_id`,
      [folderId]
    );
    return Number((result.rows as DbRow[])[0]?.count) || 0;
  }

  // 公共文件夹相关方法
  async publishOwnedFolderSnapshot(folderId: number, userId: number, description: string) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [folderRows] = await connection.execute(
        `SELECT id, name
           FROM folders
          WHERE id = ? AND user_id = ?
          FOR UPDATE`,
        [folderId, userId]
      );
      const sourceFolder = (folderRows as DbRow[])[0];
      if (!sourceFolder) {
        await connection.rollback();
        return null;
      }

      // Lock the membership range so an explicit publish observes one coherent set. Any
      // private edit after this transaction commits remains private until the next publish.
      await connection.execute(
        `SELECT membership.user_prompt_id
           FROM user_prompt_folders membership
           JOIN user_prompts prompt
             ON prompt.id = membership.user_prompt_id
            AND prompt.user_id = ?
          WHERE membership.folder_id = ?
          ORDER BY membership.created_at ASC, membership.user_prompt_id ASC
          FOR UPDATE`,
        [userId, folderId]
      );

      const [upsertResult] = await connection.execute(
        `INSERT INTO public_folders (name, description, user_id, original_folder_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           name = VALUES(name),
           description = VALUES(description),
           updated_at = CURRENT_TIMESTAMP`,
        [String(sourceFolder.name || ''), description, userId, folderId]
      );
      let publicFolderId = Number((upsertResult as MutationResult).insertId);
      if (!Number.isSafeInteger(publicFolderId) || publicFolderId <= 0) {
        const [publishedRows] = await connection.execute(
          `SELECT id
             FROM public_folders
            WHERE user_id = ? AND original_folder_id = ?
            FOR UPDATE`,
          [userId, folderId]
        );
        publicFolderId = Number((publishedRows as DbRow[])[0]?.id);
      }
      if (!Number.isSafeInteger(publicFolderId) || publicFolderId <= 0) {
        throw new Error('Public folder upsert did not return a valid identifier');
      }

      await connection.execute(
        'DELETE FROM public_folder_prompts WHERE public_folder_id = ?',
        [publicFolderId]
      );
      await connection.execute(
        `INSERT INTO public_folder_prompts
           (public_folder_id, source_prompt_id, title, content, description,
            author_id, author_name, author_avatar_url,
            category_id, category_name, category_color,
            editor_mode, payload, schema_version, tags, position,
            source_created_at, source_updated_at)
         SELECT ?,
                prompt.id,
                prompt.title,
                prompt.content,
                prompt.description,
                prompt.user_id,
                author.username,
                author.avatar_url,
                prompt.category_id,
                category.name,
                category.color,
                prompt.editor_mode,
                prompt.payload,
                prompt.schema_version,
                COALESCE((
                  SELECT JSON_ARRAYAGG(tag.name)
                    FROM user_prompt_tags prompt_tag
                    JOIN tags tag ON tag.id = prompt_tag.tag_id
                   WHERE prompt_tag.user_prompt_id = prompt.id
                ), JSON_ARRAY()),
                ROW_NUMBER() OVER (
                  ORDER BY membership.created_at ASC, prompt.id ASC
                ) - 1,
                prompt.created_at,
                prompt.updated_at
           FROM user_prompt_folders membership
           JOIN user_prompts prompt
             ON prompt.id = membership.user_prompt_id
            AND prompt.user_id = ?
           JOIN users author ON author.id = prompt.user_id
           LEFT JOIN categories category ON category.id = prompt.category_id
          WHERE membership.folder_id = ?`,
        [publicFolderId, userId, folderId]
      );

      const [publishedRows] = await connection.execute(
        `SELECT published.*, author.username AS author,
                (SELECT COUNT(*)
                   FROM public_folder_prompts snapshot
                  WHERE snapshot.public_folder_id = published.id) AS prompt_count
           FROM public_folders published
           JOIN users author ON author.id = published.user_id
          WHERE published.id = ?`,
        [publicFolderId]
      );
      await connection.commit();
      return (publishedRows as DbRow[])[0] || null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPublicFolderById(id: number) {
    const result = await this.query(
      `SELECT published.*, author.username AS author,
              (SELECT COUNT(*)
                 FROM public_folder_prompts snapshot
                WHERE snapshot.public_folder_id = published.id) AS prompt_count
         FROM public_folders published
         JOIN users author ON author.id = published.user_id
        WHERE published.id = ?`,
      [id]
    );
    return (result.rows as DbRow[])[0];
  }

  async getPublicFolderPrompts(folderId: number, options: { limit: number; offset: number }) {
    const [result, countResult] = await Promise.all([
      this.query(
      `SELECT snapshot.id,
              snapshot.id AS snapshot_id,
              snapshot.source_prompt_id,
              snapshot.title,
              LEFT(snapshot.content, ${MAX_FOLDER_PROMPT_CONTENT_CHARS}) AS content,
              (CHAR_LENGTH(snapshot.content) > ${MAX_FOLDER_PROMPT_CONTENT_CHARS}) AS content_is_truncated,
              snapshot.description,
              snapshot.author_id,
              snapshot.author_name AS author,
              snapshot.author_avatar_url AS avatar_url,
              snapshot.category_id,
              snapshot.category_name AS category,
              snapshot.category_color,
              snapshot.editor_mode,
              snapshot.payload,
              snapshot.schema_version,
              snapshot.tags,
              0 AS views_count,
              0 AS favorites_count,
              0 AS is_featured,
              COALESCE(snapshot.source_created_at, snapshot.created_at) AS created_at,
              COALESCE(snapshot.source_updated_at, snapshot.updated_at) AS updated_at
        FROM public_folder_prompts snapshot
        WHERE snapshot.public_folder_id = ?
        ORDER BY snapshot.position ASC, snapshot.id ASC
        LIMIT ? OFFSET ?`,
      [folderId, options.limit, options.offset]
      ),
      this.query(
        'SELECT COUNT(*) AS total FROM public_folder_prompts WHERE public_folder_id = ?',
        [folderId],
      ),
    ]);
    return {
      items: result.rows as DbRow[],
      total: Number((countResult.rows as DbRow[])[0]?.total) || 0,
    };
  }

  async addPublicFolderSnapshotPrompt(publicFolderId: number, sourcePromptId: number) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [folderRows] = await connection.execute(
        'SELECT id FROM public_folders WHERE id = ? FOR UPDATE',
        [publicFolderId]
      );
      if ((folderRows as DbRow[]).length === 0) {
        await connection.rollback();
        return { status: 'folder_not_found' as const };
      }

      const [existingRows] = await connection.execute(
        `SELECT id
           FROM public_folder_prompts
          WHERE public_folder_id = ? AND source_prompt_id = ?
          FOR UPDATE`,
        [publicFolderId, sourcePromptId]
      );
      if ((existingRows as DbRow[]).length > 0) {
        await connection.rollback();
        return { status: 'already_exists' as const };
      }

      const [promptRows] = await connection.execute(
        `SELECT prompt.*,
                author.username AS author_name,
                author.avatar_url AS author_avatar_url,
                category.name AS category_name,
                category.color AS category_color
           FROM user_prompts prompt
           JOIN users author ON author.id = prompt.user_id
           LEFT JOIN categories category ON category.id = prompt.category_id
          WHERE prompt.id = ?
          FOR UPDATE`,
        [sourcePromptId]
      );
      const prompt = (promptRows as DbRow[])[0];
      if (!prompt) {
        await connection.rollback();
        return { status: 'prompt_not_found' as const };
      }

      const [tagRows] = await connection.execute(
        `SELECT tag.name
           FROM user_prompt_tags prompt_tag
           JOIN tags tag ON tag.id = prompt_tag.tag_id
          WHERE prompt_tag.user_prompt_id = ?
          ORDER BY tag.name ASC`,
        [sourcePromptId]
      );
      const [positionRows] = await connection.execute(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
           FROM public_folder_prompts
          WHERE public_folder_id = ?`,
        [publicFolderId]
      );
      const payload = prompt.payload == null
        ? null
        : typeof prompt.payload === 'string'
          ? prompt.payload
          : JSON.stringify(prompt.payload);
      const tags = JSON.stringify((tagRows as DbRow[]).map(row => String(row.name)));
      const [insertResult] = await connection.execute(
        `INSERT INTO public_folder_prompts
           (public_folder_id, source_prompt_id, title, content, description,
            author_id, author_name, author_avatar_url,
            category_id, category_name, category_color,
            editor_mode, payload, schema_version, tags, position,
            source_created_at, source_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          publicFolderId,
          sourcePromptId,
          String(prompt.title || ''),
          String(prompt.content || ''),
          prompt.description == null ? null : String(prompt.description),
          Number(prompt.user_id),
          String(prompt.author_name || ''),
          prompt.author_avatar_url == null ? null : String(prompt.author_avatar_url),
          prompt.category_id == null ? null : Number(prompt.category_id),
          prompt.category_name == null ? null : String(prompt.category_name),
          prompt.category_color == null ? null : String(prompt.category_color),
          prompt.editor_mode === 'professional' ? 'professional' : 'normal',
          payload,
          Number(prompt.schema_version) || 1,
          tags,
          Number((positionRows as DbRow[])[0]?.next_position) || 0,
          prompt.created_at as Date | string,
          prompt.updated_at as Date | string,
        ]
      );
      const snapshotId = requireInsertId(
        insertResult as MutationResult,
        'Snapshot prompt insert did not return a valid identifier'
      );
      const [snapshotRows] = await connection.execute(
        'SELECT * FROM public_folder_prompts WHERE id = ? AND public_folder_id = ?',
        [snapshotId, publicFolderId]
      );
      await connection.commit();
      return { status: 'created' as const, prompt: (snapshotRows as DbRow[])[0] };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async removePublicFolderSnapshotPrompt(publicFolderId: number, snapshotId: number) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [folderRows] = await connection.execute(
        'SELECT id FROM public_folders WHERE id = ? FOR UPDATE',
        [publicFolderId]
      );
      if ((folderRows as DbRow[]).length === 0) {
        await connection.rollback();
        return 'folder_not_found' as const;
      }
      const [deleteResult] = await connection.execute(
        'DELETE FROM public_folder_prompts WHERE id = ? AND public_folder_id = ?',
        [snapshotId, publicFolderId]
      );
      await connection.commit();
      return Number((deleteResult as MutationResult).affectedRows) === 1
        ? 'removed' as const
        : 'prompt_not_found' as const;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async importPublicFolderSnapshotPrompt(publicFolderId: number, snapshotId: number, userId: number) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.enforceResourceCreationLimit(connection, userId, 'prompt');
      const [snapshotRows] = await connection.execute(
        `SELECT snapshot.*
           FROM public_folder_prompts snapshot
           JOIN public_folders published ON published.id = snapshot.public_folder_id
          WHERE snapshot.id = ? AND snapshot.public_folder_id = ?
          FOR UPDATE`,
        [snapshotId, publicFolderId]
      );
      const snapshot = (snapshotRows as DbRow[])[0];
      if (!snapshot) {
        await connection.rollback();
        return { status: 'snapshot_not_found' as const };
      }

      const [folderRows] = await connection.execute(
        `SELECT id
           FROM folders
          WHERE user_id = ?
          ORDER BY created_at ASC, id ASC
          LIMIT 1
          FOR UPDATE`,
        [userId]
      );
      const targetFolderId = Number((folderRows as DbRow[])[0]?.id);
      if (!Number.isSafeInteger(targetFolderId) || targetFolderId <= 0) {
        await connection.rollback();
        return { status: 'folder_not_found' as const };
      }

      let categoryId: number | null = null;
      const snapshotCategoryId = Number(snapshot.category_id);
      if (Number.isSafeInteger(snapshotCategoryId) && snapshotCategoryId > 0) {
        const [categoryRows] = await connection.execute(
          'SELECT id FROM categories WHERE id = ? FOR UPDATE',
          [snapshotCategoryId]
        );
        if ((categoryRows as DbRow[]).length > 0) categoryId = snapshotCategoryId;
      }

      const importedTitle = `[导入] ${String(snapshot.title || '')}`;
      const editorState = withPromptEditorTitle(
        resolveStoredPromptEditorState(snapshot),
        importedTitle
      );
      const [insertResult] = await connection.execute(
        `INSERT INTO user_prompts
          (title, content, description, user_id, folder_id, category_id,
           mode, editor_mode, payload, schema_version, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          promptEditorTitle(editorState),
          composePromptEditorContent(editorState),
          snapshot.description == null ? null : String(snapshot.description),
          userId,
          targetFolderId,
          categoryId,
          editorState.editor_mode,
          editorState.editor_mode,
          serializePromptEditorPayload(editorState),
          editorState.schema_version,
        ]
      );
      const promptId = requireInsertId(
        insertResult as MutationResult,
        'Imported snapshot prompt did not return a valid identifier'
      );
      await connection.execute(
        'INSERT INTO user_prompt_folders (user_prompt_id, folder_id) VALUES (?, ?)',
        [promptId, targetFolderId]
      );

      let parsedTags: unknown = snapshot.tags;
      if (typeof parsedTags === 'string') {
        try {
          parsedTags = JSON.parse(parsedTags);
        } catch {
          parsedTags = [];
        }
      }
      const tagNames = Array.isArray(parsedTags)
        ? [...new Set(parsedTags
          .filter((tag): tag is string => typeof tag === 'string')
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 50))].slice(0, 50)
        : [];
      for (const tagName of tagNames) {
        await connection.execute('INSERT IGNORE INTO tags (name) VALUES (?)', [tagName]);
        const [tagRows] = await connection.execute('SELECT id FROM tags WHERE name = ?', [tagName]);
        const tagId = Number((tagRows as DbRow[])[0]?.id);
        if (Number.isSafeInteger(tagId) && tagId > 0) {
          await connection.execute(
            'INSERT IGNORE INTO user_prompt_tags (user_prompt_id, tag_id) VALUES (?, ?)',
            [promptId, tagId]
          );
        }
      }

      const [createdRows] = await connection.execute(
        `SELECT prompt.*, author.username, author.avatar_url
           FROM user_prompts prompt
           JOIN users author ON author.id = prompt.user_id
          WHERE prompt.id = ? AND prompt.user_id = ?`,
        [promptId, userId]
      );
      await connection.commit();
      return { status: 'created' as const, prompt: (createdRows as DbRow[])[0] };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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

    const insertId = requireInsertId(result.rows as MutationResult, '导入文件夹创建失败：无法获取插入ID');
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
    const result = await this.query(
      `SELECT snapshot.id,
              snapshot.id AS snapshot_id,
              snapshot.source_prompt_id,
              snapshot.title,
              snapshot.content,
              snapshot.description,
              snapshot.author_id AS user_id,
              snapshot.author_name AS username,
              snapshot.author_avatar_url AS avatar_url,
              snapshot.category_id,
              snapshot.category_name,
              snapshot.category_color,
              snapshot.editor_mode,
              snapshot.payload,
              snapshot.schema_version,
              snapshot.tags,
              COALESCE(snapshot.source_created_at, snapshot.created_at) AS created_at,
              COALESCE(snapshot.source_updated_at, snapshot.updated_at) AS updated_at
         FROM user_imported_folders imported
         JOIN public_folder_prompts snapshot
           ON snapshot.public_folder_id = imported.public_folder_id
        WHERE imported.id = ?
        ORDER BY snapshot.position ASC, snapshot.id ASC`,
      [importedFolderId]
    );
    
    return result.rows as DbRow[];
  }

  async deleteUserImportedFolder(folderId: number, userId: number) {
    try {
      const result = await this.query(
        'DELETE FROM user_imported_folders WHERE id = ? AND user_id = ?',
        [folderId, userId]
      );
      return Number((result.rows as MutationResult).affectedRows) > 0;
    } catch (error) {
      console.error('删除用户导入文件夹失败', mysqlErrorMetadata(error));
      return false;
    }
  }

  async getImportedFolderPromptCount(importedFolderId: number): Promise<number> {
    const result = await this.query(
      `SELECT COUNT(snapshot.id) AS count
         FROM user_imported_folders imported
         LEFT JOIN public_folder_prompts snapshot
           ON snapshot.public_folder_id = imported.public_folder_id
        WHERE imported.id = ?`,
      [importedFolderId]
    );
    
    return Number((result.rows as DbRow[])[0]?.count) || 0;
  }

  // ===== 版本历史相关方法 =====

  async restoreOwnedPromptVersion(promptId: number, versionId: number, userId: number) {
    await this.assertSchemaReady();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [promptRows] = await connection.execute(
        `SELECT *
           FROM user_prompts
          WHERE id = ? AND user_id = ?
          FOR UPDATE`,
        [promptId, userId]
      );
      const current = (promptRows as DbRow[])[0];
      if (!current) {
        await connection.rollback();
        return null;
      }

      const [versionRows] = await connection.execute(
        `SELECT *
           FROM prompt_versions
          WHERE id = ? AND prompt_id = ? AND user_id = ?
          FOR UPDATE`,
        [versionId, promptId, userId]
      );
      const version = (versionRows as DbRow[])[0];
      if (!version) {
        await connection.rollback();
        return null;
      }

      const currentState = withPromptEditorTitle(
        resolveStoredPromptEditorState(current),
        String(current.title || ''),
      );
      const targetState = withPromptEditorTitle(
        resolveStoredPromptEditorState(version),
        String(version.title || ''),
      );
      const [maxVersionRows] = await connection.execute(
        'SELECT COALESCE(MAX(version_number), 0) AS max_version FROM prompt_versions WHERE prompt_id = ?',
        [promptId]
      );
      const nextVersion = (Number((maxVersionRows as DbRow[])[0]?.max_version) || 0) + 1;

      await connection.execute(
        `INSERT INTO prompt_versions
          (prompt_id, user_id, title, content, version_number, change_summary, editor_mode, payload, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          promptId,
          userId,
          String(current.title || ''),
          String(current.content || ''),
          nextVersion,
          '恢复前自动备份',
          currentState.editor_mode,
          serializePromptEditorPayload(currentState),
          currentState.schema_version,
        ]
      );

      await connection.execute(
        `UPDATE user_prompts
            SET title = ?,
                content = ?,
                mode = ?,
                editor_mode = ?,
                payload = ?,
                schema_version = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?`,
        [
          String(version.title || ''),
          String(version.content || ''),
          targetState.editor_mode,
          targetState.editor_mode,
          serializePromptEditorPayload(targetState),
          targetState.schema_version,
          promptId,
          userId,
        ]
      );

      const [updatedRows] = await connection.execute(
        `SELECT up.*, u.username, u.avatar_url
           FROM user_prompts up
           JOIN users u ON up.user_id = u.id
          WHERE up.id = ? AND up.user_id = ?`,
        [promptId, userId]
      );
      await connection.commit();
      return (updatedRows as DbRow[])[0] || null;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPromptVersions(promptId: number) {
    const result = await this.query(
      `SELECT id, prompt_id, user_id, title, version_number, change_summary,
              editor_mode, schema_version, created_at
         FROM prompt_versions
        WHERE prompt_id = ?
        ORDER BY version_number DESC`,
      [promptId]
    );
    return result.rows as DbRow[];
  }

  async getPromptVersion(versionId: number) {
    const result = await this.query(
      'SELECT * FROM prompt_versions WHERE id = ?',
      [versionId]
    );
    return (result.rows as PromptVersionRow[])[0] || null;
  }

  async getPromptVersionByNumber(promptId: number, versionNumber: number) {
    const result = await this.query(
      'SELECT * FROM prompt_versions WHERE prompt_id = ? AND version_number = ?',
      [promptId, versionNumber]
    );
    return (result.rows as PromptVersionRow[])[0] || null;
  }

  // ===== 全局搜索相关方法 =====

  async globalSearch(userId: number, keyword: string, options?: { page?: number; limit?: number }) {
    const requestedPage = Number(options?.page ?? 1);
    const requestedLimit = Number(options?.limit ?? 20);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 20;
    const offset = (page - 1) * limit;
    const searchTerm = `%${keyword}%`;

    // 搜索用户自己的提示词 (inline LIMIT/OFFSET to avoid prepared statement issues)
    const userPromptsResult = await this.query(
      `SELECT id, title,
              LEFT(content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
              (CHAR_LENGTH(content) > ${PROMPT_LIST_PREVIEW_CHARS}) AS content_is_truncated,
              folder_id, created_at, updated_at, 'user_prompt' as source_type
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
      `SELECT pp.id, pp.title,
              LEFT(pp.content, ${PROMPT_LIST_PREVIEW_CHARS}) AS content,
              (CHAR_LENGTH(pp.content) > ${PROMPT_LIST_PREVIEW_CHARS}) AS content_is_truncated,
              pp.author_id, u.username as author, pp.created_at, pp.updated_at, 'public_prompt' as source_type
       FROM public_prompts pp
       LEFT JOIN users u ON pp.author_id = u.id
       WHERE pp.publication_state = 'published' AND (pp.title LIKE ? OR pp.content LIKE ?)
       ORDER BY pp.updated_at DESC
       LIMIT ? OFFSET ?`,
      [searchTerm, searchTerm, limit, offset]
    );

    const publicPromptsCountResult = await this.query(
      `SELECT COUNT(*) as total FROM public_prompts WHERE publication_state = 'published' AND (title LIKE ? OR content LIKE ?)`,
      [searchTerm, searchTerm]
    );

    // 搜索用户文件夹
    const foldersResult = await this.query(
      `SELECT id, name, created_at, 'folder' as source_type
       FROM folders
       WHERE user_id = ? AND name LIKE ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId, searchTerm]
    );

    return {
      userPrompts: {
        items: userPromptsResult.rows as DbRow[],
        total: Number((userPromptsCountResult.rows as DbRow[])[0]?.total) || 0
      },
      publicPrompts: {
        items: publicPromptsResult.rows as DbRow[],
        total: Number((publicPromptsCountResult.rows as DbRow[])[0]?.total) || 0
      },
      folders: {
        items: foldersResult.rows as DbRow[]
      }
    };
  }
}

// 防止 Next.js HMR 重复创建连接池导致 "Too many connections"
const globalForDb = globalThis as unknown as { __mysqlDb?: MySQLDB; __mysqlDbVersion?: number }

const shouldReuseDb =
  globalForDb.__mysqlDb &&
  globalForDb.__mysqlDbVersion === MYSQL_DB_INSTANCE_VERSION &&
  typeof globalForDb.__mysqlDb.assertSchemaReady === 'function'

const db = shouldReuseDb ? globalForDb.__mysqlDb as MySQLDB : new MySQLDB()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__mysqlDb = db
  globalForDb.__mysqlDbVersion = MYSQL_DB_INSTANCE_VERSION
}

export default db;
