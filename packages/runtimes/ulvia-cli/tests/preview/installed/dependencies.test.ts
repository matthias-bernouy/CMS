import { expect, test } from "bun:test";
import { pathToFileURL } from "node:url";
import { playwrightModulesDirectory } from "../../../src/capture-worker/engine";

test("capture dependency mounts follow npm hoisting, nested installs and Bun linked stores", () => {
    for (const entry of [
        "/installation with spaces/node_modules/playwright/index.mjs",
        "/installation with spaces/node_modules/@cyaxis/ulvia/node_modules/playwright/index.mjs",
        "/installation with spaces/node_modules/.bun/playwright@1.64.1/node_modules/playwright/index.mjs",
    ]) {
        expect(playwrightModulesDirectory(pathToFileURL(entry).href)).toBe("/installation with spaces/node_modules");
    }
});

test("capture dependency mounts refuse paths outside a dependency tree instead of exposing a parent directory", () => {
    for (const entry of ["/installation/playwright/index.mjs", "/node_modules-backup/playwright/index.mjs"]) {
        expect(() => playwrightModulesDirectory(pathToFileURL(entry).href)).toThrow(
            expect.objectContaining({ code: "UNAVAILABLE" }),
        );
    }
});
