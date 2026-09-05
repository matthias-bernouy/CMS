import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type { Editor, SettingControl } from "@bernouy/cms-content/editor";
import { createNativeEditorCatalog, resolveEditorInteractionPolicy } from "@bernouy/cms-editor-system-v2";
import { ShellSelection } from "../../src/components/Layout/Shell/Controller/shellSelection";
import { resolveSettingsValues } from "../../src/components/Layout/Shell/Domain/Settings/settingsValues";
import { attributesForSettingValue } from "../../src/components/Settings/SettingsView/internals/settingState";

type MediaCase = {
    tag: "img" | "svg";
    informativeHtml: string;
    decorativeHtml: string;
    informativeValue: string;
    decorativeValue: string;
    accessibleName: "alt" | "aria-label";
    originalName: string;
};

const MEDIA_CASES: MediaCase[] = [
    {
        tag: "img",
        informativeHtml: '<img alt="Product photo">',
        decorativeHtml: '<img role="presentation" aria-hidden="true" alt="">',
        informativeValue: "",
        decorativeValue: "presentation",
        accessibleName: "alt",
        originalName: "Product photo",
    },
    {
        tag: "svg",
        informativeHtml: '<svg role="img" aria-label="Company logo"></svg>',
        decorativeHtml: '<svg aria-hidden="true"></svg>',
        informativeValue: "img",
        decorativeValue: "",
        accessibleName: "aria-label",
        originalName: "Company logo",
    },
];

describe("native grouped attribute changes", () => {
    test("removes the target and derived relationship when a link returns to the same tab", () => {
        const { editor, target } = nativeEditor("a", '<a href="/" target="_blank" rel="noopener noreferrer">Link</a>');

        applySetting(editor, control(editor, "target"), "");

        expect(target.getAttribute("target")).toBeNull();
        expect(target.getAttribute("rel")).toBeNull();
    });
});

describe("native media accessibility transitions", () => {
    for (const media of MEDIA_CASES) {
        test(`restores and replaces the accessible name atomically for ${media.tag}`, () => {
            const { editor, target } = nativeEditor(media.tag, media.informativeHtml);
            const purpose = control(editor, "role");

            applySetting(editor, purpose, media.decorativeValue);
            expectDecorativeState(target, media);
            expectResolvedName(editor, media, media.originalName);

            applySetting(editor, purpose, media.informativeValue);
            expectInformativeState(target, media, media.originalName);

            applySetting(editor, purpose, media.decorativeValue);
            const replacement = `Updated ${media.originalName}`;
            applySetting(editor, control(editor, media.accessibleName), replacement);
            expectDecorativeState(target, media);
            expectResolvedName(editor, media, replacement);

            applySetting(editor, purpose, media.informativeValue);
            expectInformativeState(target, media, replacement);
        });

        test(`keeps a ${media.tag} draft across editor recreation but not a DOM reload`, () => {
            const first = nativeEditor(media.tag, media.decorativeHtml);
            const retainedName = `Retained ${media.originalName}`;
            applySetting(first.editor, control(first.editor, media.accessibleName), retainedName);
            expectDecorativeState(first.target, media);

            const recreated = recreateNativeEditor(media.tag, first.target);
            expectResolvedName(recreated, media, retainedName);
            applySetting(recreated, control(recreated, "role"), media.informativeValue);
            expectInformativeState(first.target, media, retainedName);

            const reloaded = nativeEditor(media.tag, media.decorativeHtml);
            const purpose = control(reloaded.editor, "role");
            applySetting(reloaded.editor, purpose, media.informativeValue);
            expectDecorativeState(reloaded.target, media);

            const freshName = `Fresh ${media.originalName}`;
            applySetting(reloaded.editor, control(reloaded.editor, media.accessibleName), freshName);
            expectDecorativeState(reloaded.target, media);

            applySetting(reloaded.editor, purpose, media.informativeValue);
            expectInformativeState(reloaded.target, media, freshName);
        });
    }
});

function nativeEditor(tag: string, html: string): { editor: Editor; target: HTMLElement } {
    const { document, HTMLElement } = parseHTML(html);
    const target = document.querySelector<HTMLElement>(tag)!;
    const entry = createNativeEditorCatalog(HTMLElement as unknown as CustomElementConstructor).find(
        (candidate) => candidate.tag === tag,
    )!;
    return { editor: new entry.editor(target), target };
}

function recreateNativeEditor(tag: string, target: HTMLElement): Editor {
    const entry = createNativeEditorCatalog(target.ownerDocument.defaultView!.HTMLElement).find(
        (candidate) => candidate.tag === tag,
    )!;
    return new entry.editor(target);
}

function control(editor: Editor, attribute: string): SettingControl {
    const setting = editor
        .getSettings()
        .flatMap((section) => section.settings)
        .find((candidate) => candidate.type !== "row" && candidate.attribute === attribute);
    if (!setting || setting.type === "row") {
        throw new Error(`Missing native ${attribute} setting.`);
    }
    return setting;
}

function applySetting(editor: Editor, setting: SettingControl, value: string): void {
    const selection = new ShellSelection({
        dataSources: () => [],
        editingPolicy: () => resolveEditorInteractionPolicy(),
        runtime: () => null,
    } as never);
    selection.applySetting(editor, setting, value, attributesForSettingValue(setting, value));
}

function expectDecorativeState(target: HTMLElement, media: MediaCase): void {
    expect(target.getAttribute("role")).toBe(media.tag === "img" ? "presentation" : null);
    expect(target.getAttribute("aria-hidden")).toBe("true");
    expect(target.getAttribute(media.accessibleName)).toBe(media.tag === "img" ? "" : null);
}

function expectInformativeState(target: HTMLElement, media: MediaCase, name: string): void {
    expect(target.getAttribute("role")).toBe(media.tag === "svg" ? "img" : null);
    expect(target.getAttribute("aria-hidden")).toBeNull();
    expect(target.getAttribute(media.accessibleName)).toBe(name);
}

function expectResolvedName(editor: Editor, media: MediaCase, name: string): void {
    const resolved = resolveSettingsValues(editor, editor.getSettings())
        .flatMap((section) => section.settings)
        .find((setting) => setting.type !== "row" && setting.attribute === media.accessibleName);
    expect(resolved?.defaultValue).toBe(name);
}
