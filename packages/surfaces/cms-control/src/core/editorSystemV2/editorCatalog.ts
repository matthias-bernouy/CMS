import { CMS_SNIPPET_TAG, type EditorCatalog } from "@bernouy/cms-content/editor";
import {
    BindingCore,
    Card,
    Container,
    Grid,
} from "@bernouy/components";
import {
    BindingCoreEditor,
    CardEditor,
    CodeEditor,
    ContainerEditor,
    GridEditor,
    ImageEditor,
    ListEditor,
    ListItemEditor,
    ParagraphEditor,
    QuoteEditor,
    SnippetEditor,
    SpanEditor,
} from "cms-control/core/editorSystemV2/defaultEditors";

type NativeElementConstructorName =
    | "HTMLElement"
    | "HTMLImageElement"
    | "HTMLLIElement"
    | "HTMLOListElement"
    | "HTMLParagraphElement"
    | "HTMLQuoteElement"
    | "HTMLSpanElement"
    | "HTMLUListElement";

function nativeElementConstructor(name: NativeElementConstructorName): CustomElementConstructor {
    const constructor = globalThis[name];

    if (!constructor) {
        throw new Error(`Cannot create editor catalog: ${name} is not available.`);
    }

    return constructor as CustomElementConstructor;
}

export function createControlEditorCatalog(): EditorCatalog {
    return [
        {
            tag: "cms-binding-core",
            label: "Binding core",
            description: "Provides global data scopes to editable content.",
            icon: "database",
            category: "Runtime",
            bloc: BindingCore,
            editor: BindingCoreEditor,
        },
        {
            tag: "p9r-container",
            label: "Container",
            description: "Constrains and aligns a page region.",
            icon: "box",
            category: "Layout",
            subCategory: "Structure",
            bloc: Container,
            editor: ContainerEditor,
        },
        {
            tag: "p9r-card",
            label: "Card",
            description: "Groups content in a framed surface.",
            icon: "panel-top",
            category: "Layout",
            subCategory: "Content",
            bloc: Card,
            editor: CardEditor,
        },
        {
            tag: "p9r-grid",
            label: "Grid",
            description: "Arranges child blocks in responsive columns.",
            icon: "grid",
            category: "Layout",
            subCategory: "Structure",
            bloc: Grid,
            editor: GridEditor,
        },
        {
            tag: CMS_SNIPPET_TAG,
            label: "Snippet",
            description: "References a reusable snippet. Edit the snippet itself from the snippet editor.",
            icon: "braces",
            category: "Content",
            subCategory: "Reusable",
            bloc: nativeElementConstructor("HTMLElement"),
            editor: SnippetEditor,
        },
        {
            tag: "p",
            label: "Paragraph",
            description: "Plain rich text content.",
            icon: "pilcrow",
            category: "Text",
            bloc: nativeElementConstructor("HTMLParagraphElement"),
            editor: ParagraphEditor,
        },
        {
            tag: "img",
            label: "Image",
            description: "A media image with source, alt text and intrinsic dimensions.",
            icon: "image",
            category: "Media",
            subCategory: "Image",
            bloc: nativeElementConstructor("HTMLImageElement"),
            editor: ImageEditor,
        },
        {
            tag: "span",
            label: "Span",
            description: "Inline rich text content.",
            icon: "type",
            category: "Text",
            subCategory: "Inline",
            bloc: nativeElementConstructor("HTMLSpanElement"),
            editor: SpanEditor,
        },
        {
            tag: "code",
            label: "Code",
            description: "Inline code content.",
            icon: "code",
            category: "Text",
            subCategory: "Inline",
            bloc: nativeElementConstructor("HTMLElement"),
            editor: CodeEditor,
        },
        {
            tag: "blockquote",
            label: "Quote",
            description: "Quoted rich text content.",
            icon: "quote",
            category: "Text",
            subCategory: "Blocks",
            bloc: nativeElementConstructor("HTMLQuoteElement"),
            editor: QuoteEditor,
        },
        {
            tag: "ul",
            label: "Unordered list",
            description: "A list of unordered items.",
            icon: "list",
            category: "Text",
            subCategory: "Lists",
            bloc: nativeElementConstructor("HTMLUListElement"),
            editor: ListEditor,
        },
        {
            tag: "ol",
            label: "Ordered list",
            description: "A list of ordered items.",
            icon: "list-ordered",
            category: "Text",
            subCategory: "Lists",
            bloc: nativeElementConstructor("HTMLOListElement"),
            editor: ListEditor,
        },
        {
            tag: "li",
            label: "List item",
            description: "An item inside a list.",
            icon: "list-tree",
            category: "Text",
            subCategory: "Lists",
            bloc: nativeElementConstructor("HTMLLIElement"),
            editor: ListItemEditor,
        },
    ];
}
