import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import {
    admitCollectionRelease,
    collectionBrowserRiskDigest,
    collectionBrowserRisk,
} from "@bernouy/repository/collections";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { SiteInitializationService } from "@bernouy/repository/collections/installations";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import type { RepositoryFetch } from "@bernouy/repository/collections/http";
import { bootstrapCollection } from "../../fixture";
import { initializationFixture } from "../fixture";

type Collection = { name: string; versions?: string[]; recipes?: boolean };
type DiscoveryIntercept = (...args: Parameters<RepositoryFetch>) => Promise<Response | undefined>;

export async function discoveryFixture(collections: Collection[] = [{ name: "atlas" }]) {
    const f = await initializationFixture();
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
        for (const version of collection.versions ?? ["1.0.0"]) {
            const release = { ...artifact.release, version };
            const json = canonicalizeIJson(release);
            const digest = `sha256:${createHash("sha256").update(json).digest("hex")}`;
            const path = `/v1/releases/collection/${encodeURIComponent(release.publisherId)}/${encodeURIComponent(release.collectionId)}/${version}`;
            releases.set(path, json);
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
    const requests: { path: string; method: string; input: Record<string, unknown> }[] = [];
    const observed = {
        catalogueEntries: 0,
        releaseBytes: 0,
        verifications: 0,
        intercept: undefined as DiscoveryIntercept | undefined,
    };
    const source = new HttpCollectionRepository("official", "https://repository.example", {
        request: async (url, init) => {
            const path = url.pathname.replace("/.cms/call/ulvia/repository", "");
            const input = init.body ? JSON.parse(String(init.body)) : {};
            requests.push({ path, method: init.method ?? "GET", input });
            const intercepted = await observed.intercept?.(url, init);
            if (intercepted) {
                return intercepted;
            }
            if (path === "/v1/catalogue") {
                const offset = input.cursor ? Number(String(input.cursor).slice(5)) : 0;
                const page = entries.slice(offset, offset + Number(input.limit));
                observed.catalogueEntries += page.length;
                return Response.json({
                    releases: page,
                    ...(offset + page.length < entries.length ? { nextCursor: `page_${offset + page.length}` } : {}),
                });
            }
            const json = releases.get(path);
            if (!json) {
                throw new Error(`Unexpected discovery request: ${path}`);
            }
            observed.releaseBytes += Buffer.byteLength(json);
            return new Response(json, { headers: { "content-type": "application/json" } });
        },
    });
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
    return { service, source, entries, releases, requests, observed, businessState };
}
