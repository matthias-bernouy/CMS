import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";

const MAX_PAGE_LINKS = 256;

type LinkAttribute = { readonly element: Element; readonly name: "href" | "cms-mutation-redirect" };

/** Rewrites authored collection default paths to the instance's effective Page routes. */
export async function resolvePageLinks(root: Element, delivery: ContentDeliveryHost): Promise<void> {
    const attributes: LinkAttribute[] = [
        ...Array.from(root.querySelectorAll("a[href]"), (element) => ({ element, name: "href" as const })),
        ...Array.from(root.querySelectorAll("form[cms-mutation-redirect]"), (element) => ({
            element,
            name: "cms-mutation-redirect" as const,
        })),
    ];
    if (attributes.length > MAX_PAGE_LINKS) {
        throw new Error("A Page contains too many links");
    }
    const paths = [...new Set(attributes.flatMap(({ element, name }) => authoredPath(element.getAttribute(name))))];
    if (paths.length === 0) {
        return;
    }
    const resolved = await delivery.content.resolvePagePaths(paths);
    for (const { element, name } of attributes) {
        const value = element.getAttribute(name);
        const path = authoredPath(value)[0];
        const target = path ? resolved[path] : undefined;
        if (!value || !path || !target) {
            continue;
        }
        element.setAttribute(name, `${delivery.basePath}${target}${value.slice(path.length)}`);
    }
}

function authoredPath(value: string | null): string[] {
    if (!value || !value.startsWith("/") || value.startsWith("//")) {
        return [];
    }
    const path = value.split(/[?#]/u, 1)[0]!;
    return path.startsWith("/.cms/") ? [] : [path];
}
