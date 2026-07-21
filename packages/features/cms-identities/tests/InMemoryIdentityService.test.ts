import { describe, expect, test } from "bun:test";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { identityServiceContract } from "./identityService.contract";

identityServiceContract("in-memory", () => new InMemoryIdentityService());

describe("root export boundary", () => {
    test("does not pull Mongo into the root export graph", async () => {
        const packageRoot = new URL("../", import.meta.url);
        const manifest = await Bun.file(new URL("package.json", packageRoot)).json();
        const build = await Bun.build({
            entrypoints: [new URL("src/exports/index.ts", packageRoot).pathname],
            target: "browser",
            write: false,
        });
        const bundledRoot = (await build.outputs[0]?.text()) ?? "";

        expect(manifest.exports["."]).toBe("./src/exports/index.ts");
        expect(build.success).toBeTrue();
        expect(bundledRoot).not.toContain("mongodb");
        expect(bundledRoot).not.toContain("MongoIdentityService");
    });
});
