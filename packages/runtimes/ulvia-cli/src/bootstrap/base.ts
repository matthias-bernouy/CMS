import { resolve } from "node:path";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { prepareResourceSource, buildResourceArchive } from "@bernouy/resources/build";

export interface OfficialBaseResource {
    readonly profileId: "ulvia" | "repository";
    readonly locale: string;
    readonly digest: string;
    readonly bytes: Blob;
}
let prepared: Promise<readonly OfficialBaseResource[]> | undefined;
/** One bounded immutable source snapshot per official build process, like the SDK inventory. Failed builds can retry. */
export function prepareOfficialBaseResources(): Promise<readonly OfficialBaseResource[]> {
    if (!prepared) {
        prepared = buildBaseResources().catch((error: unknown) => {
            prepared = undefined;
            throw error;
        });
    }
    return prepared;
}
async function buildBaseResources(): Promise<readonly OfficialBaseResource[]> {
    const build = await compileOfficialFeatures();
    const root = resolve(import.meta.dir, "../../../../../resources/base");
    const mossa = await prepareResourceSource(resolve(root, "mossa"), build.implementedContracts);
    const repository = await prepareResourceSource(resolve(root, "repository"), build.implementedContracts);
    const locales = [...new Set([...Object.keys(mossa.translations), ...Object.keys(repository.translations)])].sort();
    const result: OfficialBaseResource[] = [];
    for (const profileId of ["ulvia", "repository"] as const) {
        const contracts = build.implementedContracts.filter(
            (contract) => profileId === "repository" || contract.release.contractId !== "ulvia/repository",
        );
        for (const locale of locales) {
            const archive = await buildResourceArchive(profileId === "ulvia" ? [mossa] : [mossa, repository], {
                locale,
                contracts,
                ...(profileId === "repository" ? { omitPages: new Map([[mossa.namespace, new Set(["/login"])]]) } : {}),
            });
            if (
                result.reduce((bytes, resource) => bytes + resource.bytes.size, 0) + archive.bytes.size >
                32 * 1024 * 1024
            ) {
                throw new RangeError("Official base ZIP build snapshot exceeds its byte limit");
            }
            result.push(Object.freeze({ profileId, locale, digest: archive.digest, bytes: archive.bytes }));
        }
    }
    return Object.freeze(result);
}
