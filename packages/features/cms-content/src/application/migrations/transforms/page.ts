import { collectionThemeTokenId, type CollectionMigrationOperation } from "@bernouy/cms-repository/collections";
import { parseHTML } from "linkedom";
import { replaceThemeTokenReference } from "./themeTokenReferences";

export function migratePageContent(
    html: string,
    operations: readonly CollectionMigrationOperation[],
    collectionId: string,
): { content: string; applied: number } {
    let migratedHtml = html;
    let applied = 0;
    for (const operation of operations) {
        if (operation.kind === "rename-text") {
            const migrated = renameTextReferences(migratedHtml, collectionId, operation.from, operation.to);
            migratedHtml = migrated.content;
            applied += migrated.applied;
        } else if (operation.kind === "rename-asset") {
            const migrated = renameAssetReferences(migratedHtml, collectionId, operation.from, operation.to);
            migratedHtml = migrated.content;
            applied += migrated.applied;
        }
    }
    const { document } = parseHTML(`<!doctype html><html><body>${migratedHtml}</body></html>`);
    let markupApplied = 0;
    for (const operation of operations) {
        if (operation.kind === "rename-bloc") {
            for (const element of [...document.querySelectorAll(operation.from)]) {
                const replacement = document.createElement(operation.to);
                for (const attribute of [...element.attributes]) {
                    replacement.setAttribute(attribute.name, attribute.value);
                }
                replacement.append(...[...element.childNodes]);
                element.replaceWith(replacement);
                markupApplied += 1;
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
                markupApplied += migrateSetting(element, operation);
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
                        markupApplied += 1;
                    }
                }
            }
        }
    }
    return {
        content: markupApplied ? document.body.innerHTML : migratedHtml,
        applied: applied + markupApplied,
    };
}

function renameAssetReferences(
    content: string,
    collectionId: string,
    from: string,
    to: string,
): { content: string; applied: number } {
    let applied = 0;
    const migrated = content.replace(
        /\{\{\s*cms\.asset\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)\s*\}\}/gu,
        (expression, owner: string, assetId: string) => {
            if (owner !== collectionId || assetId !== from) {
                return expression;
            }
            applied += 1;
            return `{{ cms.asset.${collectionId}.${to} }}`;
        },
    );
    return { content: migrated, applied };
}

function renameTextReferences(
    content: string,
    collectionId: string,
    from: string,
    to: string,
): { content: string; applied: number } {
    let applied = 0;
    const migrated = content.replace(
        /\{\{\s*cms\.i18n\.([a-z][a-z0-9-]{0,95})\.([a-z][a-z0-9-]{0,95})\s*\}\}/gu,
        (expression, owner: string, textId: string) => {
            if (owner !== collectionId || textId !== from) {
                return expression;
            }
            applied += 1;
            return `{{ cms.i18n.${collectionId}.${to} }}`;
        },
    );
    return { content: migrated, applied };
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
