import { discoveryPeer } from "./peer";
import { compareSemVer, releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemRepositoryCatalogueIndex } from "repository/repository/filesystem/catalogueIndex";
import { RecipeProjections } from "repository/repository/filesystem/artifacts/discovery/projections";
import { LocalRepositoryYanks } from "repository/repository/filesystem/yanks";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import {
    admitCollectionRelease,
    collectionBrowserRiskDigest,
    collectionBrowserRisk,
} from "@bernouy/repository/collections";
import { SiteInitializationService } from "@bernouy/repository/collections/installations";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import { bootstrapCollection } from "../../fixture";
import { initializationFixture } from "../fixture";

const roots = new Set<string>();
afterEach(async () => {
    for (const root of roots) {
        await rm(root, { recursive: true, force: true });
        roots.delete(root);
    }
});

type Collection = { name: string; versions?: string[]; recipes?: boolean };

export async function discoveryFixture(collections: Collection[] = [{ name: "atlas" }]) {
    const f = await initializationFixture();
    const root = await mkdtemp(join(tmpdir(), "recipe-discovery-"));
    roots.add(root);
    const index = new FilesystemRepositoryCatalogueIndex(root);
    const projections = new RecipeProjections(root);
    const releases = new Map<string, string>();
    const entries = [];
    for (const collection of collections) {
        const document = JSON.parse(
            JSON.stringify(bootstrapCollection())
                .replaceAll("atlas.official/atlas", `atlas.official/${collection.name}`)
                .replaceAll("atlas-dofficial--atlas", `atlas-dofficial--${collection.name}`),
        );
        document.translations.fr = { ...document.translations.en, "bootstrap.label": "Administration française" };
        if (collection.recipes === false) {
            delete document.bootstraps;
        }
        const artifact = await admitCollectionRelease(document);
        const risk = collectionBrowserRisk(artifact.release);
        const versions = collection.versions ?? ["1.0.0"];
        const latest = versions
            .filter((version) => releaseChannel(version) === "stable")
            .sort(compareSemVer)
            .at(-1);
        for (const version of versions) {
            const release = { ...artifact.release, version };
            const json = canonicalizeIJson(release);
            const digest = `sha256:${createHash("sha256").update(json).digest("hex")}` as const;
            const path = `/v1/releases/collection/${encodeURIComponent(release.publisherId)}/${encodeURIComponent(release.collectionId)}/${version}`;
            releases.set(path, json);
            await Bun.write(join(root, "releases", release.publisherId, collection.name, `${version}.json`), json);
            if (version === latest) {
                await projections.put(await admitCollectionRelease(release));
            }
            entries.push({
                kind: "collection",
                publisherId: release.publisherId,
                id: release.collectionId,
                version,
                digest,
                metadata: {
                    name: "Atlas",
                    description: "Discovery fixture",
                    blocCount: release.blocs.length,
                    hasTheme: false,
                    browserRisk: risk.level,
                    browserRiskDigest: collectionBrowserRiskDigest(risk),
                    javaScriptBlocCount: risk.javaScriptBlocs.length,
                    frameBlocCount: risk.frameBlocs.length,
                    externalFrameOrigins: risk.externalFrameOrigins,
                    scriptsWithSameOrigin: risk.scriptsWithSameOrigin,
                },
            });
        }
    }
    const { source, observed, requests } = discoveryPeer(index, entries, releases);
    const service = new SiteInitializationService({
        ...f.options,
        source,
        verifier: {
            ...inlineCollectionVerifier,
            metadata: (...args) => {
                observed.verifications++;
                return inlineCollectionVerifier.metadata(...args);
            },
        },
    });
    const businessState = async () => ({
        initialization: await f.state.read("default"),
        pages: (await f.raw.scanPages(undefined, 1)).pages,
        collections: await f.options.collections.listInstalled("default"),
        activeUpgrade: await f.options.upgrades.getActive("default"),
    });
    const yank = async (collectionId: string, version: string) => {
        await new LocalRepositoryYanks(root).set("collection", "atlas.official", collectionId, version, "Withdrawn");
        index.invalidate();
        await index.prepareRecipes();
    };
    return { service, source, entries, releases, requests, observed, businessState, yank };
}
