import type { Connection } from "./context";
import { exerciseCollectionFreshness } from "./collections";
import { exerciseFileFreshness } from "./files";
import { exerciseSelectionFreshness } from "./selections";
import type { FileIsolationTarget } from "./fileIsolation";
export async function exerciseMutationFreshness(
    connection: Connection,
    cmsUrl: string,
    foreignSite: FileIsolationTarget,
) {
    const namespace = `cache.test${crypto.randomUUID().replaceAll("-", "")}`;
    const collections = await exerciseCollectionFreshness(connection, cmsUrl, namespace);
    const selections = await exerciseSelectionFreshness(connection, cmsUrl);
    const files = await exerciseFileFreshness(connection, cmsUrl, `${namespace}/cache-kit`, foreignSite);
    return { collections, selections, files };
}
