import { expect, test } from "bun:test";
import { createCmsSiteBloc, publishCmsSiteBloc, readCmsSiteBloc, SiteBlocReferencedError } from "@bernouy/content";
import { extractRefs } from "content/blocs/core/markup/contentRefs";
import { editingRepositories, editingRepository } from "./repositories";

for (const [name, create] of editingRepositories) {
    for (const [label, markup] of [
        ["double quotes", '<div cms-bloc="site-target"></div>'],
        ["single quotes", "<div cms-bloc='site-target'></div>"],
        ["case folding", '<div CMS-BLOC="SITE-TARGET"></div>'],
        ["attribute whitespace", "<div cms-bloc \n=\t 'site-target'></div>"],
        ["another tag", '<div cms-bloc="site-other"></div>'],
        ["tag prefix", '<div cms-bloc="site-target-extra"></div>'],
        ["plain text", "site-target"],
    ] as const) {
        test(`${name}: deletion and the canonical content-ref scanner agree on ${label}`, async () => {
            const { raw, repository } = await editingRepository(create);
            await createCmsSiteBloc(repository, {
                tag: "site-target",
                name: "Target",
                group: "Site",
                content: "<p>Target</p>",
            });
            await publishCmsSiteBloc(repository, { tag: "site-target", revision: 1 });
            const target = await readCmsSiteBloc(repository, { tag: "site-target" });
            // Exercise stored inline references independently of declared artifact.uses.
            await raw.createBloc({
                id: "code-consumer",
                kind: "composition",
                name: "Consumer",
                group: "Code",
                description: "",
                root: { accepts: ["div"] },
                viewJS: "",
                markupHTML: markup,
            });
            const before = await raw.getBlocRecord("site-target");
            const result = await repository.deleteSiteBloc("site-target", 1, target.definitionId).then(
                () => null,
                (error: unknown) => error,
            );
            if (extractRefs(markup).blocs.has("site-target")) {
                expect(result).toBeInstanceOf(SiteBlocReferencedError);
                expect(await raw.getBlocRecord("site-target")).toEqual(before);
            } else {
                expect(result).toBeNull();
                expect(await raw.getBlocRecord("site-target")).toBeNull();
            }
        });
    }
}
