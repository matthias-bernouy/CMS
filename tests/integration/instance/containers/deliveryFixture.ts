import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { resolve } from "node:path";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { repositoryApi } from "../repository/client";

/** Explicitly published test collection for immutable Bloc asset/rendering journeys. */
export async function installDeliveryFixture(
    origin: string,
    administrator: { email: string; password: string },
    registry: { url: string; pat: { token: string } },
) {
    const namespaces = new RepositoryNamespaceClient(registry.url, {
        credential: {
            origin: registry.url,
            repositoryId: await new RepositoryNamespaceClient(registry.url).identity(),
            resolveToken: async () => registry.pat.token,
        },
    });
    await namespaces.claim("ulvia.test");
    const artifact = await prepareCollectionRelease(
        resolve(import.meta.dir, "../../../../packages/runtimes/ulvia-cli/tests/stack/fixtures/smoke-kit"),
    );
    await new RemoteRepositoryClient(registry.url, await namespaces.ownedCredential("ulvia.test")).push({
        kind: "collection",
        canonicalJson: artifact.canonicalJson,
        assets: artifact.assets,
    });
    const api = repositoryApi(origin);
    const actor = await api.session(administrator.email, administrator.password);
    const catalogue = await (
        await api.request("ulvia/cms.installations", "/collections/catalogue", "QUERY", { limit: 25 }, actor)
    ).json();
    const entry = catalogue.releases.find(
        (entry: { collectionId: string }) => entry.collectionId === artifact.release.collectionId,
    )!;
    const current = await (
        await api.request("ulvia/cms.installations", "/list-collection-installations", "GET", undefined, actor)
    ).json();
    const response = await api.request(
        "ulvia/cms.installations",
        "/install-collection",
        "POST",
        {
            expectedRevision: current.revision,
            targets: [
                {
                    repositoryId: entry.repositoryId,
                    publisherId: entry.publisherId,
                    collectionId: entry.collectionId,
                    version: entry.version,
                    digest: entry.digest,
                    approvedBrowserRiskDigest: entry.browserRiskDigest,
                },
            ],
        },
        actor,
    );
    if (!response.ok) {
        throw new Error(`Delivery fixture installation failed: ${response.status} ${await response.text()}`);
    }
    await response.body?.cancel();
}

/** A query-bearing Page exercises description caching without a bundled administration website. */
export async function createTraceProbe(origin: string, administrator: { email: string; password: string }) {
    const api = repositoryApi(origin);
    const actor = await api.session(administrator.email, administrator.password);
    const contract = parseContractReleaseJson(
        await Bun.file(
            resolve(
                import.meta.dir,
                "../../../../packages/runtimes/ulvia-cli/dist/bootstrap/contracts/cms/cms.access/definition.json",
            ),
        ).text(),
    );
    const capability = contract.capabilities.find(({ id }) => id === "resolve-actor")!;
    const errors = capability.errors.map(({ code }) => `<span cms-case="'${code}'">Unavailable</span>`).join("");
    const content = `<div cms-bloc="ulvia-dtest--smoke-kit--card" cms-query="ulvia/cms.access:resolve-actor as actor">
        <p slot="content" cms-match="actor.outcome.kind">
            <span cms-case="'none'">Waiting</span>
            <span cms-case="'success'">Trace probe</span>
            <span cms-case="'failure'">Offline</span>
            <span cms-case="'error'" cms-match="actor.outcome.code">${errors}</span>
        </p>
    </div>`;
    const created = await api.request(
        "ulvia/cms.content",
        "/pages/create",
        "POST",
        {
            path: "/trace-probe",
            title: "Trace probe",
            content,
        },
        actor,
    );
    if (!created.ok) {
        throw new Error(`Trace probe creation failed: ${created.status} ${await created.text()}`);
    }
    const draft = await created.json();
    const published = await api.request(
        "ulvia/cms.content",
        "/pages/publish",
        "POST",
        { id: draft.id, expectedRevision: draft.revision, visible: true },
        actor,
    );
    if (!published.ok) {
        throw new Error(`Trace probe publication failed: ${published.status} ${await published.text()}`);
    }
    await published.body?.cancel();
}
