import { replaceContentTextExpressions } from "./contentTextExpressions";
import { isUserFacingTextAttribute } from "./userFacingTextAttributes";

/** The same placement rules govern validation and server rendering. */
export function transformContentTexts(
    root: Element,
    resolve: (namespace: string, id: string) => string,
    options: { skipSubtree?: (element: Element) => boolean; write?: boolean } = {},
): void {
    const walk = (element: Element, inert = false): void => {
        if (options.skipSubtree?.(element)) {
            return;
        }
        const blocksChildContent =
            inert ||
            /^(template|script|style|textarea|iframe|xmp|plaintext|noembed|noframes|noscript)$/u.test(
                element.localName,
            );
        const replace = (value: string, allowed: boolean, context: string): string =>
            replaceContentTextExpressions(value, (namespace, id) => {
                if (!allowed || inert) {
                    throw new TypeError(`Server texts are unsupported in ${context}`);
                }
                return resolve(namespace, id);
            });
        for (const name of element.getAttributeNames()) {
            const value = element.getAttribute(name)!;
            const rendered = replace(
                value,
                isUserFacingTextAttribute(element.localName, name, element.getAttribute("type") ?? ""),
                `${element.localName}[${name}]`,
            );
            if (options.write !== false && rendered !== value) {
                element.setAttribute(name, rendered);
            }
        }
        for (const node of Array.from(element.childNodes)) {
            if (node.nodeType === 3) {
                const rendered = replace(node.textContent ?? "", !blocksChildContent, `${element.localName} text`);
                if (options.write !== false) {
                    node.textContent = rendered;
                }
            } else if (node.nodeType === 1) {
                walk(node as Element, blocksChildContent);
            }
        }
        if (element.localName === "template") {
            for (const node of Array.from((element as HTMLTemplateElement).content.childNodes)) {
                if (node.nodeType === 1) {
                    walk(node as Element, true);
                } else if (node.nodeType === 3) {
                    replace(node.textContent ?? "", false, "template text");
                }
            }
        }
    };
    walk(root);
}

/** Check placement and syntax without resolving or modifying shared text references. */
export function validateContentTextPlacements(root: Element): void {
    transformContentTexts(root, () => "", { write: false });
}
