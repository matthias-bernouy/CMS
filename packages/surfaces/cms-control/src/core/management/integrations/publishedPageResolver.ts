import type { CmsRepository } from "@bernouy/cms-content";
import type { IntegrationPublishedPageResolver } from "@bernouy/cms-integrations";

export function publishedPageResolver(
    repository: Pick<CmsRepository, "getPublishedPage">,
): IntegrationPublishedPageResolver {
    return async (path) => {
        const page = await repository.getPublishedPage(path);
        if (!page) {
            return null;
        }
        return {
            id: page.id,
            path: page.path,
            title: page.title,
            description: page.description,
            content: page.content,
        };
    };
}
