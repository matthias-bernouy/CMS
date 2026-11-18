import { expect, test } from "bun:test";
import { SiteBlocReferencedError } from "@bernouy/content";
import { createCmsSiteBloc } from "@bernouy/content";
import { referenceFixture, barrier } from "./fixture";

test("separate Mongo facades cannot delete between Page validation and its persistence", async () => {
    const { db, first, second, identity } = await referenceFixture();
    const entered = barrier();
    const resume = barrier();
    db.get("pages").beforeInsertOne = async () => {
        entered.release();
        await resume.ready;
    };
    const write = first.insertPage("/consumer", "Consumer", '<div cms-bloc="site-target"></div>');
    await entered.ready;
    const attempted = barrier();
    db.get("site_bloc_publication_locks").afterFindOne = async () => {
        attempted.release();
    };
    const deletion = second.deleteSiteBloc("site-target", 1, identity).then(
        () => null,
        (error: unknown) => error,
    );
    await attempted.ready;
    expect(await first.getBlocRecord("site-target")).not.toBeNull();
    resume.release();
    await write;
    expect(await deletion).toBeInstanceOf(SiteBlocReferencedError);
    expect(await second.getPage("/consumer")).not.toBeNull();
});

test("a Page writer waiting behind deletion revalidates the now-missing composition", async () => {
    const { db, first, second, identity } = await referenceFixture();
    const entered = barrier();
    const resume = barrier();
    db.get("blocs").beforeDeleteOne = async () => {
        entered.release();
        await resume.ready;
    };
    const deletion = first.deleteSiteBloc("site-target", 1, identity);
    await entered.ready;
    const attempted = barrier();
    db.get("site_bloc_publication_locks").afterFindOne = async () => {
        attempted.release();
    };
    const write = second.insertPage("/consumer", "Consumer", '<div cms-bloc="site-target"></div>').then(
        () => null,
        (error: unknown) => error,
    );
    await attempted.ready;
    resume.release();
    await deletion;
    expect(await write).toBeInstanceOf(Error);
    expect(await second.getPage("/consumer")).toBeNull();
    expect(await second.getBlocRecord("site-target")).toBeNull();
});

test("a draft reference committed before deletion blocks it even when the draft permits unresolved dependencies", async () => {
    const { db, raw, first, second, identity } = await referenceFixture();
    await createCmsSiteBloc(first, { tag: "site-consumer", name: "Consumer", group: "Site", content: "<p>Before</p>" });
    const draft = (await first.getBlocRecord("site-consumer"))!.siteDefinition!.draft;
    draft.structure = [{ kind: "bloc", tag: "site-target", attributes: {}, children: [] }];
    const entered = barrier();
    const resume = barrier();
    const save = raw.saveSiteBlocDraft.bind(raw);
    raw.saveSiteBlocDraft = async (...args) => {
        entered.release();
        await resume.ready;
        return save(...args);
    };
    const write = first.saveSiteBlocDraft("site-consumer", draft, 1);
    let deletion: Promise<unknown> | undefined;
    try {
        await entered.ready;
        const attempted = barrier();
        db.get("site_bloc_publication_locks").afterFindOne = async () => {
            attempted.release();
        };
        deletion = second.deleteSiteBloc("site-target", 1, identity).catch((error: unknown) => error);
        await attempted.ready;
    } finally {
        resume.release();
    }
    await write;
    expect(await deletion).toBeInstanceOf(SiteBlocReferencedError);
    expect((await first.getBlocRecord("site-consumer"))!.siteDefinition!.draft.dependencies).toContain("site-target");
    expect(await second.getBlocRecord("site-target")).not.toBeNull();
});
