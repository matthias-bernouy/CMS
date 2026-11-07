import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import { admitProviderManifest } from "@bernouy/ulvia-providers";
import { contractDocument } from "../../contracts/tests/support/fixtures";

function readPort(admission: AdmittedContractRelease): ContractReleaseReader {
    const record = Object.freeze({ admission, publishedAt: "2026-11-07T00:00:00Z" });
    return Object.freeze({
        async findByDigest(digest) {
            return digest === admission.digest ? record : null;
        },
        async get(contractId, version) {
            return contractId === admission.release.contractId && version === admission.release.version ? record : null;
        },
        async list(contractId) {
            return contractId === undefined || contractId === admission.release.contractId ? [record] : [];
        },
    } satisfies ContractReleaseReader);
}

function manifest(admission: AdmittedContractRelease, digest: string = admission.digest) {
    return {
        kind: "provider-manifest",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        providerId: "ulvia/readonly-provider",
        name: "Read-only catalogue Provider",
        version: "1.0.0",
        provenance: { publisherId: "ulvia", publishedAt: "2026-11-07T00:00:00Z" },
        buildVersionRange: ">=1.0.0 <2.0.0",
        endpoint: {
            allowedOrigins: ["https://provider.example.test"],
            defaultOrigin: "https://provider.example.test",
        },
        configuration: { type: "object", properties: {}, required: [] },
        credentialSlots: [{ id: "provider-token", label: "Token", required: true, secretType: "token" }],
        implementations: [
            {
                contractId: admission.release.contractId,
                version: admission.release.version,
                digest,
                requires: [],
            },
        ],
        requires: [],
    };
}

test("admits a Provider using only a frozen contract read port", async () => {
    const contract = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const reader = readPort(contract);
    const admitted = await admitProviderManifest(manifest(contract), reader);

    expect(admitted.manifest.implementations[0]?.digest).toBe(contract.digest);
    expect((await reader.get(contract.release.contractId, contract.release.version))?.admission).toBe(contract);
});

test("an unavailable exact implementation digest refuses admission without changing catalogue data", async () => {
    const contract = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const reader = readPort(contract);
    await expect(admitProviderManifest(manifest(contract, `sha256:${"0".repeat(64)}`), reader)).rejects.toThrow(
        "implemented contract version and digest",
    );

    expect((await reader.list())[0]?.admission.digest).toBe(contract.digest);
});
