import {
    CMS_BINDING_ATTRIBUTES,
    PLATFORM_NATIVE_ADDABLE_TAGS,
    PLATFORM_NATIVE_CONTEXTUAL_TAGS,
    PLATFORM_NATIVE_SEMANTIC_TAGS,
} from "@bernouy/cms-content/editor";
import type { EditorInsertableCatalogEntry } from "../policy/editorInteractionPolicy";
import { NativeFormEditor, NativeListEditor, NativeSectionEditor } from "./containerEditors";
import { NativeImageEditor, NativeSvgEditor } from "./mediaEditors";
import { NativeAnchorEditor, NativeButtonEditor, NativeRichTextEditor } from "./textEditors";

export const PLATFORM_NATIVE_CATALOG_TAGS = [
    ...PLATFORM_NATIVE_ADDABLE_TAGS,
    ...PLATFORM_NATIVE_CONTEXTUAL_TAGS,
    ...PLATFORM_NATIVE_SEMANTIC_TAGS,
] as const;

export function createNativeEditorCatalog(
    bloc: CustomElementConstructor = nativeElementConstructor(),
): EditorInsertableCatalogEntry[] {
    const headings = [1, 2, 3, 4, 5, 6].map(
        (level): EditorInsertableCatalogEntry => ({
            tag: `h${level}`,
            label: `Heading ${level}`,
            description: `Semantic level ${level} heading.`,
            category: "Content",
            subCategory: "Text",
            defaultContent: `<h${level}>Heading ${level}</h${level}>`,
            bloc,
            editor: NativeRichTextEditor,
        }),
    );

    return [
        ...headings,
        entry(
            "p",
            "Paragraph",
            "Semantic paragraph with rich-text authoring.",
            "<p>Text</p>",
            bloc,
            NativeRichTextEditor,
        ),
        entry(
            "a",
            "Link",
            "Link to a CMS page, media file or external URL.",
            '<a href="/">Link</a>',
            bloc,
            NativeAnchorEditor,
        ),
        entry(
            "button",
            "Button",
            "Native button for explicit interactions and form submission.",
            '<button type="button">Button</button>',
            bloc,
            NativeButtonEditor,
        ),
        entry(
            "form",
            "Form",
            "Form submitted through a declared CMS source binding.",
            `<form ${CMS_BINDING_ATTRIBUTES.sourceTrigger}="submit"></form>`,
            bloc,
            NativeFormEditor,
        ),
        entry(
            "section",
            "Section",
            "Semantic section containing related content.",
            "<section><h2>Section heading</h2><p>Section content.</p></section>",
            bloc,
            NativeSectionEditor,
        ),
        entry(
            "ul",
            "Unordered list",
            "Unordered list of semantic items.",
            "<ul><li>List item</li></ul>",
            bloc,
            NativeListEditor,
        ),
        entry(
            "ol",
            "Ordered list",
            "Ordered list of semantic items.",
            "<ol><li>List item</li></ol>",
            bloc,
            NativeListEditor,
        ),
        {
            ...entry(
                "span",
                "Inline text",
                "Inline text for an explicit component slot.",
                "<span>Text</span>",
                bloc,
                NativeRichTextEditor,
            ),
            placement: { kind: "explicit-slot" },
        },
        {
            ...entry(
                "li",
                "List item",
                "Semantic item owned by a native list.",
                "<li>List item</li>",
                bloc,
                NativeRichTextEditor,
            ),
            placement: { kind: "parent-tags", tags: ["ul", "ol"] },
        },
        {
            // Media entries are runtime-owned editors. The media picker creates them only after
            // validating the selected file, so they must not use the default block insertion path.
            ...entry("img", "Image", "Image selected from the CMS media library.", undefined, bloc, NativeImageEditor),
            category: "Runtime",
            insertable: false,
        },
        {
            // See <img>: SVG insertion is exposed by the sanitized media flow below the block catalogue.
            ...entry(
                "svg",
                "SVG",
                "Sanitized inline SVG selected from the CMS media library.",
                undefined,
                bloc,
                NativeSvgEditor,
            ),
            category: "Runtime",
            insertable: false,
        },
        ...PLATFORM_NATIVE_SEMANTIC_TAGS.map((tag) => ({
            ...entry(tag, semanticLabel(tag), `Semantic ${tag} container.`, undefined, bloc, NativeSectionEditor),
            category: "Runtime",
            insertable: false,
        })),
    ];
}

function semanticLabel(tag: (typeof PLATFORM_NATIVE_SEMANTIC_TAGS)[number]): string {
    return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function entry(
    tag: string,
    label: string,
    description: string,
    defaultContent: string | undefined,
    bloc: CustomElementConstructor,
    editor: EditorInsertableCatalogEntry["editor"],
): EditorInsertableCatalogEntry {
    return {
        tag,
        label,
        description,
        category: "Content",
        defaultContent,
        bloc,
        editor,
    };
}

function nativeElementConstructor(): CustomElementConstructor {
    if (!globalThis.HTMLElement) {
        throw new Error("Cannot create the native editor catalog without HTMLElement.");
    }
    return globalThis.HTMLElement as CustomElementConstructor;
}
