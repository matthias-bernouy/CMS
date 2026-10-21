const ASSET_EXPRESSION = /^cms\.asset\.([a-z][a-z0-9-]{0,95})\.([a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*)$/u;

export type CollectionAssetExpression = Readonly<{ collectionId: string; assetId: string }>;

/** Parses the contents of one immutable collection-asset interpolation. */
export function parseCollectionAssetExpression(value: string): CollectionAssetExpression | null {
    const match = ASSET_EXPRESSION.exec(value.trim());
    return match ? { collectionId: match[1]!, assetId: match[2]! } : null;
}

/** Parses one complete `{{ cms.asset.collection.path }}` reference. */
export function parseCollectionAssetReference(value: string): CollectionAssetExpression | null {
    const match = /^\{\{\s*([\s\S]*?)\s*\}\}$/u.exec(value);
    return match ? parseCollectionAssetExpression(match[1]!) : null;
}
