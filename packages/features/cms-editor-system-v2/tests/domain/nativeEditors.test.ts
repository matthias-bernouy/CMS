import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    CMS_BINDING_ATTRIBUTES,
    Editor,
    type ContentSlot,
    type Setting,
    type SettingControl,
} from "@bernouy/cms-content/editor";
import {
    createNativeEditorCatalog,
    applyNativeEditorAttributeEffects,
    filterNativeEditorSettingSections,
    isEditorPlacementAllowed,
    isNativeEditorAttributeAllowed,
    isNativeEditorSettingValueAllowed,
    PLATFORM_NATIVE_CATALOG_TAGS,
    resolveEditorInteractionPolicy,
} from "@bernouy/cms-editor-system-v2";
import {
    childGroups,
    replaceGroups,
    rootGroups,
} from "../../src/components/Layout/StructureTree/Pickers/structurePickerGroups";
import { ShellSelection } from "../../src/components/Layout/Shell/Controller/shellSelection";
import { ShellBindingMutations } from "../../src/components/Layout/Shell/Domain/Mutations/shellBindingMutations";

function nativeCatalog() {
    const { HTMLElement } = parseHTML("<!doctype html><html><body></body></html>");
    return createNativeEditorCatalog(HTMLElement as unknown as CustomElementConstructor);
}

describe("platform native editors", () => {
    test("owns one editor for each supported native tag and hides semantic wrappers", () => {
        const catalog = nativeCatalog();

        expect([...catalog.map((entry) => entry.tag)].sort()).toEqual([...PLATFORM_NATIVE_CATALOG_TAGS].sort());
        expect(new Set(catalog.map((entry) => entry.tag)).size).toBe(catalog.length);
        expect(catalog.find((entry) => entry.tag === "header")).toMatchObject({
            category: "Runtime",
            insertable: false,
        });
        expect(catalog.some((entry) => ["div", "small", "blockquote", "pre"].includes(entry.tag))).toBe(false);
    });

    test("enforces contextual span and list-item placement through catalog metadata", () => {
        const catalog = nativeCatalog();
        const span = catalog.find((entry) => entry.tag === "span")!;
        const listItem = catalog.find((entry) => entry.tag === "li")!;
        const exactSpan: ContentSlot = { label: "Label", accepts: [{ kind: "component", tag: "span" }] };
        const loose: ContentSlot = { label: "Content", accepts: [{ kind: "any-component" }] };

        expect(isEditorPlacementAllowed(span, { kind: "root" })).toBe(false);
        expect(isEditorPlacementAllowed(span, { kind: "slot", parentTag: "mossa-card", slot: loose })).toBe(false);
        expect(isEditorPlacementAllowed(span, { kind: "slot", parentTag: "mossa-card", slot: exactSpan })).toBe(true);
        expect(isEditorPlacementAllowed(listItem, { kind: "slot", parentTag: "section", slot: loose })).toBe(false);
        expect(isEditorPlacementAllowed(listItem, { kind: "slot", parentTag: "ul", slot: loose })).toBe(true);
    });

    test("exposes only curated native settings", () => {
        const { document } = parseHTML("<a></a><img><form></form><section></section>");
        const catalog = nativeCatalog();
        for (const tag of ["a", "img", "form", "section"] as const) {
            const entry = catalog.find((candidate) => candidate.tag === tag)!;
            const target = document.querySelector<HTMLElement>(tag)!;
            const settings = new entry.editor(target).getSettings();
            const controls = settings.flatMap((section) => section.settings.flatMap(flattenSetting));

            expect(controls.length).toBeGreaterThan(0);
            expect(controls.every((setting) => isNativeEditorAttributeAllowed(tag, setting.attribute))).toBe(true);
            expect(
                controls.some((setting) => ["class", "style", "slot", "id", "onclick"].includes(setting.attribute)),
            ).toBe(false);
        }

        const imageEntry = catalog.find((entry) => entry.tag === "img")!;
        const imageSettings = new imageEntry.editor(document.querySelector<HTMLElement>("img")!).getSettings();
        const source = imageSettings[0]?.settings[0];
        expect(source?.type === "page-link" ? source.mediaAccept : undefined).toEqual(["image"]);
        const linkEntry = catalog.find((entry) => entry.tag === "a")!;
        const linkSettings = new linkEntry.editor(document.querySelector<HTMLElement>("a")!).getSettings();
        expect(JSON.stringify(linkSettings)).toContain("noopener noreferrer");
        expect(JSON.stringify(linkSettings)).toContain("nofollow");
        expect(isNativeEditorAttributeAllowed("section", "aria-label")).toBe(true);
        const formEntry = catalog.find((entry) => entry.tag === "form")!;
        const formSettings = new formEntry.editor(document.querySelector<HTMLElement>("form")!).getSettings();
        expect(formSettings[0]?.settings[0]).toMatchObject({
            type: "endpoint-picker",
            attribute: CMS_BINDING_ATTRIBUTES.source,
            methodAttribute: CMS_BINDING_ATTRIBUTES.sourceMethod,
            required: true,
        });
    });

    test("filters forged native fields deny-by-default", () => {
        const { document } = parseHTML("<a></a>");
        const filtered = filterNativeEditorSettingSections(document.querySelector("a")!, [
            {
                kind: "self",
                label: "Forged",
                settings: [
                    { type: "text", label: "Destination", attribute: "href" },
                    {
                        type: "page-link",
                        label: "Controlled destination",
                        attribute: "href",
                        required: true,
                    },
                    { type: "text", label: "Classes", attribute: "class" },
                    { type: "text", label: "Tracking", attribute: "data-track" },
                    { type: "text", label: "Click", attribute: "onclick" },
                ],
            },
        ]);

        expect(filtered[0]?.settings).toEqual([
            {
                type: "page-link",
                label: "Controlled destination",
                attribute: "href",
                required: true,
            },
        ]);
        expect(isNativeEditorAttributeAllowed("form", CMS_BINDING_ATTRIBUTES.source)).toBe(true);
        expect(isNativeEditorAttributeAllowed("svg", "ARIA-LABEL")).toBe(false);
    });

    test("rejects forged semantic values even when the attribute name is allowed", () => {
        const { document } = parseHTML("<a></a><button></button><img>");
        const anchor = document.querySelector("a")!;
        const targetSetting = {
            type: "select",
            label: "Open in",
            attribute: "target",
            options: [
                { label: "Same tab", value: "" },
                { label: "New tab", value: "_blank" },
            ],
        } as const;
        const button = document.querySelector("button")!;
        const buttonType = {
            type: "segmented",
            label: "Type",
            attribute: "type",
            options: [
                { label: "Button", value: "button" },
                { label: "Submit", value: "submit" },
            ],
        } as const;
        const image = document.querySelector("img")!;
        const source = {
            type: "page-link",
            label: "Image",
            attribute: "src",
            required: true,
            allowPage: false,
            allowExternal: false,
            allowMedia: true,
            mediaAccept: ["image"],
        } as const;

        expect(isNativeEditorSettingValueAllowed(anchor, targetSetting, "_self")).toBe(false);
        expect(isNativeEditorSettingValueAllowed(button, buttonType, "reset")).toBe(false);
        expect(isNativeEditorSettingValueAllowed(image, source, "https://attacker.example/image.png")).toBe(false);
        expect(
            isNativeEditorSettingValueAllowed(image, source, "https://attacker.example/.cms/files/by-id/photo"),
        ).toBe(false);
        expect(isNativeEditorSettingValueAllowed(image, source, "/.cms/files/by-id/photo")).toBe(true);
    });

    test("rejects forged attribute effects that create an invalid combined native state", () => {
        const { document } = parseHTML('<a href="/" rel="nofollow"></a>');
        const anchor = document.querySelector<HTMLAnchorElement>("a")!;
        const entry = nativeCatalog().find((candidate) => candidate.tag === "a")!;
        const editor = new entry.editor(anchor);
        const targetSetting = editor
            .getSettings()[0]!
            .settings.find((setting) => setting.type !== "row" && setting.attribute === "target");
        if (!targetSetting || targetSetting.type === "row") {
            throw new Error("Missing native link target setting.");
        }
        const selection = new ShellSelection({ runtime: () => null } as never);

        selection.applySetting(editor, targetSetting, "_blank");
        expect(anchor.getAttribute("target")).toBeNull();
        expect(anchor.getAttribute("rel")).toBe("nofollow");

        selection.applySetting(editor, targetSetting, "_blank", {
            target: "_blank",
            rel: "nofollow",
        });
        expect(anchor.getAttribute("target")).toBeNull();
        expect(anchor.getAttribute("rel")).toBe("nofollow");

        selection.applySetting(editor, targetSetting, "_blank", {
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            [CMS_BINDING_ATTRIBUTES.repeat]: "items as item",
        });
        expect(anchor.getAttribute("target")).toBe("_blank");
        expect(anchor.getAttribute("rel")).toBe("noopener noreferrer nofollow");
        expect(anchor.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe(false);
    });

    test("applies only declared form endpoints and forces submit-triggered bindings", () => {
        const { document } = parseHTML("<form></form>");
        const target = document.querySelector<HTMLFormElement>("form")!;
        const entry = nativeCatalog().find((candidate) => candidate.tag === "form")!;
        const editor = new entry.editor(target);
        const setting = editor.getSettings()[0]!.settings[0]!;
        if (setting.type === "row" || setting.type !== "endpoint-picker") {
            throw new Error("Missing native form endpoint setting.");
        }
        const selection = new ShellSelection({
            dataSources: () => [{ id: "contact", label: "Contact", url: "/api/contact", method: "POST" }],
            editingPolicy: () => resolveEditorInteractionPolicy(),
            runtime: () => null,
        } as never);

        selection.applySetting(editor, setting, "/api/forged", {
            [CMS_BINDING_ATTRIBUTES.source]: "/api/forged",
            [CMS_BINDING_ATTRIBUTES.sourceMethod]: "POST",
        });
        expect(target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe(false);

        selection.applySetting(editor, setting, "/api/contact", {
            [CMS_BINDING_ATTRIBUTES.source]: "/api/contact",
            [CMS_BINDING_ATTRIBUTES.sourceMethod]: "POST",
            [CMS_BINDING_ATTRIBUTES.sourceTrigger]: "auto",
        });
        expect(target.getAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe("/api/contact");
        expect(target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod)).toBe("POST");
        expect(target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger)).toBe("submit");
    });

    test("guards the shared source mutation boundary for native forms", () => {
        const { document } = parseHTML("<form></form>");
        const target = document.querySelector<HTMLFormElement>("form")!;
        const editor = new Editor(target);
        const declared = { label: "Contact", url: "/api/contact", method: "POST" as const, fields: [] };
        const mutations = new ShellBindingMutations({
            dataSources: () => [declared],
            frameDocument: () => null,
        } as never);

        mutations.setSource(
            editor,
            { label: "Forged", url: "/api/forged", method: "POST", fields: [] },
            { url: "/api/forged", method: "POST", trigger: "change" },
        );
        expect(target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe(false);

        mutations.setSource(editor, declared, {
            url: "/api/contact",
            method: "POST",
            trigger: "change",
        });
        expect(target.getAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe("/api/contact");
        expect(target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod)).toBe("POST");
        expect(target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger)).toBe("submit");
    });

    test("preserves the required empty alt marker when switching an image to decorative", () => {
        const { document } = parseHTML('<img alt="Product">');
        const target = document.querySelector<HTMLImageElement>("img")!;
        const entry = nativeCatalog().find((candidate) => candidate.tag === "img")!;
        const editor = new entry.editor(target);
        const purpose = editor
            .getSettings()[0]!
            .settings.find((setting) => setting.type !== "row" && setting.attribute === "role");
        if (!purpose || purpose.type === "row") {
            throw new Error("Missing native image purpose setting.");
        }
        const selection = new ShellSelection({
            dataSources: () => [],
            editingPolicy: () => resolveEditorInteractionPolicy(),
            runtime: () => null,
        } as never);

        selection.applySetting(editor, purpose, "presentation", {
            role: "presentation",
            "aria-hidden": "true",
            alt: "",
        });

        expect(target.getAttribute("role")).toBe("presentation");
        expect(target.getAttribute("aria-hidden")).toBe("true");
        expect(target.hasAttribute("alt")).toBe(true);
        expect(target.getAttribute("alt")).toBe("");
    });

    test("offers image and sanitized SVG pickers at the page root", () => {
        const catalog = nativeCatalog();
        expect(
            catalog
                .filter((entry) => entry.tag === "img" || entry.tag === "svg")
                .map((entry) => [entry.tag, entry.insertable]),
        ).toEqual([
            ["img", false],
            ["svg", false],
        ]);
        const context = {
            catalog,
            editingPolicy: resolveEditorInteractionPolicy(),
            rootNode: null,
            editorChildrenOf: () => [],
            nodeForEditor: () => null,
            parentNode: () => null,
            sameSlot: () => false,
            slotChildCount: () => 0,
            slotForChild: () => undefined,
        };
        const groups = rootGroups(context);
        const media = groups[0]?.options.filter((option) => option.item?.kind === "media");
        const blockTags = groups[0]?.options.flatMap((option) =>
            option.item?.kind === "block" ? [option.item.entry.tag] : [],
        );

        expect(media?.map((option) => option.item?.label)).toEqual(["Image", "SVG"]);
        expect(blockTags).not.toContain("img");
        expect(blockTags).not.toContain("svg");

        const { document } = parseHTML("<h1>Title</h1>");
        const heading = document.querySelector<HTMLElement>("h1")!;
        const entry = catalog.find((candidate) => candidate.tag === "h1")!;
        const node = {
            kind: "editor" as const,
            editor: new entry.editor(heading),
            target: heading,
            tag: "h1",
            label: "Heading 1",
            badges: [],
            children: [],
        };
        const replacement = replaceGroups({ ...context, rootNode: node }, node);
        expect(replacement[0]?.options.filter((option) => option.item?.kind === "media")).toHaveLength(2);

        const { document: sectionDocument } = parseHTML("<section></section>");
        const section = sectionDocument.querySelector<HTMLElement>("section")!;
        const sectionEntry = catalog.find((candidate) => candidate.tag === "section")!;
        const sectionNode = {
            kind: "editor" as const,
            editor: new sectionEntry.editor(section),
            target: section,
            tag: "section",
            label: "Section",
            badges: [],
            children: [],
        };
        const nestedMedia = childGroups({ ...context, rootNode: sectionNode }, sectionNode)[0]?.options.find(
            (option) => option.item?.kind === "media",
        )?.item;
        expect(nestedMedia?.kind === "media" ? nestedMedia.accept : undefined).toEqual(["bitmap", "svg"]);
    });

    test("derives image dimensions as a system effect instead of editable fields", () => {
        const { document } = parseHTML('<img src="/.cms/files/image">');
        const image = document.querySelector<HTMLImageElement>("img")!;
        Object.defineProperties(image, {
            complete: { configurable: true, value: true },
            naturalWidth: { configurable: true, value: 1280 },
            naturalHeight: { configurable: true, value: 720 },
        });

        applyNativeEditorAttributeEffects(image, "src");

        expect(image.getAttribute("width")).toBe("1280");
        expect(image.getAttribute("height")).toBe("720");
    });
});

function flattenSetting(setting: Setting): SettingControl[] {
    return setting.type === "row" ? setting.settings : [setting];
}
