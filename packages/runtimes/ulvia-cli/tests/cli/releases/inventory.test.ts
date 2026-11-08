import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { prepareOfficialResources } from "../../../src/bootstrap/resources";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
test("official releases require only the SDK inventory without scanning an authored repository", async () => {
    const readdir = fs.readdir;
    const read = spyOn(fs, "readdir").mockImplementation((...args: Parameters<typeof fs.readdir>) => {
        if (String(args[0]).includes("official-repository")) {
            throw new Error("The authored repository is no longer a generation input");
        }
        return readdir(...args);
    });
    try {
        const resources = await prepareOfficialResources();
        const features = await compileOfficialFeatures();
        expect(
            resources
                .filter((resource) => resource.kind === "contract")
                .map((resource) => resource.admission.digest)
                .sort(),
        ).toEqual(features.contracts.map((contract) => contract.digest).sort());
        expect(read.mock.calls.some(([path]) => String(path).includes("official-repository"))).toBe(false);
        expect(read.mock.calls.some(([path]) => String(path).endsWith("official-repository/contracts"))).toBe(false);
        expect(resources.filter((resource) => resource.kind === "provider-manifest")).toHaveLength(1);
    } finally {
        read.mockRestore();
    }
}, 30_000);
