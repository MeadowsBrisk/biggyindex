/**
 * Image Metadata Tracking
 * 
 * Tracks which images have been processed for each item, enabling:
 * 1. Skip items that haven't changed (lua unchanged)
 * 2. Delete old images when an item's images change
 * 3. Process only new/updated items (consistent with items stage)
 * 
 * Storage: aggregates/image-meta.json in shared store
 * 
 * Structure per item:
 * {
 *   "item-123": {
 *     "lua": "2024-01-15T10:00:00Z",      // lastUpdatedAt from index when images were processed
 *     "hashes": ["abc123", "def456"],      // R2 folder hashes for this item's images
 *     "lastProcessed": "2024-01-15T12:00:00Z"
 *   }
 * }
 */

import type { BlobClient } from '../../shared/persistence/blobs';
import { Keys } from '../../shared/persistence/keys';
import { log } from '../../shared/logging/logger';

export interface ItemImageMeta {
    lua: string;           // lastUpdatedAt from index when images were last processed
    hashes: string[];      // R2 folder hashes (URL hashes) for this item's images
    lastProcessed: string; // ISO timestamp when images were last processed
}

export type ImageMetaAggregate = Record<string, ItemImageMeta>;

/**
 * Load the image metadata aggregate from blobs
 */
export async function loadImageMeta(sharedBlob: BlobClient): Promise<ImageMetaAggregate> {
    try {
        const meta = await sharedBlob.getJSON<ImageMetaAggregate>(Keys.shared.aggregates.imageMeta());
        return meta || {};
    } catch {
        return {};
    }
}

/**
 * Save the image metadata aggregate to blobs
 */
export async function saveImageMeta(
    sharedBlob: BlobClient,
    meta: ImageMetaAggregate
): Promise<void> {
    await sharedBlob.putJSON(Keys.shared.aggregates.imageMeta(), meta);
}

/**
 * Determine which items need image processing based on index lua changes
 * Returns items that are new or have been updated since last image processing
 */
export function getItemsNeedingImageUpdate(
    indexItems: Array<{ id: string; lua?: string; imageUrl?: string; imageUrls?: string[] }>,
    imageMeta: ImageMetaAggregate
): Array<{ id: string; lua: string; imageUrls: string[]; existingHashes: string[] }> {
    const itemsToProcess: Array<{ id: string; lua: string; imageUrls: string[]; existingHashes: string[] }> = [];

    for (const item of indexItems) {
        const itemLua = item.lua || '';
        const metaEntry = imageMeta[item.id];

        // Collect all image URLs for this item (main + gallery)
        const imageUrls: string[] = [];
        if (item.imageUrl && typeof item.imageUrl === 'string') {
            imageUrls.push(item.imageUrl);
        }
        if (Array.isArray(item.imageUrls)) {
            for (const url of item.imageUrls) {
                if (url && typeof url === 'string') {
                    imageUrls.push(url);
                }
            }
        }

        if (imageUrls.length === 0) continue; // No images to process

        // Need processing if:
        // 1. No metadata exists (new item)
        // 2. lua has changed since last processing (item updated)
        const needsProcessing = !metaEntry ||
            !metaEntry.lua ||
            (itemLua && new Date(itemLua) > new Date(metaEntry.lua));

        if (needsProcessing) {
            itemsToProcess.push({
                id: item.id,
                lua: itemLua,
                imageUrls,
                existingHashes: metaEntry?.hashes || [],
            });
        }
    }

    return itemsToProcess;
}

/**
 * Update image metadata for an item after processing
 */
export function updateItemImageMeta(
    meta: ImageMetaAggregate,
    itemId: string,
    lua: string,
    newHashes: string[]
): ImageMetaAggregate {
    return {
        ...meta,
        [itemId]: {
            lua,
            hashes: newHashes,
            lastProcessed: new Date().toISOString(),
        },
    };
}

/**
 * Find stale hashes that are no longer used by an item
 * These should be deleted from R2 when the item's images change
 */
export function getStaleHashes(existingHashes: string[], newHashes: string[]): string[] {
    const newSet = new Set(newHashes);
    return existingHashes.filter(hash => !newSet.has(hash));
}
