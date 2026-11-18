import { expect, test } from "bun:test";
import { createCmsSiteBloc, publishCmsSiteBloc, readCmsSiteBloc } from "@bernouy/content";
import { createContentReader } from "@bernouy/content/rendering";
import { editingRepositories, editingRepository } from "./repositories";

for (const [name, create] of editingRepositories) {
    test(`${name}: deleting and recreating a published tag changes catalogue and rendering revisions`, async () => {
        const { repository } = await editingRepository(create);
        const reader = createContentReader(repository);
        const input = { tag: "site-reused", name: "Reusable", group: "Site", content: "<p>Before</p>" };
        await createCmsSiteBloc(repository, input);
        await publishCmsSiteBloc(repository, { tag: input.tag, revision: 1 });
        const old = await readCmsSiteBloc(repository, { tag: input.tag });
        const catalogue = await repository.getSiteBlocsRevision();
        const rendering = await reader.getRenderingRevision!();
        await repository.deleteSiteBloc(input.tag, 1, old.definitionId);
        await createCmsSiteBloc(repository, { ...input, content: "<p>After</p>" });
        await publishCmsSiteBloc(repository, { tag: input.tag, revision: 1 });
        const replacement = await readCmsSiteBloc(repository, { tag: input.tag });
        expect(replacement.definitionId).not.toBe(old.definitionId);
        expect(replacement.publishedRevision).toBe(old.publishedRevision);
        expect({
            catalogue: await repository.getSiteBlocsRevision(),
            rendering: await reader.getRenderingRevision!(),
        }).not.toEqual({ catalogue, rendering });
        expect(await repository.getSiteBlocsRevision()).not.toBe(catalogue);
        expect(await reader.getRenderingRevision!()).not.toBe(rendering);
    });
}
