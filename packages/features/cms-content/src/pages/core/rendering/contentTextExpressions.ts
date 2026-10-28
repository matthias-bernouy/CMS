import { parseCollectionAssetExpression } from "cms-content/blocs/core/markup/security/collectionAssetExpression";

/** Replace one reserved static-text expression without evaluating browser bindings. */
export function replaceContentTextExpressions(
    input: string,
    resolve: (namespace: string, textId: string) => string,
): string {
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
        const text = /^cms\.i18n\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9-]{0,95})$/u.exec(expression);
        const asset = parseCollectionAssetExpression(expression);
        if (!text) {
            if (/^cms(?:$|[^\w$-])/u.test(expression) && !asset) {
                throw new TypeError("Expected a supported reserved CMS expression");
            }
            if (end === -1) {
                return output + input.slice(start);
            }
            output += input.slice(start, end + 2);
        } else {
            if (end === -1) {
                throw new TypeError("Expected {{ cms.i18n.namespace.text }}");
            }
            const value = resolve(text[1]!, text[2]!);
            if (/[{}]/u.test(value)) {
                throw new TypeError("A server text cannot introduce binding delimiters");
            }
            output += value;
        }
        cursor = end + 2;
    }
    return output;
}
