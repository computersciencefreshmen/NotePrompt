'use strict'

const crypto = require('node:crypto')
const catalogManifest = require('./008_curated_catalog_manifest.json')

function normalizeLegacyTimestamp(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(value)
  if (!match) throw new Error(`Invalid curated catalog timestamp: ${value}`)
  return `${match[1]} ${match[2]}.000`
}

function validateManifest(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Curated catalog manifest must contain entries')
  }

  const ids = new Set()
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.catalogId) || entry.catalogId <= 0) {
      throw new Error(`Invalid curated catalog ID: ${entry.catalogId}`)
    }
    if (ids.has(entry.catalogId)) {
      throw new Error(`Duplicate curated catalog ID: ${entry.catalogId}`)
    }
    if (!/^[a-f0-9]{64}$/.test(entry.contentSha256)) {
      throw new Error(`Invalid curated content fingerprint for ${entry.catalogId}`)
    }
    if (!Number.isSafeInteger(entry.initialViews) || entry.initialViews < 0) {
      throw new Error(`Invalid initial view count for ${entry.catalogId}`)
    }
    normalizeLegacyTimestamp(entry.legacyPublishedAt)
    ids.add(entry.catalogId)
  }
}

function comparableTimestamp(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 19)
  return String(value).replace('T', ' ').replace(/Z$/, '').slice(0, 19)
}

function legacyRowFingerprint(row) {
  return crypto.createHash('sha256')
    .update(
      [row.title, row.content, row.description || ''].join(String.fromCharCode(31)),
      'utf8'
    )
    .digest('hex')
}

function isVerifiedLegacyCuratedRow(row, entry) {
  if (!row || !entry || Number(row.id) !== entry.catalogId) return false
  if (!(row.isFeatured === true || Number(row.isFeatured) === 1)) return false
  if (row.categoryId != null) return false
  const expectedTimestamp = comparableTimestamp(entry.legacyPublishedAt)
  const utc8Timestamp = comparableTimestamp(
    new Date(new Date(entry.legacyPublishedAt).getTime() + 8 * 60 * 60 * 1_000)
  )
  const rowCreatedAt = comparableTimestamp(row.createdAt)
  return rowCreatedAt === comparableTimestamp(row.updatedAt)
    && (rowCreatedAt === expectedTimestamp || rowCreatedAt === utc8Timestamp)
    && legacyRowFingerprint(row) === entry.contentSha256
}

module.exports = {
  description: 'Separate curated catalog identity, metrics, and favorites from user publications',
  integrityFiles: ['./008_curated_catalog_manifest.json'],

  async up(ctx) {
    validateManifest(catalogManifest)

    await ctx.ensureTable('curated_catalog_entries', `CREATE TABLE curated_catalog_entries (
      catalog_id INT NOT NULL PRIMARY KEY,
      content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      legacy_published_at DATETIME(3) NOT NULL,
      views_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_curated_catalog_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('curated_prompt_favorites', `CREATE TABLE curated_prompt_favorites (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      catalog_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX uq_curated_prompt_favorite (user_id, catalog_id),
      INDEX idx_curated_prompt_favorites_catalog (catalog_id),
      INDEX idx_curated_prompt_favorites_created (created_at),
      CONSTRAINT fk_curated_prompt_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_curated_prompt_favorites_catalog FOREIGN KEY (catalog_id) REFERENCES curated_catalog_entries(catalog_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    await ctx.ensureTable('curated_prompt_legacy_rows', `CREATE TABLE curated_prompt_legacy_rows (
      catalog_id INT NOT NULL PRIMARY KEY,
      legacy_public_prompt_id INT NOT NULL,
      legacy_author_id INT NULL,
      content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      original_views_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
      original_created_at TIMESTAMP NULL,
      migrated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_curated_legacy_author (legacy_author_id),
      CONSTRAINT fk_curated_legacy_catalog FOREIGN KEY (catalog_id) REFERENCES curated_catalog_entries(catalog_id) ON DELETE RESTRICT,
      CONSTRAINT fk_curated_legacy_author FOREIGN KEY (legacy_author_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

    const valueSql = catalogManifest.map(() => '(?, ?, ?, ?)').join(', ')
    const parameters = catalogManifest.flatMap(entry => [
      entry.catalogId,
      entry.contentSha256,
      normalizeLegacyTimestamp(entry.legacyPublishedAt),
      entry.initialViews,
    ])
    await ctx.exec(
      `INSERT INTO curated_catalog_entries
         (catalog_id, content_sha256, legacy_published_at, views_count)
       VALUES ${valueSql}
       ON DUPLICATE KEY UPDATE
         content_sha256 = VALUES(content_sha256),
         legacy_published_at = VALUES(legacy_published_at),
         views_count = GREATEST(curated_catalog_entries.views_count, VALUES(views_count))`,
      parameters
    )

    // Never infer catalog ownership from a numeric range. A high-ID user publication can
    // legitimately exist after the old AUTO_INCREMENT was advanced. Only rows that retain
    // every immutable characteristic of the legacy built-in insert are claimed.
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_verified_legacy_curated_prompts')
    await ctx.exec(
      `CREATE TEMPORARY TABLE tmp_verified_legacy_curated_prompts (
         catalog_id INT NOT NULL PRIMARY KEY
       ) ENGINE=MEMORY`
    )
    await ctx.exec(
      `INSERT INTO tmp_verified_legacy_curated_prompts (catalog_id)
       SELECT publication.id
         FROM public_prompts publication
         JOIN curated_catalog_entries catalog
           ON catalog.catalog_id = publication.id
        WHERE publication.is_featured = 1
          AND publication.category_id IS NULL
          AND publication.created_at = publication.updated_at
          AND (
            publication.created_at = catalog.legacy_published_at
            OR publication.created_at = DATE_ADD(catalog.legacy_published_at, INTERVAL 8 HOUR)
          )
          AND SHA2(
                CONCAT(
                  publication.title,
                  X'1F',
                  publication.content,
                  X'1F',
                  COALESCE(publication.description, '')
                ),
                256
              ) = catalog.content_sha256`
    )

    await ctx.exec(
      `INSERT INTO curated_prompt_legacy_rows
         (catalog_id, legacy_public_prompt_id, legacy_author_id, content_sha256,
          original_views_count, original_created_at)
       SELECT publication.id,
              publication.id,
              publication.author_id,
              catalog.content_sha256,
              publication.views_count,
              publication.created_at
         FROM public_prompts publication
         JOIN tmp_verified_legacy_curated_prompts verified
           ON verified.catalog_id = publication.id
         JOIN curated_catalog_entries catalog
           ON catalog.catalog_id = publication.id
       ON DUPLICATE KEY UPDATE
         legacy_public_prompt_id = VALUES(legacy_public_prompt_id),
         legacy_author_id = VALUES(legacy_author_id),
         content_sha256 = VALUES(content_sha256),
         original_views_count = GREATEST(curated_prompt_legacy_rows.original_views_count, VALUES(original_views_count)),
         original_created_at = VALUES(original_created_at)`
    )

    await ctx.exec(
      `UPDATE curated_catalog_entries catalog
         JOIN public_prompts publication
           ON publication.id = catalog.catalog_id
         JOIN tmp_verified_legacy_curated_prompts verified
           ON verified.catalog_id = publication.id
          SET catalog.views_count = GREATEST(catalog.views_count, publication.views_count)`
    )

    await ctx.exec(
      `INSERT INTO curated_prompt_favorites (user_id, catalog_id, created_at)
       SELECT favorite.user_id, favorite.public_prompt_id, favorite.created_at
         FROM user_favorites favorite
         JOIN tmp_verified_legacy_curated_prompts verified
           ON verified.catalog_id = favorite.public_prompt_id
       ON DUPLICATE KEY UPDATE
         created_at = LEAST(curated_prompt_favorites.created_at, VALUES(created_at))`
    )

    // Foreign-key cascades remove only the verified legacy row's old favorites and tag
    // links. Ambiguous or genuine high-ID publications are not selected and stay intact.
    await ctx.exec(
      `DELETE publication
         FROM public_prompts publication
         JOIN tmp_verified_legacy_curated_prompts verified
           ON verified.catalog_id = publication.id`
    )
    await ctx.exec('DROP TEMPORARY TABLE IF EXISTS tmp_verified_legacy_curated_prompts')

    // Deliberately do not reset public_prompts AUTO_INCREMENT. Existing high business IDs
    // remain valid, and every public query must treat them as ordinary publications.
  },

  _test: {
    normalizeLegacyTimestamp,
    isVerifiedLegacyCuratedRow,
    legacyRowFingerprint,
    validateManifest,
  },
}
