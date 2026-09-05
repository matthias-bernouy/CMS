import type { BunPlugin } from "bun";

const LEGACY_COMPOSITION_EXTERNAL = `
const LegacyComposition = window.p9r.Composition ?? class extends HTMLElement {
    constructor(metadata) {
        super();
        this.templateSource = metadata?.template ?? "";
    }
    connectedCallback() {
        if (this.hasAttribute("data-p9r-legacy-composition")) {
            return;
        }
        this.setAttribute("data-p9r-legacy-composition", "");
        this.style.display = "contents";
        const input = this.ownerDocument.createElement("template");
        input.setAttribute("data-p9r-composition-input", "");
        input.content.append(...Array.from(this.childNodes));
        const template = this.ownerDocument.createElement("template");
        template.innerHTML = this.templateSource;
        const output = this.ownerDocument.createElement("p9r-composition-output");
        output.setAttribute("data-p9r-composition-output", "");
        output.style.display = "contents";
        output.append(template.content.cloneNode(true));
        this.replaceChildren(input, output);
    }
};
export const Composition = LegacyComposition;
`;

/**
 * Bloc bundles must not re-bundle component/editor base classes. The view side
 * reads the view bases from `window.p9r`; the editor catalog side reads the stable
 * editor API from `window.p9rEditor`. Each bloc bundle keeps only its own code.
 */
export const p9rExternalsPlugin: BunPlugin = {
    name: "p9r-externals",
    setup(build) {
        build.onResolve(
            {
                filter: /^@bernouy\/(?:components\/base|cms(?:-control)?\/component|cms-content\/editor|cms(?:-control)?\/editor|cms-source-images\/browser)$/,
            },
            (args) => ({ path: args.path, namespace: "p9r-extern" }),
        );

        build.onLoad({ filter: /.*/, namespace: "p9r-extern" }, (args) => {
            if (args.path === "@bernouy/cms-source-images/browser") {
                return {
                    contents: [
                        "export const SOURCE_IMAGE_WIDTHS = window.p9r.SOURCE_IMAGE_WIDTHS;",
                        "export const applyResponsiveSourceImageAttributes = window.p9r.applyResponsiveSourceImageAttributes;",
                        "export const buildResponsiveSourceImageAttributes = window.p9r.buildResponsiveSourceImageAttributes;",
                        "export const clearResponsiveSourceImageAttributes = window.p9r.clearResponsiveSourceImageAttributes;",
                        "export const clearResponsiveSourceImageElement = window.p9r.clearResponsiveSourceImageElement;",
                        "export const syncResponsiveSourceImageElement = window.p9r.syncResponsiveSourceImageElement;",
                    ].join("\n"),
                    loader: "js",
                };
            }
            if (
                args.path === "@bernouy/components/base" ||
                args.path === "@bernouy/cms/component" ||
                args.path === "@bernouy/cms-control/component"
            ) {
                return {
                    contents: `export const Component = window.p9r.Component;\n${LEGACY_COMPOSITION_EXTERNAL}`,
                    loader: "js",
                };
            }
            return {
                contents:
                    `export const CMS_BINDING_CORE_TAG = "cms-binding-core";\n` +
                    `export const CMS_BINDING_ATTRIBUTES = {\n` +
                    `    bindingDisabled: "cms-binding-disabled",\n` +
                    `    condition: "cms-condition",\n` +
                    `    paramSync: "cms-param-sync",\n` +
                    `    pageState: "cms-page-state",\n` +
                    `    repeat: "cms-repeat",\n` +
                    `    source: "cms-source",\n` +
                    `    sourceBody: "cms-source-body",\n` +
                    `    sourceId: "cms-source-id",\n` +
                    `    sourceMethod: "cms-source-method",\n` +
                    `    sourcePublish: "cms-source-publish",\n` +
                    `    sourceSuccessRedirect: "cms-source-success-redirect",\n` +
                    `    sourceSuccessReset: "cms-source-success-reset",\n` +
                    `    sourceStateForce: "cms-source-state-force",\n` +
                    `    sourceTrigger: "cms-source-trigger",\n` +
                    `};\n` +
                    `export const CMS_BINDING_RUNTIME_ATTRIBUTES = { ready: "cms-ready" };\n` +
                    `export const CMS_SOURCE_STATUS_SCOPE = "$source";\n` +
                    `export const CMS_SOURCES_STATUS_SCOPE = "$sources";\n` +
                    `export const CMS_SOURCE_STATES = ["loaded", "loading", "empty", "error"];\n` +
                    `export const CMS_SOURCE_TRIGGERS = ["auto", "submit"];\n` +
                    `export const Editor = window.p9rEditor.Editor;\n` +
                    `export const registerEditor = (props) => window.p9rEditor.registerEditor({\n` +
                    `    ...props,\n` +
                    `    tag:         props?.tag ?? "BE5_TAG_TO_BE_REPLACED",\n` +
                    `    label:       props?.label ?? "BE5_LABEL_TO_BE_REPLACED",\n` +
                    `    description: props?.description ?? "BE5_DESCRIPTION_TO_BE_REPLACED",\n` +
                    `    category:    props?.category ?? "BE5_GROUP_TO_BE_REPLACED",\n` +
                    `    defaultContent: props?.defaultContent ?? BE5_DEFAULT_CONTENT_TO_BE_REPLACED,\n` +
                    `    nativeElement: BE5_NATIVE_ELEMENT_TO_BE_REPLACED,\n` +
                    `    editor:      props?.editor ?? props?.cl,\n` +
                    `});\n` +
                    `export const registerEditor_opaque = (props = {}) => {\n` +
                    `    class OpaqueEditor extends window.p9rEditor.Editor {\n` +
                    `        getStructureMode() { return "opaque"; }\n` +
                    `    }\n` +
                    `    registerEditor({ ...props, editor: props?.editor ?? OpaqueEditor });\n` +
                    `};\n`,
                loader: "js",
            };
        });
    },
};
