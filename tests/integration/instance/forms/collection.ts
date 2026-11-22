import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { captureCollectionSources } from "@bernouy/repository/repository/authoring/build";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";
import { repositoryApi } from "../repository/client";
import { blocId, markup, textValues } from "./markup";

export async function buildCollection() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-forms-collection-"));
    const directory = join(root, "forms-kit");
    const bloc = join(directory, "blocs", blocId);
    try {
        await Promise.all([
            mkdir(bloc, { recursive: true }),
            mkdir(join(directory, "translations", "en"), { recursive: true }),
            mkdir(join(directory, "examples", "form"), { recursive: true }),
            mkdir(join(directory, "texts", "definitions"), { recursive: true }),
            mkdir(join(directory, "texts", "locales", "en"), { recursive: true }),
        ]);
        const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
        await Promise.all([
            json(join(directory, "definition.json"), {
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                collectionId: "ulvia.test/forms-kit",
                publisherId: "ulvia.test",
                version: "1.0.0",
                name: "collection.name",
                locale: "en",
                exports: "*",
                states: ["form-id", "attempt-id"].map((id) => ({
                    id,
                    scope: "param",
                    schema: { type: "string", maxLength: 36 },
                })),
            }),
            json(join(bloc, "definition.json"), {
                kind: "component",
                id: blocId,
                label: "bloc.label",
                description: "bloc.description",
                categories: ["category.form"],
                root: { accepts: ["div"] },
                slots: {},
                uses: [],
                examples: ["form"],
                defaultExample: "form",
                requires: ["forms.submit", "forms.get-public-definition"].map((capabilityId) => ({
                    contractId: "ulvia/cms.forms",
                    capabilityId,
                    versionRange: "^1.0.0",
                })),
            }),
            json(join(directory, "translations", "en", "base.json"), {
                "collection.name": "Forms",
                "bloc.label": "Form",
                "bloc.description": "Form",
                "category.form": "Forms",
            }),
            json(
                join(directory, "texts", "definitions", "content.json"),
                Object.keys(textValues).map((id) => ({
                    id,
                    label: "bloc.label",
                    category: "category.form",
                    group: "category.form",
                })),
            ),
            json(join(directory, "texts", "locales", "en", "content.json"), textValues),
            json(join(directory, "examples", "form", "definition.json"), {
                id: "form",
                label: "bloc.label",
                description: "bloc.description",
                previews: [{ id: "desktop", frame: { width: 1024, height: 768 } }],
            }),
            writeFile(join(directory, "examples", "form", "document.html"), `<div cms-bloc="${blocId}"></div>`),
            writeFile(join(bloc, "style.css"), ""),
            writeFile(join(bloc, "markup.html"), markup()),
        ]);
        const catalogue = new InMemoryReleaseCatalogue();
        const raw = await Bun.file(
            resolve(
                import.meta.dir,
                "../../../../packages/runtimes/ulvia-cli/dist/bootstrap/contracts/cms/cms.forms/definition.json",
            ),
        ).text();
        const admission = await admitContractReleaseJson(raw);
        await catalogue.restore(admission.canonicalJson, admission.digest, new Date().toISOString());
        const artifact = await prepareCollectionRelease(directory, catalogue);
        const source = await captureCollectionSources(directory);
        return { artifact, source, close: () => rm(root, { recursive: true, force: true }) };
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }
}

export async function installCollection(
    collection: Awaited<ReturnType<typeof buildCollection>>,
    registry: { url: string; pat: { token: string } },
    origin: string,
    administrator: { email: string; password: string },
) {
    const repositoryId = await new RepositoryNamespaceClient(registry.url, { allowInsecureHttp: true }).identity();
    const namespaces = new RepositoryNamespaceClient(registry.url, {
        allowInsecureHttp: true,
        credential: { origin: registry.url, repositoryId, resolveToken: async () => registry.pat.token },
    });
    await new RemoteRepositoryClient(registry.url, await namespaces.ownedCredential("ulvia.test"), {
        allowInsecureHttp: true,
    }).push({
        kind: "collection",
        canonicalJson: collection.artifact.canonicalJson,
        sourceJson: collection.source.sourceJson,
        assets: collection.source.assets,
    });
    const api = repositoryApi(origin);
    const actor = await api.session(administrator.email, administrator.password);
    const catalogue = await (
        await api.request("ulvia/cms.installations", "/collections/catalogue", "QUERY", { limit: 25 }, actor)
    ).json();
    const entry = catalogue.releases.find(
        (item: { collectionId: string }) => item.collectionId === "ulvia.test/forms-kit",
    );
    if (!entry) {
        throw new Error("Published Forms test collection is not discoverable");
    }
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
        throw new Error(`Forms fixture installation failed: ${response.status} ${await response.text()}`);
    }
    await response.body?.cancel();
}
