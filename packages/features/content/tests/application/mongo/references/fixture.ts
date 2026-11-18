import type { Db } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { ValidatingContentRepository, createCmsSiteBloc, publishCmsSiteBloc } from "@bernouy/content";
import { FakeContentDb } from "../contentMongoFixture";

export async function referenceFixture() {
    const db = new FakeContentDb("unsupported");
    const raw = new MongoContentRepository(db as unknown as Db);
    const first = new ValidatingContentRepository(raw);
    const second = new ValidatingContentRepository(new MongoContentRepository(db as unknown as Db));
    await raw.init();
    await createCmsSiteBloc(first, { tag: "site-target", name: "Target", group: "Site", content: "<p>Shared</p>" });
    await publishCmsSiteBloc(first, { tag: "site-target", revision: 1 });
    return { db, raw, first, second, identity: (await raw.getBlocRecord("site-target"))!.siteDefinition!.id };
}
export function barrier() {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { ready, release };
}
