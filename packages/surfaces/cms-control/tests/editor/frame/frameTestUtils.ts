export function cmsWithPage(page: {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
} | null) {
    const requestedIds: string[] = [];
    const requestedPaths: string[] = [];
    const cms = {
        repository: {
            getPageById: async (id: string) => {
                requestedIds.push(id);
                return page && page.id === id ? { visible: true, tags: [], ...page } : null;
            },
            getPage: async (path: string) => {
                requestedPaths.push(path);
                return page && page.path === path ? { visible: true, tags: [], ...page } : null;
            },
            getSystem: async () => ({ editor: { layoutCategory: "" } }),
        },
    };
    return { cms, requestedIds, requestedPaths };
}

export function cmsWithReusableDocument(document: {
    id: string;
    identifier: string;
    name: string;
    description: string;
    category: string;
    content: string;
} | null) {
    const requestedIds: string[] = [];
    const cms = {
        repository: {
            getTemplateById: async (id: string) => {
                requestedIds.push(id);
                return document && document.id === id ? document : null;
            },
        },
    };
    return { cms, requestedIds };
}

export function pricingPage(content = "<p>Hello</p>") {
    return {
        id: "page-1",
        path: "/pricing",
        title: "Pricing",
        description: "Pricing page",
        content,
    };
}
