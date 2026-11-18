import { authoredFixture } from "../../../../fixtures/authored";
import { assertCondition } from "../../../queries/types";
import type { AuthoredKind } from "../../../../fixtures/authored";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";

export type AuthoredSource = Readonly<{
    kind: AuthoredKind;
    namespace: string;
    id: string;
    version: string;
    sourceJson: string;
    files: readonly Readonly<{ path: string; content: string }>[];
}>;

/** Retained JSON whitespace exercises source byte volume, not semantic capability complexity. */
export function sourceReadFixture(
    kind: AuthoredKind,
    namespace: string,
    implementation: ContractParentReference,
    patch: number,
    large: boolean | "expanded",
): AuthoredSource {
    assertCondition(Number.isSafeInteger(patch) && patch >= 0 && patch <= 10, "source-version-bound");
    const base = authoredFixture(kind, namespace, implementation, "source-reader");
    const version = `1.0.${patch}`;
    const files = JSON.parse(base.sourceJson).files as { path: string; content: string }[];
    const definition = files.find((file) => file.path === "definition.json")!;
    definition.content = JSON.stringify({ ...JSON.parse(definition.content), version });
    if (large) {
        const ceiling = (kind === "provider-manifest" ? 512 : 1024) * 1024;
        const padding = large === "expanded" ? ceiling - Buffer.byteLength(definition.content) - 1 : 256 * 1024;
        definition.content += `\n${" ".repeat(padding)}`;
    }
    const sourceJson = JSON.stringify({ files });
    assertCondition(
        Buffer.byteLength(sourceJson) < (large === "expanded" ? 8 : 1) * 1024 * 1024,
        "source-reader-output-bound",
    );
    if (large === "expanded" && kind !== "provider-manifest") {
        assertCondition(sourceJson.length > 1024 * 1024, "source-reader-expanded-volume");
    }
    return { ...base, version, sourceJson, files };
}

export function sourceReadInput(source: AuthoredSource, capability: string) {
    if (capability === "get-source-snapshot") {
        return { namespace: source.namespace, id: source.id, kind: source.kind, version: source.version };
    }
    return {
        namespace: source.namespace,
        version: source.version,
        [`${source.kind === "provider-manifest" ? "provider" : source.kind}Id`]: source.id,
    };
}
