import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    admitConformanceSuiteJson,
    admitContractReleaseJson,
    analyzeConformanceCoverage,
} from "@bernouy/cms-repository/contracts";

const root = resolve(import.meta.dir, "../../official-repository/contracts/ulvia.provider.cms-instances");
const pagesRoot = resolve(import.meta.dir, "../../official-repository/contracts/ulvia.cms.pages");

test("the provider-only discovery contract and its independent suite are fully admitted", async () => {
    const release = await admitContractReleaseJson(await readFile(resolve(root, "definition.json")));
    const suiteSource = await readFile(resolve(root, "conformance.json"));
    const suite = await admitConformanceSuiteJson(suiteSource, release);
    const coverage = analyzeConformanceCoverage(release, suite.suite);

    expect(release.release).toMatchObject({
        contractId: "ulvia.provider.cms-instances",
        version: "1.0.0",
        capabilities: [{ id: "list" }, { id: "get-current" }],
    });
    expect(coverage.capabilities.every((capability) => !capability.missingSuccessAssertion)).toBe(true);
    expect(coverage.capabilities.every((capability) => capability.missingErrorCodes.length === 0)).toBe(true);
    expect(suite.suite.version).toBe("1.0.0");
    expect(suiteSource.toString()).not.toMatch(/https?:|Bearer|Docker|Mongo|filesystem|credential-format/iu);
});

test("the CMS Pages Core contract and conformance suite are fully admitted", async () => {
    const release = await admitContractReleaseJson(await readFile(resolve(pagesRoot, "definition.json")));
    const suite = await admitConformanceSuiteJson(await readFile(resolve(pagesRoot, "conformance.json")), release);
    const coverage = analyzeConformanceCoverage(release, suite.suite);

    expect(release.release).toMatchObject({
        contractId: "ulvia.cms.pages",
        version: "1.0.0",
    });
    expect(release.release.capabilities.map(({ id, access }) => ({ id, access }))).toEqual([
        { id: "list", access: "admin" },
        { id: "get", access: "admin" },
        { id: "create", access: "admin" },
        { id: "update", access: "admin" },
        { id: "publish", access: "admin" },
        { id: "delete", access: "admin" },
        { id: "rename", access: "admin" },
    ]);
    expect(coverage.capabilities.every((capability) => !capability.missingSuccessAssertion)).toBe(true);
    expect(coverage.capabilities.every((capability) => capability.missingErrorCodes.length === 0)).toBe(true);
});

test("the remaining official CMS domain contracts are admitted as bounded admin APIs", async () => {
    const ids = [
        "ulvia.cms.access",
        "ulvia.cms.collections",
        "ulvia.cms.design",
        "ulvia.cms.files",
        "ulvia.cms.operations",
        "ulvia.cms.providers",
    ];
    for (const id of ids) {
        const release = await admitContractReleaseJson(
            await readFile(resolve(import.meta.dir, `../../official-repository/contracts/${id}/definition.json`)),
        );
        expect(release.release.contractId).toBe(id);
        expect(release.release.version).toBe("1.0.0");
        expect(release.release.capabilities.every(({ access }) => access === "admin")).toBe(true);
    }
});
