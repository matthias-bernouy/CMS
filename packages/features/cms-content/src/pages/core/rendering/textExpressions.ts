/** Only the reserved cms root is interpreted here. Business expressions remain byte-for-byte intact. */
export function replaceTextExpressions(input: string, resolve: (collection: string, id: string) => string): string {
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
            const match = /^cms\.i18n\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9-]{0,95})$/.exec(expression);
            if (end === -1 || !match) {
                throw new TypeError("Expected {{ cms.i18n.collection.text }}");
            }
            const value = resolve(match[1]!, match[2]!);
            // Reject braces, including across interpolation boundaries, rather than create executable bindings.
            if (/[{}]/.test(value)) {
                throw new TypeError("Server text cannot introduce binding delimiters");
            }
            output += value;
        }
        cursor = end + 2;
    }
    return output;
}
