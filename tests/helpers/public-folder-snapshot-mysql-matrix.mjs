import assert from 'node:assert/strict'

import {
  PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL,
} from '../../src/lib/public-folder-snapshot-policy.ts'

export async function assertPublicFolderSnapshotVisibilityMatrix({
  connection,
  firstUserId,
  secondUserId,
  insertPrivatePrompt,
}) {
  const [categoryResult] = await connection.execute(
    `INSERT INTO categories (name, color)
     VALUES (?, ?)`,
    ['Origin matrix category', '#da7756']
  )
  const categoryId = Number(categoryResult.insertId)
  const [alternateCategoryResult] = await connection.execute(
    `INSERT INTO categories (name, color)
     VALUES (?, ?)`,
    ['Origin matrix alternate', '#141413']
  )
  const alternateCategoryId = Number(alternateCategoryResult.insertId)
  const tagNames = [
    'origin_matrix_alpha',
    'origin_matrix_beta',
    'origin_matrix_gamma',
  ]
  const tagIds = []
  for (const tagName of tagNames) {
    const [tagResult] = await connection.execute(
      `INSERT INTO tags (name, color)
       VALUES (?, ?)`,
      [tagName, '#da7756']
    )
    tagIds.push(Number(tagResult.insertId))
  }

  const [folderResult] = await connection.execute(
    `INSERT INTO public_folders
       (name, description, user_id, original_folder_id)
     VALUES (?, ?, ?, NULL)`,
    ['Origin visibility matrix', 'Runtime policy fixture', firstUserId]
  )
  const folderId = Number(folderResult.insertId)
  const title = 'Detached structured publication'
  const content = 'Exact byte-sensitive publication content'
  const description = 'Structured detached snapshot'
  const payload = JSON.stringify({
    system: 'strict',
    temperature: 0.2,
  })
  const tags = JSON.stringify(tagNames.slice(0, 2))
  const [publicationResult] = await connection.execute(
    `INSERT INTO public_prompts
       (source_prompt_id, title, content, description, author_id,
        category_id, publication_state, editor_mode, payload, schema_version)
     VALUES (NULL, ?, ?, ?, ?, ?, 'published', 'professional', ?, 3)`,
    [title, content, description, firstUserId, categoryId, payload]
  )
  const publicationId = Number(publicationResult.insertId)
  for (const tagId of tagIds.slice(0, 2)) {
    await connection.execute(
      `INSERT INTO public_prompt_tags (public_prompt_id, tag_id)
       VALUES (?, ?)`,
      [publicationId, tagId]
    )
  }

  const insertSnapshot = async ({
    origin,
    position,
    sourcePublicationId = null,
  }) => {
    const [result] = await connection.execute(
      `INSERT INTO public_folder_prompts
         (public_folder_id, source_prompt_id, source_public_prompt_id,
          snapshot_origin, title, content, description, author_id,
          author_name, author_avatar_url, category_id, category_name,
          category_color, editor_mode, payload, schema_version, tags,
          position, source_created_at, source_updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'professional',
               ?, 3, ?, ?, ?, ?)`,
      [
        folderId,
        sourcePublicationId,
        origin,
        title,
        content,
        description,
        firstUserId,
        'origin_matrix_author',
        'https://example.test/original-avatar.png',
        categoryId,
        'Origin matrix category',
        '#da7756',
        payload,
        tags,
        position,
        '2026-01-01 00:00:00',
        '2026-01-02 00:00:00',
      ]
    )
    return Number(result.insertId)
  }
  const readVisibleSnapshotIds = async () => {
    const [rows] = await connection.execute(
      `SELECT snapshot.id
         FROM public_folder_prompts snapshot
         JOIN public_folders published_folder
           ON published_folder.id = snapshot.public_folder_id
        WHERE snapshot.public_folder_id = ?
          AND ${PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL}
        ORDER BY snapshot.id`,
      [folderId]
    )
    return rows.map(row => Number(row.id))
  }
  const assertVisibility = async (snapshotId, expected, label) => {
    const visibleIds = await readVisibleSnapshotIds()
    assert.equal(
      visibleIds.includes(snapshotId),
      expected,
      `${label}; visible snapshot ids: ${visibleIds.join(', ')}`
    )
  }

  const ownerSnapshotId = await insertSnapshot({
    origin: 'folder_publication',
    position: 0,
  })
  await assertVisibility(
    ownerSnapshotId,
    true,
    'folder_publication is visible for its owning folder with no public reference'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET author_id = ? WHERE id = ?',
    [secondUserId, ownerSnapshotId]
  )
  await assertVisibility(
    ownerSnapshotId,
    false,
    'folder_publication cannot claim a snapshot owned by another user'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET author_id = ? WHERE id = ?',
    [firstUserId, ownerSnapshotId]
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET source_public_prompt_id = ? WHERE id = ?',
    [publicationId, ownerSnapshotId]
  )
  await assertVisibility(
    ownerSnapshotId,
    false,
    'folder_publication with a public reference is an invalid origin/reference pair'
  )
  await connection.execute(
    `UPDATE public_folder_prompts
        SET source_public_prompt_id = NULL,
            snapshot_origin = 'legacy_unverified'
      WHERE id = ?`,
    [ownerSnapshotId]
  )
  await assertVisibility(
    ownerSnapshotId,
    false,
    'legacy snapshots stay hidden even when their owner and payload look valid'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET source_public_prompt_id = ? WHERE id = ?',
    [publicationId, ownerSnapshotId]
  )
  await assertVisibility(
    ownerSnapshotId,
    false,
    'legacy snapshots stay hidden even when linked to a public publication'
  )
  await connection.execute(
    `UPDATE public_folder_prompts
        SET source_public_prompt_id = NULL,
            snapshot_origin = 'folder_publication'
      WHERE id = ?`,
    [ownerSnapshotId]
  )

  const moderatedSnapshotId = await insertSnapshot({
    origin: 'moderated_publication',
    position: 1,
  })
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'moderated_publication without a public primary-key reference is hidden'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET source_public_prompt_id = ? WHERE id = ?',
    [publicationId, moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'a source-null detached public publication can authorize a moderated snapshot'
  )

  const privateSourceId = await insertPrivatePrompt(
    firstUserId,
    'Private identity is not public identity',
    'Private source content can change independently'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET source_prompt_id = ? WHERE id = ?',
    [privateSourceId, moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'moderated snapshots cannot carry a private source reference'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET source_prompt_id = NULL WHERE id = ?',
    [moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'clearing the invalid private snapshot reference restores visibility'
  )

  await connection.execute(
    `UPDATE public_prompts
        SET publication_state = 'withdrawn'
      WHERE id = ?`,
    [publicationId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'withdrawing the referenced publication revokes snapshot visibility'
  )
  await connection.execute(
    `UPDATE public_prompts
        SET publication_state = 'published'
      WHERE id = ?`,
    [publicationId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'republishing an unchanged referenced publication restores visibility'
  )

  const stableFieldMutations = [
    ['title', 'Changed title', title],
    ['content', 'Changed content', content],
    ['description', 'Changed description', description],
    ['author_id', secondUserId, firstUserId],
    ['category_id', alternateCategoryId, categoryId],
    ['editor_mode', 'normal', 'professional'],
    ['payload', JSON.stringify({ system: 'changed' }), payload],
    ['schema_version', 4, 3],
  ]
  for (const [column, changedValue, originalValue] of stableFieldMutations) {
    await connection.execute(
      `UPDATE public_prompts SET ${column} = ? WHERE id = ?`,
      [changedValue, publicationId]
    )
    await assertVisibility(
      moderatedSnapshotId,
      false,
      `a mismatched ${column} invalidates the moderated snapshot`
    )
    await connection.execute(
      `UPDATE public_prompts SET ${column} = ? WHERE id = ?`,
      [originalValue, publicationId]
    )
    await assertVisibility(
      moderatedSnapshotId,
      true,
      `restoring ${column} restores the exact moderated snapshot`
    )
  }

  await connection.execute(
    `INSERT INTO public_prompt_tags (public_prompt_id, tag_id)
     VALUES (?, ?)`,
    [publicationId, tagIds[2]]
  )
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'adding an active public tag invalidates a stale snapshot tag set'
  )
  await connection.execute(
    `DELETE FROM public_prompt_tags
      WHERE public_prompt_id = ?
        AND tag_id = ?`,
    [publicationId, tagIds[2]]
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET tags = ? WHERE id = ?',
    [JSON.stringify([tagNames[0], tagNames[2]]), moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'a same-length but different snapshot tag set is hidden'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET tags = ? WHERE id = ?',
    [JSON.stringify([tagNames[1], tagNames[0]]), moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'tag order is not authorization data when the complete set matches'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET tags = ? WHERE id = ?',
    [JSON.stringify([tagNames[0], tagNames[0]]), moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'duplicating one tag cannot hide a missing required tag'
  )
  await connection.execute(
    'UPDATE public_folder_prompts SET tags = ? WHERE id = ?',
    [tags, moderatedSnapshotId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'restoring the complete tag set restores visibility'
  )

  await connection.execute(
    `UPDATE public_folder_prompts
        SET author_name = ?,
            author_avatar_url = ?,
            category_name = ?,
            category_color = ?,
            source_created_at = ?,
            source_updated_at = ?,
            created_at = ?,
            updated_at = ?
      WHERE id = ?`,
    [
      'Changed display author',
      'https://example.test/changed-avatar.png',
      'Changed display category',
      '#000000',
      '2025-01-01 00:00:00',
      '2025-01-02 00:00:00',
      '2025-01-03 00:00:00',
      '2025-01-04 00:00:00',
      moderatedSnapshotId,
    ]
  )
  await connection.execute(
    `UPDATE users
        SET username = ?,
            avatar_url = ?
      WHERE id = ?`,
    ['origin_matrix_display_author', 'https://example.test/user-avatar.png', firstUserId]
  )
  await connection.execute(
    `UPDATE categories
        SET name = ?,
            color = ?
      WHERE id = ?`,
    ['Origin matrix renamed category', '#111111', categoryId]
  )
  await connection.execute(
    `UPDATE public_prompts
        SET created_at = ?,
            updated_at = ?
      WHERE id = ?`,
    ['2024-01-01 00:00:00', '2024-01-02 00:00:00', publicationId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'display names, avatars, category presentation, and timestamps are not authorization inputs'
  )

  await connection.execute(
    'UPDATE public_prompts SET source_prompt_id = ? WHERE id = ?',
    [privateSourceId, publicationId]
  )
  await connection.execute(
    `UPDATE user_prompts
        SET title = ?,
            content = ?
      WHERE id = ?`,
    ['Changed private title', 'Changed private content', privateSourceId]
  )
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'attaching and changing a private source does not redefine public identity'
  )
  await connection.execute(
    'DELETE FROM user_prompts WHERE id = ?',
    [privateSourceId]
  )
  const [detachedPublicationRows] = await connection.execute(
    'SELECT source_prompt_id FROM public_prompts WHERE id = ?',
    [publicationId]
  )
  assert.equal(detachedPublicationRows[0].source_prompt_id, null)
  await assertVisibility(
    moderatedSnapshotId,
    true,
    'detaching the private source through SET NULL keeps the snapshot visible'
  )

  await connection.execute(
    'DELETE FROM public_prompts WHERE id = ?',
    [publicationId]
  )
  const [detachedSnapshotRows] = await connection.execute(
    'SELECT source_public_prompt_id FROM public_folder_prompts WHERE id = ?',
    [moderatedSnapshotId]
  )
  assert.equal(detachedSnapshotRows[0].source_public_prompt_id, null)
  await assertVisibility(
    moderatedSnapshotId,
    false,
    'deleting the public publication SET NULLs its reference and revokes visibility'
  )
}
