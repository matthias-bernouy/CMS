import { expect, test } from "bun:test";
import { exampleResources } from "./publish";
import type { ExampleResource } from "./publish";
import type { QueryEnvironment } from "../../../queries/execute";

test("example release preparation coalesces pending coordinates, isolates environments and bounds all 21 versions", async () => {
    const environment = {} as QueryEnvironment;
    const other = {} as QueryEnvironment;
    let publishers = 0;
    const published: string[] = [];
    const resources = exampleResources(
        { targets: [], templates: [], fingerprint: "unit" },
        async (_inventory, scope) => {
            expect(scope === environment || scope === other).toBe(true);
            publishers++;
            return async (profile, patch) => {
                published.push(`${profile}:${patch}`);
                return { version: `1.0.${patch}` } as ExampleResource;
            };
        },
    );
    const first = resources(environment, "history", 0);
    expect(resources(environment, "history", 0)).toBe(first);
    await first;
    for (const profile of ["large", "history", "invalidation"] as const) {
        for (let patch = 0; patch <= (profile === "large" ? 0 : profile === "history" ? 8 : 10); patch++) {
            await resources(environment, profile, patch);
        }
    }
    expect(publishers).toBe(1);
    expect(published).toHaveLength(21);
    expect(new Set(published).size).toBe(21);
    await resources(other, "history", 0);
    expect(publishers).toBe(2);
    expect(published).toHaveLength(22);
    for (const patch of [-1, 11, NaN, Infinity]) {
        expect(() => resources(environment, "invalidation", patch)).toThrow("example-resource-version-bound");
    }
    expect(() => resources(environment, "large", 1)).toThrow("example-resource-version-bound");
    expect(() => resources(environment, "history", 9)).toThrow("example-resource-version-bound");
    expect(published).toHaveLength(22);
});
