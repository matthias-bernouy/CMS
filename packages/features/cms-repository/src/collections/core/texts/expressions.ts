import {
    parseCollectionAssetExpression,
    parseCollectionAssetReference,
    type CollectionAssetExpression,
} from "@bernouy/cms-content/page-document";

type CollectionExpressionResolvers = {
    text?: (collectionId: string, textId: string) => string | undefined;
    asset?: (collectionId: string, assetId: string) => string | undefined;
    assetReference?: (collectionId: string, assetId: string) => CollectionAssetExpression | undefined;
};

/** Replaces known reserved CMS expressions and preserves business bindings byte-for-byte. */
function replaceCollectionExpressions(input: string, resolvers: CollectionExpressionResolvers): string {
    let output = "";
    let cursor = 0;
    while (cursor < input.length) {
        const start = input.indexOf("{{", cursor);
        if (start === -1) {
            return output + input.slice(cursor);
        }
        output += input.slice(cursor, start);
        const end = input.indexOf("}}", start + 2);
        const expression = input.slice(start + 2, end === -1 ? undefined : end).trim();
        const reserved = /^cms(?:$|[^\w$-])/.test(expression);
        if (!reserved) {
            if (end === -1) {
                return output + input.slice(start);
            }
            output += input.slice(start, end + 2);
        } else {
            const text = /^cms\.i18n\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9-]{0,95})$/.exec(expression);
            const asset = parseCollectionAssetExpression(expression);
            if (end === -1 || (!text && !asset)) {
                throw new TypeError("Expected {{ cms.i18n.collection.text }} or {{ cms.asset.collection.asset }}");
            }
            if (asset && resolvers.assetReference) {
                const rewritten = resolvers.assetReference(asset.collectionId, asset.assetId);
                const replacement = rewritten
                    ? `{{ cms.asset.${rewritten.collectionId}.${rewritten.assetId} }}`
                    : input.slice(start, end + 2);
                if (rewritten && !parseCollectionAssetReference(replacement)) {
                    throw new TypeError("Rewritten collection asset reference is invalid");
                }
                output += replacement;
                cursor = end + 2;
                continue;
            }
            const resolve = text ? resolvers.text : resolvers.asset;
            if (!resolve) {
                output += input.slice(start, end + 2);
                cursor = end + 2;
                continue;
            }
            const value = text ? resolve(text[1]!, text[2]!) : resolve(asset!.collectionId, asset!.assetId);
            if (value === undefined) {
                output += input.slice(start, end + 2);
                cursor = end + 2;
                continue;
            }
            if (/[{}]/.test(value)) {
                throw new TypeError("A server collection expression cannot introduce binding delimiters");
            }
            output += value;
        }
        cursor = end + 2;
    }
    return output;
}

/** Replaces only collection text expressions. */
export function replaceCollectionTextExpressions(
    input: string,
    resolve: (collectionId: string, textId: string) => string,
): string {
    return replaceCollectionExpressions(input, { text: resolve });
}

/** Replaces only immutable collection asset expressions. */
export function replaceCollectionAssetExpressions(
    input: string,
    resolve: (collectionId: string, assetId: string) => string | undefined,
): string {
    return replaceCollectionExpressions(input, { asset: resolve });
}

/** Rewrites immutable collection asset identities while preserving unrelated expressions byte-for-byte. */
export function rewriteCollectionAssetReferences(
    input: string,
    rewrite: (collectionId: string, assetId: string) => CollectionAssetExpression | undefined,
): string {
    return replaceCollectionExpressions(input, { assetReference: rewrite });
}
