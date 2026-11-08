import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import type { ContractReleaseReader, CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import { validateCapabilityUsage } from "repository/providers/selections/core/upgrades/requirements";
import { contractDocument } from "../../support/fixtures";

const requirements = Array.from({ length: 200 }, (_, index) => ({
    contractId: "ulvia/catalog",
    capabilityId: "read",
    location: `page:${index}`,
}));
const evidence = { complete: true, revision: "one", unknown: [], requirements };
const grants = { default: "allow-selected" as const, denied: [] };

test("repeated uses reuse immutable evidence but recheck each current grant and required version", async () => {
    const fixture = await releases();
    const selected = [selection(fixture.before)];
    expect(await validateCapabilityUsage(evidence, selected, selected, grants, [], fixture.reader)).toEqual([]);
    expect(fixture.reads()).toBe(1);
    const denied = await validateCapabilityUsage(
        evidence,
        selected,
        selected,
        { ...grants, denied: [{ contractId: "ulvia/catalog", capabilityId: "read" }] },
        [],
        fixture.reader,
    );
    expect(denied.map(({ location }) => location)).toEqual(requirements.map(({ location }) => location));
    expect(denied.every(({ code }) => code === "required-grant")).toBe(true);
    const wrongVersion = { ...evidence, requirements: requirements.map((ref) => ({ ...ref, versionRange: "^2.0.0" })) };
    const missing = await validateCapabilityUsage(wrongVersion, selected, selected, grants, [], fixture.reader);
    expect(missing).toHaveLength(requirements.length);
    expect(missing.every(({ code }) => code === "required-capability")).toBe(true);
});

test("changed exact pins compare once per capability and retain every incompatible diagnostic location", async () => {
    for (const incompatible of [false, true]) {
        const fixture = await releases(incompatible);
        const issues = await validateCapabilityUsage(
            evidence,
            [selection(fixture.after)],
            [selection(fixture.before)],
            grants,
            [],
            fixture.reader,
        );
        expect(fixture.inputReads()).toBeGreaterThan(0);
        expect(fixture.inputReads()).toBeLessThan(20);
        expect(issues).toHaveLength(incompatible ? requirements.length : 0);
        if (incompatible) {
            expect(issues.every(({ code }) => code === "incompatible-capability")).toBe(true);
            expect(issues.map(({ location }) => location)).toEqual(requirements.map(({ location }) => location));
        }
    }
});

async function releases(incompatible = false) {
    let reads = 0;
    let inputReads = 0;
    const beforeAdmission = await admitContractRelease(contractDocument("ulvia/catalog", "read"));
    const original = beforeAdmission.release.capabilities[0]!;
    const before: CatalogueContractRelease = {
        admission: {
            ...beforeAdmission,
            release: {
                ...beforeAdmission.release,
                capabilities: [
                    {
                        ...original,
                        get input() {
                            inputReads++;
                            return original.input;
                        },
                    },
                ],
            },
        },
        publishedAt: new Date(0).toISOString(),
    };
    const document = contractDocument("ulvia/catalog", "read", "2.0.0");
    const admission = await admitContractRelease(document);
    const next = admission.release.capabilities[0]!;
    const after: CatalogueContractRelease = {
        ...before,
        admission: incompatible
            ? await admitContractRelease({
                  ...admission.release,
                  capabilities: [
                      {
                          ...next,
                          input: {
                              type: "object",
                              properties: { value: { type: "string", minLength: 4, maxLength: 128 } },
                              required: ["value"],
                          },
                      },
                  ],
              })
            : admission,
    };
    const reader: ContractReleaseReader = {
        findByDigest: async (digest) => [before, after].find((record) => record.admission.digest === digest) ?? null,
        list: async (id) => [before, after].filter((record) => !id || record.admission.release.contractId === id),
        get: async (contractId, version) => {
            reads++;
            return contractId !== "ulvia/catalog" ? null : version === "1.0.0" ? before : after;
        },
    };
    return { before, after, reader, reads: () => reads, inputReads: () => inputReads };
}

function selection(record: CatalogueContractRelease): ContractSelection {
    return {
        siteId: "site:one",
        contractId: record.admission.release.contractId,
        version: record.admission.release.version,
        digest: record.admission.digest,
        installationId: "installation:one",
    };
}
