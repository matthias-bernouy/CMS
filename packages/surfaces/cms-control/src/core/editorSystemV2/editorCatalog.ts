import { CMS_BINDING_CORE_TAG, CMS_SNIPPET_TAG, type EditorCatalog } from "@bernouy/cms-content/editor";
import { BindingCore } from "@bernouy/components";
import {
    BindingCoreEditor,
    CodeEditor,
    HeadingEditor,
    ImageEditor,
    InputEditor,
    LinkEditor,
    ListEditor,
    ListItemEditor,
    OptionEditor,
    ParagraphEditor,
    QuoteEditor,
    SelectEditor,
    SnippetEditor,
    SpanEditor,
} from "cms-control/core/editorSystemV2/builtInEditors";

type NativeElementConstructorName =
    | "HTMLAnchorElement"
    | "HTMLElement"
    | "HTMLHeadingElement"
    | "HTMLImageElement"
    | "HTMLInputElement"
    | "HTMLLIElement"
    | "HTMLOListElement"
    | "HTMLOptionElement"
    | "HTMLParagraphElement"
    | "HTMLQuoteElement"
    | "HTMLSelectElement"
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
            tag: CMS_BINDING_CORE_TAG,
            label: "Binding core",
            description: "Provides global data scopes to editable content.",
            icon: "database",
            category: "Runtime",
            bloc: BindingCore,
            editor: BindingCoreEditor,
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
            defaultContent: "<p>Text</p>",
            bloc: nativeElementConstructor("HTMLParagraphElement"),
            editor: ParagraphEditor,
        },
        ...headingCatalogEntries(),
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
            tag: "a",
            label: "Link",
            description: "A navigational link with editable text and target settings.",
            icon: "link",
            category: "Text",
            subCategory: "Inline",
            defaultContent: `<a href="#">Link</a>`,
            bloc: nativeElementConstructor("HTMLAnchorElement"),
            editor: LinkEditor,
        },
        {
            tag: "input",
            label: "Text input",
            description: "A standard single-line text input.",
            icon: "text-cursor-input",
            category: "Forms",
            subCategory: "Controls",
            defaultContent: `<input type="text" name="search" placeholder="Search">`,
            bloc: nativeElementConstructor("HTMLInputElement"),
            editor: InputEditor,
        },
        {
            tag: "select",
            label: "Select",
            description: "A standard select field with options.",
            icon: "list-filter",
            category: "Forms",
            subCategory: "Controls",
            defaultContent: `<select name="choice"><option value="option">Option</option></select>`,
            bloc: nativeElementConstructor("HTMLSelectElement"),
            editor: SelectEditor,
        },
        {
            tag: "option",
            label: "Option",
            description: "An option inside a select field.",
            icon: "list-plus",
            category: "Forms",
            subCategory: "Controls",
            defaultContent: `<option value="option">Option</option>`,
            bloc: nativeElementConstructor("HTMLOptionElement"),
            editor: OptionEditor,
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
            defaultContent: "<ul><li>List item</li></ul>",
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
            defaultContent: "<ol><li>List item</li></ol>",
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
            defaultContent: "<li>List item</li>",
            bloc: nativeElementConstructor("HTMLLIElement"),
            editor: ListItemEditor,
        },
    ];
}

function headingCatalogEntries(): EditorCatalog {
    return [1, 2, 3, 4, 5, 6].map(level => ({
        tag: `h${level}`,
        label: `Heading ${level}`,
        description: `Level ${level} section heading.`,
        icon: "heading",
        category: "Text",
        subCategory: "Headings",
        defaultContent: `<h${level}>Heading</h${level}>`,
        bloc: nativeElementConstructor("HTMLHeadingElement"),
        editor: HeadingEditor,
    }));
}
