import { collectionSnapshot } from "../../integration/instance/collections";
import { capability } from "./inventory";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";

export type AuthoredKind = "collection" | "contract" | "provider-manifest";

/** Pure authored files: admission and publication still happen through the real CMS capabilities. */
export function authoredFixture(
    kind: AuthoredKind,
    namespace: string,
    implementation: ContractParentReference,
    suffix = "fixture",
) {
    const version = "1.0.0";
    const resource = `fixture-${kind}-${suffix}`;
    const id = `${namespace}/${resource}`;
    if (kind === "collection") {
        const tag = `${resourceRuntimeNamespace(id)}--panel`;
        const sourceJson = collectionSnapshot(namespace)
            .replaceAll("ulvia/mcp-kit", id)
            .replaceAll("ulvia--mcp-kit--panel", tag)
            .replaceAll("blocs/mcp-kit-panel/", `blocs/${tag}/`);
        return { kind, namespace, id, version, sourceJson };
    }
    const definition =
        kind === "contract"
            ? {
                  kind,
                  protocol: "ulvia-provider/v1",
                  schemaDialect: "ulvia-schema/v1",
                  publisherId: namespace,
                  contractId: id,
                  name: "Controlled performance contract",
                  version,
              }
            : {
                  kind,
                  protocol: "ulvia-provider/v1",
                  schemaDialect: "ulvia-schema/v1",
                  providerId: id,
                  name: "Controlled performance Provider",
                  version,
                  provenance: { publisherId: namespace, publishedAt: "2026-11-17T00:00:00.000Z" },
                  buildVersionRange: "^1.0.0",
                  endpoint: { allowedOrigins: ["https://performance.invalid"] },
                  configuration: { type: "object", properties: {}, required: [] },
                  credentialSlots: [],
                  requires: [],
                  implementations: [{ ...implementation, requires: [] }],
              };
    const files = [
        { path: "definition.json", content: JSON.stringify(definition) },
        ...(kind === "contract" ? [{ path: "capabilities/read.json", content: JSON.stringify(capability()) }] : []),
    ];
    return { kind, namespace, id, version, sourceJson: JSON.stringify({ files }) };
}
