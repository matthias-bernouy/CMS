import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    admitConformanceSuiteJson,
    admitContractReleaseJson,
    analyzeConformanceCoverage,
} from "@bernouy/cms-repository/contracts";

const root = resolve(import.meta.dir, "../../official-repository/contracts/ulvia.provider.cms-instances");

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
