import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { prepareCollectionCorpus } from "../context/corpus";
import { collectionMetadata, installedCollectionDetail, installedCollectionRow } from "../resources/expected";
import { assertCollectionPage, collectionRow } from "../read/metadata";
import { assertInstalledRows, assertInstalledDetail } from "../read/installed";
import { collectionStateModel } from "./model";

test("collection oracles reject stale site actions, wrong versions, duplicates, false exhaustion and private projection fields", async () => {
    const { state } = await collectionStateModel(await performanceCapabilityInventory());
    await prepareCollectionCorpus(state, "invalidation");
    const original = state.resources[0]!;
    const next = await state.create(0, 1);
    await state.publish(next);
    const item = {
        ...collectionMetadata(next, state.repositoryId),
        action: "upgrade",
        installedVersion: original.version,
    };
    const page = { revision: 1, channel: "stable", releases: [item], nextCursor: "" };
    expect(() => assertCollectionPage(page, state, false, 0, 16)).not.toThrow();
    for (const patch of [
        { releases: [{ ...item, action: "current" }] },
        { releases: [{ ...item, version: original.version, digest: original.digest }] },
        { releases: [item, item] },
        { nextCursor: "unexpected-more" },
        { revision: 0 },
        { token: "private" },
    ]) {
        expect(() => assertCollectionPage({ ...page, ...patch }, state, false, 0, 16)).toThrow();
    }
    const otherSite = { ...state, installed: new Map() };
    expect(collectionRow(otherSite, next, false).action).toBe("install");
    expect(collectionRow(state, next, false).action).toBe("upgrade");
    await state.upgrade(next);
    expect(collectionRow(state, next, false).action).toBe("current");
    const snapshot = { revision: state.revision(), items: [installedCollectionRow(next, state.repositoryId)] };
    expect(() => assertInstalledRows(snapshot, state)).not.toThrow();
    expect(() => assertInstalledRows({ ...snapshot, items: [...snapshot.items, ...snapshot.items] }, state)).toThrow();
    await state.configure("Independent changed title");
    const detail = installedCollectionDetail(next, state.repositoryId, state.revision(), "Independent changed title");
    expect(() => assertInstalledDetail(detail, state)).not.toThrow();
    expect(() => assertInstalledDetail({ ...detail, configurationJson: '{"title":"Default"}' }, state)).toThrow();
    expect(() => assertInstalledDetail({ ...detail, revision: state.revision() - 1 }, state)).toThrow();
    expect(() => assertInstalledDetail({ ...detail, blocs: [] }, state)).toThrow();
});
