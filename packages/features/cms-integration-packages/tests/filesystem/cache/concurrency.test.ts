import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { cleanupRoots, resolvedPackage, temporaryCacheRoot } from "./fixtures";

const cleanup: string[] = [];
afterEach(() => cleanupRoots(cleanup));

describe("integration package cache publication races", () => {
    test("two independent writers converge on one valid object", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const first = new FsIntegrationPackageCache({ root });
        const second = new FsIntegrationPackageCache({ root });

        const [left, right] = await Promise.all([first.materialize(input), second.materialize(input)]);

        expect(left.root).toBe(right.root);
        expect(await readdir(join(root, "objects/sha256"))).toEqual([input.digest]);
        expect(await readdir(join(root, ".staging"))).toEqual([]);
        expect((await new FsIntegrationPackageCache({ root }).get(input.digest))?.digest).toBe(input.digest);
    });

    test("singleflights repeated work within one cache instance", async () => {
        const root = await temporaryCacheRoot(cleanup);
        const input = await resolvedPackage();
        const events: string[] = [];
        const cache = new FsIntegrationPackageCache({ root, observe: ({ type }) => events.push(type) });

        const [left, right] = await Promise.all([cache.materialize(input), cache.materialize(input)]);

        expect(left).toEqual(right);
        expect(events).toEqual(["materialized"]);
    });
});
