'use strict'

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function quoteIdentifier(identifier) {
  if (!SAFE_IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe MySQL identifier: ${identifier}`)
  }
  return `\`${identifier}\``
}

module.exports = {
  description: 'Materialize public folder prompts as durable publication snapshots',

  async up(ctx) {
    // Older releases allowed the same private folder to be published repeatedly. Consolidate
    // those rows before adding the key used by the transactional publish upsert.
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_public_folder_duplicates')
    await ctx.exec(
      `CREATE TEMPORARY TABLE tmp_public_folder_duplicates AS
       SELECT candidate.id AS duplicate_id, canonical.canonical_id
         FROM public_folders candidate
         JOIN (
           SELECT user_id, original_folder_id, MIN(id) AS canonical_id
             FROM public_folders
            WHERE original_folder_id IS NOT NULL
            GROUP BY user_id, original_folder_id
           HAVING COUNT(*) > 1
         ) canonical
           ON canonical.user_id = candidate.user_id
          AND canonical.original_folder_id = candidate.original_folder_id
        WHERE candidate.id <> canonical.canonical_id`
    )

    await ctx.exec(
      `INSERT IGNORE INTO user_imported_folders
         (user_id, public_folder_id, name, description, created_at, updated_at)
       SELECT imported.user_id,
              duplicate.canonical_id,
              imported.name,
              imported.description,
              imported.created_at,
              imported.updated_at
         FROM user_imported_folders imported
         JOIN tmp_public_folder_duplicates duplicate
           ON duplicate.duplicate_id = imported.public_folder_id`
    )
    await ctx.exec(
      `DELETE imported
         FROM user_imported_folders imported
         JOIN tmp_public_folder_duplicates duplicate
           ON duplicate.duplicate_id = imported.public_folder_id`
    )
    await ctx.exec(
      `UPDATE public_folders canonical
         JOIN (
           SELECT duplicate.canonical_id,
                  MAX(folder.is_featured) AS is_featured,
                  MAX(folder.updated_at) AS latest_update
             FROM tmp_public_folder_duplicates duplicate
             JOIN public_folders folder
               ON folder.id IN (duplicate.canonical_id, duplicate.duplicate_id)
            GROUP BY duplicate.canonical_id
         ) merged ON merged.canonical_id = canonical.id
          SET canonical.is_featured = merged.is_featured,
              canonical.updated_at = GREATEST(canonical.updated_at, merged.latest_update)`
    )
    await ctx.exec(
      `DELETE duplicate_folder
         FROM public_folders duplicate_folder
         JOIN tmp_public_folder_duplicates duplicate
           ON duplicate.duplicate_id = duplicate_folder.id`
    )
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_public_folder_duplicates')

    await ctx.ensureIndex(
      'public_folders',
      'uq_public_folders_source',
      ['user_id', 'original_folder_id'],
      { unique: true }
    )

    // A publication owns its copied data. Deleting the private source only clears provenance;
    // it must not cascade-delete the already published folder.
    const [sourceForeignKeys] = await ctx.query(
      `SELECT DISTINCT CONSTRAINT_NAME
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'public_folders'
          AND COLUMN_NAME = 'original_folder_id'
          AND REFERENCED_TABLE_NAME = 'folders'`
    )
    for (const row of sourceForeignKeys) {
      await ctx.exec(
        `ALTER TABLE public_folders DROP FOREIGN KEY ${quoteIdentifier(String(row.CONSTRAINT_NAME))}`
      )
    }
    await ctx.modifyColumn('public_folders', 'original_folder_id', 'INT NULL')
    await ctx.ensureIndex('public_folders', 'idx_public_folders_original', ['original_folder_id'])
    await ctx.exec(
      `ALTER TABLE public_folders
       ADD CONSTRAINT fk_public_folders_original
       FOREIGN KEY (original_folder_id) REFERENCES folders(id) ON DELETE SET NULL`
    )

    await ctx.ensureTable('public_folder_prompts', `CREATE TABLE public_folder_prompts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      public_folder_id INT NOT NULL,
      source_prompt_id INT NULL,
      title VARCHAR(200) NOT NULL,
      content LONGTEXT NOT NULL,
      description TEXT NULL,
      author_id INT NULL,
      author_name VARCHAR(50) NOT NULL,
      author_avatar_url VARCHAR(500) NULL,
      category_id INT NULL,
      category_name VARCHAR(50) NULL,
      category_color VARCHAR(7) NULL,
      editor_mode ENUM('normal', 'professional') NOT NULL DEFAULT 'normal',
      payload JSON NULL,
      schema_version INT UNSIGNED NOT NULL DEFAULT 1,
      tags JSON NULL,
      position INT UNSIGNED NOT NULL DEFAULT 0,
      source_created_at TIMESTAMP NULL,
      source_updated_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_public_folder_prompt_source (public_folder_id, source_prompt_id),
      UNIQUE INDEX uq_public_folder_prompt_position (public_folder_id, position),
      INDEX idx_public_folder_prompts_source (source_prompt_id),
      INDEX idx_public_folder_prompts_author (author_id),
      CONSTRAINT fk_public_folder_prompts_folder FOREIGN KEY (public_folder_id) REFERENCES public_folders(id) ON DELETE CASCADE,
      CONSTRAINT fk_public_folder_prompts_source FOREIGN KEY (source_prompt_id) REFERENCES user_prompts(id) ON DELETE SET NULL,
      CONSTRAINT fk_public_folder_prompts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    // Existing publications become a one-time snapshot of their current valid memberships.
    // Subsequent private edits are deliberately disconnected from this table.
    await ctx.exec(
      `INSERT IGNORE INTO public_folder_prompts
         (public_folder_id, source_prompt_id, title, content, description,
          author_id, author_name, author_avatar_url,
          category_id, category_name, category_color,
          editor_mode, payload, schema_version, tags, position,
          source_created_at, source_updated_at)
       SELECT published.id,
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
                PARTITION BY published.id
                ORDER BY membership.created_at ASC, prompt.id ASC
              ) - 1,
              prompt.created_at,
              prompt.updated_at
         FROM public_folders published
         JOIN folders source_folder
           ON source_folder.id = published.original_folder_id
          AND source_folder.user_id = published.user_id
         JOIN user_prompt_folders membership
           ON membership.folder_id = source_folder.id
         JOIN user_prompts prompt
           ON prompt.id = membership.user_prompt_id
          AND prompt.user_id = source_folder.user_id
         JOIN users author ON author.id = prompt.user_id
         LEFT JOIN categories category ON category.id = prompt.category_id`
    )
  },
}
