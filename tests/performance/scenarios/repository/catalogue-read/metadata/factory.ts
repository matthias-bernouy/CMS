import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { publicationCollection } from "../../resources/collection";
import { publicationContract } from "../../resources/contract";
import { publicationProvider } from "../../resources/provider";
import { collectionBrowserRisk, collectionBrowserRiskDigest } from "@bernouy/repository/collections";
import { assertCondition } from "../../../queries/types";
import type { DiscoveryImplementation, PublicResourceFactory } from "./types";

export async function publicResourceFactory(
    namespace: string,
    implementation: DiscoveryImplementation,
    bootstraps = false,
): Promise<PublicResourceFactory> {
    const catalogue = new InMemoryReleaseCatalogue();
    const build = await compileOfficialFeatures();
    for (const admission of build.contracts) {
        await catalogue.publish(admission);
    }
    return async (kind, index, patch) => {
        assertCondition(
            Number.isSafeInteger(index) &&
                index >= 0 &&
                index < 64 &&
                Number.isSafeInteger(patch) &&
                patch >= 0 &&
                patch <= 32,
            "registry-discovery-fixture-bound",
        );
        const suffix = `catalogue-${String(index).padStart(3, "0")}`;
        const version = `1.0.${patch}`;
        const name = `Discovery ${kind} ${index} version ${patch}`;
        const description = `Controlled public discovery version ${patch}`;
        if (kind === "contract") {
            const resource = await publicationContract(namespace, version, 0, { resource: suffix, name, description });
            return {
                reference: { kind, publisherId: namespace, id: resource.contractId, version, digest: resource.digest },
                canonicalJson: resource.canonicalJson,
                manifest: resource.manifest,
                assets: [{ id: resource.asset.id, bytes: resource.bytes, digest: resource.asset.digest }],
                name,
                description,
                metadata: { name, description },
                contractIds: [resource.contractId],
            };
        }
        if (kind === "provider-manifest") {
            const resource = await publicationProvider(namespace, implementation, catalogue, { suffix, version, name });
            return {
                reference: { kind, publisherId: namespace, id: resource.id, version, digest: resource.digest },
                canonicalJson: resource.canonicalJson,
                manifest: resource.manifest,
                assets: [],
                name,
                description: "",
                metadata: { name },
                contractIds: [implementation.contractId],
            };
        }
        const extra = bootstraps
            ? [
                  {
                      path: "bootstrap.json",
                      content: JSON.stringify({
                          bootstraps: ["first", "second"].map((id) => ({
                              id,
                              label: "collection.name",
                              description: "collection.description",
                              requires: [],
                              includes: [],
                              pages: [
                                  {
                                      id: "page",
                                      exampleId: "panel",
                                      path: `/discovery-${id}`,
                                      title: "collection.name",
                                      description: "collection.description",
                                      indexing: false,
                                      visible: true,
                                  },
                              ],
                          })),
                      }),
                  },
                  {
                      path: "translations/fr/catalogue.json",
                      content: JSON.stringify({
                          "collection.name": `${name} FR`,
                          "collection.description": `${description} FR`,
                      }),
                  },
              ]
            : [];
        const resource = await publicationCollection(namespace, implementation, extra, {
            suffix,
            version,
            label: name,
            description,
        });
        const risk = collectionBrowserRisk(resource.release);
        return {
            reference: { kind, publisherId: namespace, id: resource.id, version, digest: resource.digest },
            canonicalJson: resource.canonicalJson,
            manifest: resource.manifest,
            assets: resource.assets,
            name,
            description,
            contractIds: [
                ...new Set(
                    resource.release.blocs.flatMap((bloc) =>
                        bloc.requires.map((requirement) => requirement.contractId),
                    ),
                ),
            ],
            metadata: {
                name,
                description,
                blocCount: resource.release.blocs.length,
                hasTheme: Boolean(resource.release.theme),
                browserRisk: risk.level,
                browserRiskDigest: collectionBrowserRiskDigest(risk),
                javaScriptBlocCount: risk.javaScriptBlocs.length,
                frameBlocCount: risk.frameBlocs.length,
                externalFrameOrigins: risk.externalFrameOrigins,
                scriptsWithSameOrigin: risk.scriptsWithSameOrigin,
            },
            ...(bootstraps
                ? {
                      bootstrap: {
                          label: name,
                          description,
                          frenchLabel: `${name} FR`,
                          frenchDescription: `${description} FR`,
                          pageCount: 1,
                          includeCount: 0,
                      },
                  }
                : {}),
        };
    };
}
