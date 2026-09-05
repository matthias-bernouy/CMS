import { describe, expect, test } from "bun:test";
import type { CollectionIntegrationDefinition, DeclarativeBlocArtifactTemplate } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { completeArtifactSource, decodeDefaultContent, executableSource } from "../source";

describe("Mossa Source endpoint isolation", () => {
    test("declares every statically accessed CMS Source endpoint", async () => {
        const mossa = await definition();
        const artifacts = blocArtifacts(mossa);
        const missing: string[] = [];

        for (const resource of mossa.resources) {
            const artifact = artifacts.find(({ bloc }) => bloc.tag === resource.artifact);
            if (!artifact) {
                continue;
            }
            for (const { route, endpoint } of sourceEndpoints(executableSource(artifact))) {
                const expectedUrn = `urn:${route}:${endpoint}`;
                const declaration = resource.endpoints?.find(
                    (candidate) =>
                        candidate.endpoint === expectedUrn &&
                        (route === "system-functions" || candidate.source === route),
                );
                if (!declaration) {
                    missing.push(`${resource.id}: ${route}/${endpoint}`);
                    continue;
                }
                expect(declaration.sourceVersion.trim()).not.toBe("");
                expect(declaration.contractVersion.trim()).not.toBe("");
            }
        }

        expect(missing).toEqual([]);
    });

    test("does not expose arbitrary Source routes or endpoint names", async () => {
        const artifacts = blocArtifacts(await definition());
        const allSource = artifacts.map(completeArtifactSource).join("\n");

        expect(allSource).not.toMatch(/source-prefix|path-prefix/);
        expect(allSource).not.toMatch(/attribute:\s*["'][^"']*(?:endpoint|function-id)[^"']*["']/);
        expect(allSource).not.toMatch(/getAttribute\(["'][^"']*(?:endpoint|function-id)[^"']*["']\)/);

        const sourceIdOwners = artifacts
            .filter((artifact) =>
                /(?:attribute:\s*|getAttribute\()["']source-id["']/.test(completeArtifactSource(artifact)),
            )
            .map(({ bloc }) => bloc.tag);
        expect(sourceIdOwners).toEqual(["mossa-mondial-relay-picker"]);

        const dynamicRouteOwners = artifacts
            .filter((artifact) => /\/\.cms\/sources\/\$\{/.test(executableSource(artifact)))
            .map(({ bloc }) => bloc.tag);
        expect(dynamicRouteOwners).toEqual(["mossa-mondial-relay-picker"]);
    });

    test("gates checkout through the declared account contract", async () => {
        const mossa = await definition();
        const checkout = resourceAndArtifact(mossa, "mossa/blocs/checkout");
        const source = executableSource(checkout.artifact);

        expect(source).not.toContain("system-auth");
        expect(source).toContain("/.cms/sources/user-account/getAccount");
        expect(source).toContain("/.cms/sources/commerce/publicOfferImage");
        expect(source).toContain("error.status !== 401 && error.status !== 403");
        expect(checkout.resource.endpoints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ endpoint: "urn:user-account:getAccount", contractVersion: "^1.0.0" }),
                expect.objectContaining({ endpoint: "urn:commerce:publicOfferImage", contractVersion: "^1.0.0" }),
            ]),
        );
    });

    test("submits newsletter state through its declared CMS binding", async () => {
        const mossa = await definition();
        const newsletter = resourceAndArtifact(mossa, "mossa/blocs/newsletter-card");
        const defaultContent = decodeDefaultContent(newsletter.artifact.bloc.source) ?? "";

        expect(defaultContent).toContain("/.cms/sources/newsletter/setSubscription as newsletterSubscription");
        expect(defaultContent).not.toMatch(/<form[^>]+action=/);
        expect(newsletter.resource.endpoints).toContainEqual(
            expect.objectContaining({
                source: "newsletter",
                endpoint: "urn:newsletter:setSubscription",
                contractVersion: "^1.0.0",
                bindings: {
                    input: {
                        "body.email": "state.subscription.email",
                        "body.subscribed": "state.subscription.subscribed",
                    },
                },
            }),
        );
    });

    test("limits the delivery installation alias to the declared relay endpoint", async () => {
        const mossa = await definition();
        const picker = resourceAndArtifact(mossa, "mossa/blocs/mondial-relay-picker");
        const source = executableSource(picker.artifact);

        expect(source).toContain("/^[a-z][a-z0-9-]{0,62}$/");
        expect(source).toContain("${encodeURIComponent(sourceId)}/relayPoints");
        expect(picker.resource.endpoints).toContainEqual(
            expect.objectContaining({
                source: "mondial-relay",
                sourceVersion: ">=1.0.0 <3.0.0",
                endpoint: "urn:delivery:relayPoints",
                contractVersion: "^1.0.0",
            }),
        );
    });
});

async function definition(): Promise<CollectionIntegrationDefinition> {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    return (await repository.get("mossa")) as CollectionIntegrationDefinition;
}

function blocArtifacts(definition: CollectionIntegrationDefinition): DeclarativeBlocArtifactTemplate[] {
    return (definition.artifacts ?? []).filter(
        (artifact): artifact is DeclarativeBlocArtifactTemplate => artifact.type === "bloc",
    );
}

function resourceAndArtifact(definition: CollectionIntegrationDefinition, resourceId: string) {
    const resource = definition.resources.find(({ id }) => id === resourceId)!;
    const artifact = blocArtifacts(definition).find(({ bloc }) => bloc.tag === resource.artifact)!;
    return { resource, artifact };
}

function sourceEndpoints(source: string): Array<{ route: string; endpoint: string }> {
    return [...source.matchAll(/\/\.cms\/sources\/([a-z][a-z0-9-]*)\/([A-Za-z][A-Za-z0-9-]*)/g)]
        .map(([, route, endpoint]) => ({ route, endpoint }))
        .filter(
            (value, index, values) =>
                values.findIndex(
                    (candidate) => candidate.route === value.route && candidate.endpoint === value.endpoint,
                ) === index,
        );
}
