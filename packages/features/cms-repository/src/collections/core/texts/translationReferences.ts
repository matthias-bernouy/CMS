import type { CollectionSettingControl } from "../../interfaces/CollectionBloc";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { invalid } from "../errors";
import { parseCollectionTranslationKey } from "./translationCatalogue";

type Reference = Readonly<{ key: string; path: string; maximum: number }>;

/** Validate every administration-copy reference against the immutable default catalogue. */
export function validateCollectionTranslationReferences(release: CollectionRelease): void {
    const references = collectReferences(release);
    for (const reference of references) {
        const key = parseCollectionTranslationKey(reference.key, reference.path);
        if (!Object.hasOwn(release.translations[release.locale]!, key)) {
            invalid(`missing default translation ${JSON.stringify(key)}`, reference.path);
        }
        for (const [locale, messages] of Object.entries(release.translations)) {
            const value = messages[key];
            if (value !== undefined && (value.length > reference.maximum || !value.trim())) {
                invalid(
                    `translation must be nonblank and at most ${reference.maximum} characters`,
                    `$.translations[${JSON.stringify(locale)}][${JSON.stringify(key)}]`,
                );
            }
        }
    }
}

function collectReferences(release: CollectionRelease): Reference[] {
    const references: Reference[] = [reference(release.name, "$.name", 128)];
    optional(references, release.description, "$.description", 4096);
    for (const [index, text] of (release.texts ?? []).entries()) {
        const path = `$.texts[${index}]`;
        references.push(reference(text.label, `${path}.label`, 120));
        optional(references, text.description, `${path}.description`, 500);
        references.push(reference(text.category, `${path}.category`, 120));
        references.push(reference(text.group, `${path}.group`, 120));
    }
    if (release.theme) {
        references.push(reference(release.theme.label, "$.theme.label", 120));
        for (const [categoryIndex, category] of release.theme.categories.entries()) {
            const path = `$.theme.categories[${categoryIndex}]`;
            references.push(reference(category.label, `${path}.label`, 120));
            optional(references, category.description, `${path}.description`, 500);
            for (const [tokenIndex, token] of category.tokens.entries()) {
                const tokenPath = `${path}.tokens[${tokenIndex}]`;
                references.push(reference(token.label, `${tokenPath}.label`, 120));
                optional(references, token.description, `${tokenPath}.description`, 500);
            }
        }
    }
    for (const [blocIndex, bloc] of release.blocs.entries()) {
        const path = `$.blocs[${blocIndex}]`;
        references.push(reference(bloc.label, `${path}.label`, 120));
        optional(references, bloc.description, `${path}.description`, 4096);
        optional(references, bloc.category, `${path}.category`, 120);
        for (const [settingIndex, setting] of (bloc.kind === "component" ? (bloc.settings ?? []) : []).entries()) {
            const settingPath = `${path}.settings[${settingIndex}]`;
            references.push(reference(setting.label, `${settingPath}.label`, 120));
            optional(references, setting.group, `${settingPath}.group`, 120);
            optional(references, setting.help, `${settingPath}.help`, 120);
            controlReferences(references, setting.control, `${settingPath}.control`);
        }
    }
    for (const [index, page] of (release.pages ?? []).entries()) {
        const path = `$.pages[${index}]`;
        references.push(reference(page.name, `${path}.name`, 128));
        optional(references, page.description, `${path}.description`, 4096);
    }
    return references;
}

function controlReferences(references: Reference[], control: CollectionSettingControl, path: string): void {
    if (control.kind === "text") {
        optional(references, control.placeholder, `${path}.placeholder`, 240);
    }
    if (control.kind === "number" || control.kind === "range") {
        optional(references, control.suffix, `${path}.suffix`, 32);
    }
    if (control.kind === "select" || control.kind === "segmented") {
        for (const [index, option] of control.options.entries()) {
            references.push(reference(option.label, `${path}.options[${index}].label`, 120));
        }
    }
    if (control.kind === "color") {
        for (const [index, option] of (control.tokens ?? []).entries()) {
            references.push(reference(option.label, `${path}.tokens[${index}].label`, 120));
        }
    }
}

function reference(key: string, path: string, maximum: number): Reference {
    return { key, path, maximum };
}

function optional(references: Reference[], key: string | undefined, path: string, maximum: number): void {
    if (key !== undefined) {
        references.push(reference(key, path, maximum));
    }
}
