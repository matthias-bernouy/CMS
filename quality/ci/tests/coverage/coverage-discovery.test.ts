import { describe, expect, test } from "bun:test";
import { discoverPackages } from "../../coverage/measurement/measurement";

describe("coverage package discovery", () => {
    test("discovers manifested packages without treating authored products as layers", async () => {
        const packages = await discoverPackages();
        const paths = packages.map((entry) => entry.path);

        expect(paths).toContain("packages/surfaces/cms-core");
        expect(paths).toContain("packages/runtimes/official-repository-server");
        expect(paths.some((path) => path.startsWith("packages/official-repository/"))).toBe(false);
    });
});
