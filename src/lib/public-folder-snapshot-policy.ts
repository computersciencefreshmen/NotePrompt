export const MYSQL_UNSIGNED_INT_MAX = 0xffff_ffff;

type SnapshotPositionInput = Record<string, unknown>;

export type ModeratedSnapshotPosition = {
  id: number;
  temporaryPosition: number;
  finalPosition: number;
};

export function planPublicFolderSnapshotPositions(
  snapshots: SnapshotPositionInput[],
  ownerCount: number,
): ModeratedSnapshotPosition[] {
  if (!Number.isSafeInteger(ownerCount) || ownerCount < 0) {
    throw new Error('Public folder owner snapshot count is invalid');
  }

  const seenIds = new Set<number>();
  const seenPositions = new Set<number>();
  let maxExistingPosition = -1;
  const moderated: Array<{ id: number; position: number }> = [];
  for (const row of snapshots) {
    const id = Number(row.id);
    const position = Number(row.position);
    if (
      !Number.isSafeInteger(id)
      || id <= 0
      || seenIds.has(id)
      || !Number.isSafeInteger(position)
      || position < 0
      || position > MYSQL_UNSIGNED_INT_MAX
      || seenPositions.has(position)
    ) {
      throw new Error('Public folder snapshot position is invalid');
    }
    if (![
      'legacy_unverified',
      'folder_publication',
      'moderated_publication',
    ].includes(String(row.snapshot_origin))) {
      throw new Error('Public folder snapshot origin is invalid');
    }
    seenIds.add(id);
    seenPositions.add(position);
    maxExistingPosition = Math.max(maxExistingPosition, position);
    if (row.snapshot_origin === 'moderated_publication') {
      moderated.push({ id, position });
    }
  }
  moderated.sort((left, right) => left.position - right.position || left.id - right.id);

  const finalLastPosition = ownerCount + moderated.length - 1;
  if (!Number.isSafeInteger(finalLastPosition) || finalLastPosition > MYSQL_UNSIGNED_INT_MAX) {
    throw new Error('Public folder snapshot positions exceed the database limit');
  }
  if (moderated.length === 0) return [];

  const temporaryFirstPosition = Math.max(
    maxExistingPosition + 1,
    finalLastPosition + 1,
  );
  const temporaryLastPosition = temporaryFirstPosition + moderated.length - 1;
  if (
    !Number.isSafeInteger(temporaryLastPosition)
    || temporaryLastPosition > MYSQL_UNSIGNED_INT_MAX
  ) {
    throw new Error('Public folder snapshot staging positions exceed the database limit');
  }

  return moderated.map((snapshot, index) => ({
    id: snapshot.id,
    temporaryPosition: temporaryFirstPosition + index,
    finalPosition: ownerCount + index,
  }));
}

/**
 * Visibility proof for rows from `public_folder_prompts`.
 *
 * Every query using this fragment must bind the snapshot table as `snapshot`
 * and its owning public folder as `published_folder`.
 *
 * Migration 011 intentionally leaves historical rows as `legacy_unverified`.
 * Such rows are never public. New rows must carry one of two explicit proofs:
 *
 * - `folder_publication`: the folder owner published their own private snapshot.
 * - `moderated_publication`: a moderator copied a specific public publication.
 *
 * A moderated snapshot stays visible only while the same public primary key is
 * still published and its stable business payload (including the complete tag
 * set) still matches. Mutable display metadata and private-source identifiers
 * are deliberately not authorization inputs.
 */
export const PUBLIC_FOLDER_SNAPSHOT_VISIBILITY_SQL = `(
  (
    snapshot.snapshot_origin = 'folder_publication'
    AND snapshot.source_public_prompt_id IS NULL
    AND snapshot.author_id = published_folder.user_id
  )
  OR (
    snapshot.snapshot_origin = 'moderated_publication'
    AND snapshot.source_public_prompt_id IS NOT NULL
    AND snapshot.source_prompt_id IS NULL
    AND EXISTS (
      SELECT 1
        FROM public_prompts publication
       WHERE publication.id = snapshot.source_public_prompt_id
         AND publication.publication_state = 'published'
         AND publication.author_id = snapshot.author_id
         AND CAST(publication.title AS BINARY) = CAST(snapshot.title AS BINARY)
         AND CAST(publication.content AS BINARY) = CAST(snapshot.content AS BINARY)
         AND CAST(publication.description AS BINARY) <=> CAST(snapshot.description AS BINARY)
         AND publication.category_id <=> snapshot.category_id
         AND publication.editor_mode = snapshot.editor_mode
         AND CAST(publication.payload AS BINARY) <=> CAST(snapshot.payload AS BINARY)
         AND publication.schema_version = snapshot.schema_version
         AND JSON_TYPE(COALESCE(snapshot.tags, JSON_ARRAY())) = 'ARRAY'
         AND JSON_LENGTH(COALESCE(snapshot.tags, JSON_ARRAY())) = (
           SELECT COUNT(*)
             FROM public_prompt_tags active_prompt_tag
            WHERE active_prompt_tag.public_prompt_id = publication.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public_prompt_tags active_prompt_tag
             JOIN tags active_tag ON active_tag.id = active_prompt_tag.tag_id
            WHERE active_prompt_tag.public_prompt_id = publication.id
              AND JSON_CONTAINS(
                COALESCE(snapshot.tags, JSON_ARRAY()),
                JSON_QUOTE(active_tag.name)
              ) = 0
         )
    )
  )
)`;
