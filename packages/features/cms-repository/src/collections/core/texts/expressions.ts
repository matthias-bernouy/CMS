type CollectionExpressionResolvers = {
    text?: (collectionId: string, textId: string) => string;
    asset?: (collectionId: string, assetId: string) => string;
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
            const asset = /^cms\.asset\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)$/.exec(expression);
            if (end === -1 || (!text && !asset)) {
                throw new TypeError("Expected {{ cms.i18n.collection.text }} or {{ cms.asset.collection.asset }}");
            }
            const resolve = text ? resolvers.text : resolvers.asset;
            if (!resolve) {
                output += input.slice(start, end + 2);
                cursor = end + 2;
                continue;
            }
            const match = text ?? asset!;
            const value = resolve(match[1]!, match[2]!);
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
    resolve: (collectionId: string, assetId: string) => string,
): string {
    return replaceCollectionExpressions(input, { asset: resolve });
}
