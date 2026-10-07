import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
    admitContractBundleJson,
    admitContractReleaseJson,
    parseContractReleaseJson,
    type AdmittedContractRelease,
    verifyStoredContractReleaseJson,
} from "cms-repository/exports/contracts/index";
import { verifyFixtureAssets } from "cms-repository/contracts/core/admission/verifyFixtureAssets";
import type { ReleaseDigest } from "cms-repository/contracts/core/admission/digest";
import { InMemoryReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { LocalArtifactFiles, type LocalFixtureAsset } from "./artifacts/files";
import { LocalRepositoryYanks } from "./yanks";

export class LocalContractReleases {
    constructor(
        private readonly files: LocalArtifactFiles,
        private readonly yanks?: LocalRepositoryYanks,
    ) {}

    async release(
        bytes: string,
        sourceDirectory: string,
    ): Promise<{ added: boolean; admission: AdmittedContractRelease }> {
        const definitions = parseContractReleaseJson(bytes).fixtureAssets ?? [];
        const fixtures: LocalFixtureAsset[] = await Promise.all(
            definitions.map(async ({ id }) => ({ id, bytes: await readFile(join(sourceDirectory, "fixtures", id)) })),
        );
        return this.publish(bytes, fixtures);
    }

    async publish(
        bytes: string,
        fixtures: readonly LocalFixtureAsset[] = [],
    ): Promise<{ added: boolean; admission: AdmittedContractRelease }> {
        const admission = fixtures.length
            ? await admitContractBundleJson(bytes, fixtures)
            : await admitContractReleaseJson(bytes);
        const catalogue = await this.catalogue();
        await catalogue.publish(admission);
        const { publisherId, contractId, version } = admission.release;
        const added = await this.files.store(
            "contracts",
            publisherId,
            contractId,
            version,
            admission.canonicalJson,
            fixtures,
        );
        return { added, admission };
    }

    async catalogue(options: { includeYanks?: boolean } = {}): Promise<InMemoryReleaseCatalogue> {
        const pending = await Promise.all(
            (await this.files.list("contracts")).map(async ({ publisherId, id, version, bytes, publishedAt }) => {
                const admission = await verifyStoredContractReleaseJson(bytes, digest(bytes));
                if (
                    admission.release.publisherId !== publisherId ||
                    admission.release.contractId !== id ||
                    admission.release.version !== version ||
                    admission.canonicalJson !== bytes.toString("utf8")
                ) {
                    throw new Error(`Corrupt local contract release: ${publisherId}/${id}/${version}`);
                }
                return { admission, publishedAt };
            }),
        );
        pending.sort(
            (left, right) =>
                left.admission.release.contractId.localeCompare(right.admission.release.contractId) ||
                compareSemVer(left.admission.release.version, right.admission.release.version),
        );
        const catalogue = new InMemoryReleaseCatalogue();
        while (pending.length) {
            let published = false;
            let firstError: unknown;
            for (let index = 0; index < pending.length; ) {
                try {
                    const current = pending[index]!;
                    await catalogue.restore(
                        current.admission.canonicalJson,
                        current.admission.digest,
                        current.publishedAt,
                    );
                    pending.splice(index, 1);
                    published = true;
                } catch (error) {
                    firstError ??= error;
                    index++;
                }
            }
            if (!published) {
                throw firstError;
            }
        }
        if (options.includeYanks !== false) {
            for (const { coordinate, yank } of (await this.yanks?.entries("contract")) ?? []) {
                const [, publisherId, contractId, version] = coordinate.split("\0");
                const record = await catalogue.get(contractId!, version!);
                if (!record || record.admission.release.publisherId !== publisherId) {
                    throw new Error(`Yank refers to missing contract ${publisherId}/${contractId}@${version}`);
                }
                await catalogue.setYank(contractId!, version!, { reason: yank.reason });
            }
        }
        return catalogue;
    }

    async getMetadata(publisherId: string, contractId: string, version: string) {
        const bytes = await this.files.get("contracts", publisherId, contractId, version);
        if (!bytes) {
            return null;
        }
        const admission = await verifyStoredContractReleaseJson(bytes, digest(bytes));
        if (
            admission.release.publisherId !== publisherId ||
            admission.release.contractId !== contractId ||
            admission.release.version !== version ||
            admission.canonicalJson !== bytes.toString("utf8")
        ) {
            throw new Error(`Corrupt local contract release: ${publisherId}/${contractId}/${version}`);
        }
        return admission;
    }

    async getFixture(publisherId: string, contractId: string, version: string, assetId: string) {
        const admission = await this.getMetadata(publisherId, contractId, version);
        const definition = admission?.release.fixtureAssets?.find((asset) => asset.id === assetId);
        if (!admission || !definition) {
            return null;
        }
        const bytes = this.files.fixtureBlob(admission.canonicalJson, assetId);
        await verifyFixtureAssets([definition], [{ id: assetId, bytes }]);
        return { definition, bytes };
    }
}

function digest(bytes: Uint8Array): ReleaseDigest {
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
