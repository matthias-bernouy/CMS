import { collectionThemeTokenId, type CollectionMigrationOperation } from "@bernouy/cms-repository/collections";
import { parseHTML } from "linkedom";
import { replaceThemeTokenReference } from "./themeTokenReferences";

export function migratePageContent(
    html: string,
    operations: readonly CollectionMigrationOperation[],
    collectionId: string,
): { content: string; applied: number } {
    const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
    let applied = 0;
    for (const operation of operations) {
        if (operation.kind === "rename-bloc") {
            for (const element of [...document.querySelectorAll(operation.from)]) {
                const replacement = document.createElement(operation.to);
                for (const attribute of [...element.attributes]) {
                    replacement.setAttribute(attribute.name, attribute.value);
                }
                replacement.append(...[...element.childNodes]);
                element.replaceWith(replacement);
                applied += 1;
            }
            continue;
        }
        if (
            operation.kind === "rename-setting" ||
            operation.kind === "set-setting-default" ||
            operation.kind === "remove-setting" ||
            operation.kind === "map-setting-value"
        ) {
            for (const element of [...document.querySelectorAll(operation.bloc)]) {
                applied += migrateSetting(element, operation);
            }
            continue;
        }
        if (operation.kind === "rename-theme-token") {
            const from = collectionThemeTokenId(collectionId, operation.from);
            const to = collectionThemeTokenId(collectionId, operation.to);
            for (const element of [...document.querySelectorAll("*")]) {
                for (const attribute of [...element.attributes]) {
                    const value = replaceThemeTokenReference(attribute.value, from, to);
                    if (value !== attribute.value) {
                        element.setAttribute(attribute.name, value);
                        applied += 1;
                    }
                }
            }
        }
    }
    return { content: applied ? document.body.innerHTML : html, applied };
}

function migrateSetting(element: Element, operation: CollectionMigrationOperation): number {
    if (operation.kind === "rename-setting" && element.hasAttribute(operation.from)) {
        if (element.hasAttribute(operation.to)) {
            throw new Error(`Setting migration collides with ${operation.bloc}.${operation.to}`);
        }
        element.setAttribute(operation.to, element.getAttribute(operation.from) ?? "");
        element.removeAttribute(operation.from);
        return 1;
    }
    if (operation.kind === "set-setting-default" && !element.hasAttribute(operation.setting)) {
        element.setAttribute(operation.setting, operation.value);
        return 1;
    }
    if (operation.kind === "remove-setting" && element.hasAttribute(operation.setting)) {
        element.removeAttribute(operation.setting);
        return 1;
    }
    if (operation.kind === "map-setting-value") {
        const current = element.getAttribute(operation.setting);
        if (current !== null && Object.hasOwn(operation.values, current)) {
            element.setAttribute(operation.setting, operation.values[current]!);
            return 1;
        }
    }
    return 0;
}
