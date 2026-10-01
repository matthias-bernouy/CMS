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
 * Bloc bundles must not re-bundle shared component and binding runtimes. Each
 * bundle keeps only its own view behavior and reads shared APIs from the host.
 */
export const p9rExternalsPlugin: BunPlugin = {
    name: "p9r-externals",
    setup(build) {
        build.onResolve(
            {
                filter: /^@bernouy\/(?:components\/(?:base|binding)|cms(?:-control)?\/component|cms-gateway\/media\/browser)$/,
            },
            (args) => ({ path: args.path, namespace: "p9r-extern" }),
        );

        build.onLoad({ filter: /.*/, namespace: "p9r-extern" }, (args) => {
            if (args.path === "@bernouy/cms-gateway/media/browser") {
                return {
                    contents: [
                        "export const PROVIDER_IMAGE_WIDTHS = window.p9r.PROVIDER_IMAGE_WIDTHS;",
                        "export const buildProviderImageAttributes = window.p9r.buildProviderImageAttributes;",
                        "export const syncProviderMediaImage = window.p9r.syncProviderMediaImage;",
                    ].join("\n"),
                    loader: "js",
                };
            }
            if (args.path === "@bernouy/components/binding") {
                return {
                    contents: [
                        "export const observeSource = window.p9r.observeSource;",
                        "export const readSourceData = window.p9r.readSourceData;",
                        "export const refreshSourceContext = window.p9r.refreshSourceContext;",
                        "export const setSourceContext = window.p9r.setSourceContext;",
                        "export const sourceFormRequest = window.p9r.sourceFormRequest;",
                        "export const SourceFormError = window.p9r.SourceFormError;",
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
            return undefined;
        });
    },
};
