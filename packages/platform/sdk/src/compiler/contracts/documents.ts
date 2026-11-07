import { URL as NodeURL } from "node:url";
import { sha256Digest } from "@bernouy/binary-media";
import type { ContractBundleAsset, ContractDocumentationDefinition } from "@bernouy/ulvia-contracts";
import {
    DOCUMENTATION_LIMITS,
    documentationPath,
    parseDocumentationMarkdown,
} from "@bernouy/ulvia-contracts/documentation";
import { readDocumentDirectory } from "ulvia-sdk/compiler/contracts/documentDirectory";
import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

interface SourceDocument {
    readonly path: string;
    readonly title: string;
    readonly bytes: Uint8Array;
}

export function snapshotDocuments(source: FeatureDefinition["documents"] = {}): readonly SourceDocument[] {
    const directory = source instanceof URL || source instanceof NodeURL ? new NodeURL(source.href) : undefined;
    const entries = Object.entries(directory ? readDocumentDirectory(directory) : source);
    if (entries.length > DOCUMENTATION_LIMITS.documents) {
        throw new SdkDefinitionError("Too many documentation sources", "$.documents");
    }
    const encoder = new TextEncoder();
    let total = 0;
    return entries.map(([path, markdown]) => {
        documentationPath(path);
        const parsed = parseDocumentationMarkdown(markdown);
        const bytes = encoder.encode(markdown);
        total += bytes.byteLength;
        if (total > DOCUMENTATION_LIMITS.totalBytes) {
            throw new SdkDefinitionError("Documentation exceeds the total byte budget", "$.documents");
        }
        return { path, title: parsed.title, bytes };
    });
}

export async function compileDocuments(documents: readonly SourceDocument[]): Promise<{
    readonly metadata: readonly ContractDocumentationDefinition[];
    readonly assets: readonly ContractBundleAsset[];
}> {
    const metadata: ContractDocumentationDefinition[] = [];
    const assets: ContractBundleAsset[] = [];
    for (const document of documents) {
        metadata.push({
            path: document.path,
            title: document.title,
            byteLength: document.bytes.byteLength,
            digest: await sha256Digest(document.bytes),
        });
        assets.push({ id: `docs/${document.path}`, bytes: document.bytes });
    }
    return { metadata, assets };
}
