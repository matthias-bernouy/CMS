import type { AdmittedCollectionRelease } from "../../interfaces/CollectionAdmission";
import type { RenderableBloc } from "@bernouy/cms-content/rendering";
import { replaceCollectionAssetExpressions } from "../../core/texts/expressions";
import { assertCollectionResourceIsolation } from "../../installations/core/resourceIsolation";

export function createExampleContext(
    artifact: AdmittedCollectionRelease,
    dependencies: readonly AdmittedCollectionRelease[],
) {
    const artifacts = [artifact, ...dependencies];
    const releases = artifacts.map((item) => item.release);
    assertCollectionResourceIsolation(releases);
    const files = new Map<string, Blob>();
    const assets = new Map<string, Blob>();
    const blocs = releases.flatMap((release) => release.blocs);
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    for (const item of artifacts) {
        for (const asset of item.assets) {
            const path = `assets/${item.release.collectionId}/${asset.id}`;
            const metadata = item.release.assets.find((entry) => entry.id === asset.id)!;
            const bytes = new Blob([asset.bytes], { type: metadata.mediaType });
            files.set(path, bytes);
            assets.set(`${item.release.collectionId}/${asset.id}`, bytes);
        }
    }
    const resolveAssets = async (input: string) =>
        replaceCollectionAssetExpressions(input, (namespace, id) => {
            if (!assets.has(`${namespace}/${id}`)) {
                throw new Error(`Missing example asset: ${namespace}/${id}`);
            }
            return `assets/${namespace}/${id}`;
        });
    const renderable: RenderableBloc[] = releases.flatMap((release) =>
        release.blocs.map((bloc) => ({
            id: bloc.id,
            kind: bloc.kind,
            root: bloc.root,
            markupHTML: bloc.markup,
            uses: bloc.uses,
            hasBehavior: bloc.kind === "component" && Boolean(bloc.runtime?.viewJS),
            ...(bloc.browser ? { browser: bloc.browser } : {}),
            ...(bloc.kind === "component" && bloc.runtime?.styleCSS
                ? { styleCSS: bloc.runtime.styleCSS, styleCollectionId: release.collectionId }
                : {}),
        })),
    );
    return { releases, files, assets, byId, renderable, resolveAssets };
}
