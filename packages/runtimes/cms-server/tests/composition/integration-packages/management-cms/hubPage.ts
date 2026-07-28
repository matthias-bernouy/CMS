import type { InMemoryCmsRepository } from "@bernouy/cms-content";

export async function seedRepositoryHubPage(repository: InMemoryCmsRepository): Promise<void> {
    await repository.insertPage("/integrations", "Integration catalog");
    const page = await repository.getPage("/integrations");
    if (!page) {
        throw new Error("Repository hub acceptance page was not created");
    }
    await repository.updatePage({
        id: page.id,
        path: page.path,
        title: page.title,
        description: "CMS-authored integration repository hub",
        content:
            '<main data-repository-hub="cms"><section cms-source="/.cms/repository/api/integrations/catalog as catalog">CMS_REPOSITORY_HUB</section></main>',
        visible: true,
        tags: ["repository", "integrations"],
    });
}
