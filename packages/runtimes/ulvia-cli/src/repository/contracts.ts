import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
    admitContractBundleJson,
    admitContractReleaseJson,
    parseContractReleaseJson,
    type AdmittedContractRelease,
} from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { LocalArtifactFiles, type LocalFixtureAsset } from "./artifactFiles";

export class LocalContractReleases {
    constructor(private readonly files: LocalArtifactFiles) {}

    async release(
        bytes: string,
        sourceDirectory: string,
    ): Promise<{ added: boolean; admission: AdmittedContractRelease }> {
        const definitions = parseContractReleaseJson(bytes).fixtureAssets ?? [];
        const fixtures: LocalFixtureAsset[] = await Promise.all(
            definitions.map(async ({ id }) => ({ id, bytes: await readFile(join(sourceDirectory, "fixtures", id)) })),
        );
        const admission = definitions.length
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

    async catalogue(): Promise<InMemoryReleaseCatalogue> {
        const pending = await Promise.all(
            (await this.files.list("contracts")).map(async ({ publisherId, id, version, bytes }) => {
                const definitions = parseContractReleaseJson(bytes).fixtureAssets ?? [];
                const fixtures = await Promise.all(
                    definitions.map(async (fixture) => ({
                        id: fixture.id,
                        bytes: await this.files.fixture(bytes.toString("utf8"), fixture.id),
                    })),
                );
                const admission = definitions.length
                    ? await admitContractBundleJson(bytes, fixtures)
                    : await admitContractReleaseJson(bytes);
                if (
                    admission.release.publisherId !== publisherId ||
                    admission.release.contractId !== id ||
                    admission.release.version !== version ||
                    admission.canonicalJson !== bytes.toString("utf8")
                ) {
                    throw new Error(`Corrupt local contract release: ${publisherId}/${id}/${version}`);
                }
                return admission;
            }),
        );
        pending.sort(
            (left, right) =>
                left.release.contractId.localeCompare(right.release.contractId) ||
                compareSemVer(left.release.version, right.release.version),
        );
        const catalogue = new InMemoryReleaseCatalogue();
        while (pending.length) {
            let published = false;
            let firstError: unknown;
            for (let index = 0; index < pending.length; ) {
                try {
                    await catalogue.publish(pending[index]!);
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
        return catalogue;
    }
}
