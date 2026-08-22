import { SOURCE_INDEXING_VARIABLE_NAMESPACE } from "@bernouy/cms-sources";

/** Namespaces owned by the CMS metadata runtime; integrations cannot declare them. */
export const PAGE_METADATA_RESERVED_NAMESPACES = [SOURCE_INDEXING_VARIABLE_NAMESPACE, "page", "site"] as const;

/** Platform values available independently from the selected dynamic content. */
export const PAGE_METADATA_PLATFORM_VARIABLES = ["page.path", "site.host", "site.language", "site.name"] as const;

export type PageMetadataScalar = string | number;
export type PageMetadataScope = Readonly<Record<string, PageMetadataScalar | undefined>>;

/** Shared runtime context for SEO metadata and future structured-data mappings. */
export type PageMetadataContext = Readonly<{
    content: PageMetadataScope;
    page: PageMetadataScope;
    site: PageMetadataScope;
}>;

const VARIABLE_PATTERN = /\$\{\s*(content|page|site)\.([a-z][a-zA-Z0-9_-]*)\s*\}/gu;
const EXPRESSION_PATTERN = /\$\{[^}]*\}/gu;
const SUPPORTED_EXPRESSION_PATTERN = /^\$\{\s*(content|page|site)\.([a-z][a-zA-Z0-9_-]*)\s*\}$/u;

/** Resolve only platform-owned metadata variables. Unknown or unavailable values become empty text. */
export function resolvePageMetadataTemplate(template: string, context: PageMetadataContext): string {
    return resolvePageMetadataTemplateResult(template, context).value;
}

export type PageMetadataTemplateResult = {
    value: string;
    complete: boolean;
};

/** Resolve a template while reporting whether every expression produced a value. */
export function resolvePageMetadataTemplateResult(
    template: string,
    context: PageMetadataContext,
): PageMetadataTemplateResult {
    let complete = !(template.match(EXPRESSION_PATTERN) ?? []).some(
        (expression) => !SUPPORTED_EXPRESSION_PATTERN.test(expression),
    );
    const value = template.replace(VARIABLE_PATTERN, (_match, namespace: keyof PageMetadataContext, name: string) => {
        const value = context[namespace][name];
        if ((typeof value === "string" && value.length > 0) || typeof value === "number") {
            return String(value);
        }
        complete = false;
        return "";
    });
    return { value, complete };
}
