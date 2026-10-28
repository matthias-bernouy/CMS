import type { ContentRepository } from "@bernouy/cms-content";
import type { ContentDeliveryHost } from "@bernouy/cms-content/public-delivery";

export function editorialPages(repo: ContentRepository): ContentDeliveryHost["editorialPages"] {
    return {
        async resolveRoute(path) {
            const route = await repo.getPageRoute(path);
            if (route?.state !== "current") {
                return null;
            }
            const page = await repo.getPageById(route.pageId);
            if (!page) {
                return null;
            }
            const current = await repo.getPageRoute(path);
            if (
                current?.state !== "current" ||
                current.pageId !== route.pageId ||
                current.language !== route.language
            ) {
                return null;
            }
            return {
                page: {
                    reference: { kind: "site", pageId: page.id },
                    page: structuredClone({ ...page, path }),
                    source: { kind: "site", pageId: page.id, revision: page.revision },
                    requirements: [...((await repo.getPageRequirements?.(page)) ?? [])],
                },
                language: route.language,
            };
        },
    };
}
