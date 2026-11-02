import { expect } from "bun:test";
import type { Connection } from "../client";
import { setSource } from "./collection";
import type { Sources } from "./collection";

export async function incompatibleUpgrade(connection: Connection, source: Sources, pageId: string) {
    const { call } = connection;
    const definition = JSON.parse(source.files.find((file) => file.path === "definition.json")!.content);
    const next = structuredClone(source);
    setSource(next, "definition.json", JSON.stringify({ ...definition, version: "1.1.0" }));
    setSource(
        next,
        "blocs/mcp-kit-panel/markup.html",
        '<main><a href="/validation-target#destination">{{ cms.i18n.mcp-kit.link }}</a><slot name="body"></slot></main>',
    );
    const prepared = await call("ulvia.cms.repository", "prepare-collection", { sourceJson: JSON.stringify(next) });
    expect(prepared.valid).toBe(true);
    await call("ulvia.cms.repository", "publish-collection", {
        preparationId: prepared.preparationId,
        expectedDigest: prepared.digest,
    });
    const before = await call("ulvia.cms.installations", "list-collection-installations");
    const pageBefore = await call("ulvia.cms.content", "pages.get", { id: pageId });
    const target = {
        repositoryId: prepared.repositoryId,
        publisherId: prepared.publisherId,
        collectionId: prepared.collectionId,
        version: prepared.version,
        digest: prepared.digest,
        approvedBrowserRiskDigest: prepared.approvedBrowserRiskDigest,
    };
    const plan = await call("ulvia.cms.installations", "plan-collection-upgrade", { targets: [target] });
    expect(plan.status).toBe("blocked");
    expect(plan.issues).toContainEqual(
        expect.objectContaining({
            code: "incompatible-content",
            location: expect.stringContaining(pageId),
            message: expect.stringContaining("nested inside"),
        }),
    );
    expect(await call("ulvia.cms.installations", "list-collection-installations")).toEqual(before);
    expect(await call("ulvia.cms.content", "pages.get", { id: pageId })).toEqual(pageBefore);
    await call("ulvia.cms.repository", "discard-preparation", { preparationId: prepared.preparationId });
}
