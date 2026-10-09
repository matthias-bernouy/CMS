import { isUserFacingTextAttribute } from "./userFacingTextAttributes";

export interface ContentTextSource {
    readonly namespace: string;
    resolve(locale: string): Readonly<Record<string, string>>;
}

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
        const asset = /^cms\.asset\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)$/u.test(expression);
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

/** Server-only DOM pass over trusted public text sources. */
export function renderContentTexts(
    root: Element,
    locale: string,
    sources: readonly ContentTextSource[],
    options: { skipSubtree?: (element: Element) => boolean } = {},
): void {
    const catalogues = new Map<string, Readonly<Record<string, string>>>();
    for (const source of sources) {
        if (catalogues.has(source.namespace)) {
            throw new TypeError(`Duplicate text namespace: ${source.namespace}`);
        }
        catalogues.set(source.namespace, source.resolve(locale));
    }
    const message = (namespace: string, id: string): string => {
        const texts = catalogues.get(namespace);
        if (!texts || !Object.hasOwn(texts, id)) {
            throw new TypeError(`Unknown content text: ${namespace}:${id}`);
        }
        return texts[id]!;
    };
    const walk = (element: Element, inert = false): void => {
        if (options.skipSubtree?.(element)) {
            return;
        }
        const blocked =
            inert ||
            /^(template|script|style|textarea|iframe|xmp|plaintext|noembed|noframes|noscript)$/u.test(
                element.localName,
            );
        const replace = (value: string, allowed: boolean): string =>
            replaceContentTextExpressions(value, (namespace, id) => {
                if (!allowed || blocked) {
                    throw new TypeError("Server texts are unsupported in this HTML context");
                }
                return message(namespace, id);
            });
        for (const name of element.getAttributeNames()) {
            const value = element.getAttribute(name)!;
            const rendered = replace(
                value,
                isUserFacingTextAttribute(element.localName, name, element.getAttribute("type") ?? ""),
            );
            if (rendered !== value) {
                element.setAttribute(name, rendered);
            }
        }
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === 3) {
                node.textContent = replace(node.textContent ?? "", true);
            } else if (node.nodeType === 1) {
                walk(node as Element, blocked);
            }
        }
        if (element.localName === "template") {
            for (const node of Array.from((element as HTMLTemplateElement).content.childNodes)) {
                if (node.nodeType === 1) {
                    walk(node as Element, true);
                } else if (node.nodeType === 3) {
                    replace(node.textContent ?? "", false);
                }
            }
        }
    };
    walk(root);
}
