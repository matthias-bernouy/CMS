import { sha256Digest } from "@bernouy/binary-media";
import { writeZip } from "@bernouy/zip";
import { validateBlocWrite } from "@bernouy/content";
import type { TBlocWrite } from "@bernouy/content";
import type { ResourceDocument } from "../src/exports";

export function documentFixture(): ResourceDocument {
    return { format: "ulvia-resources/v1", blocs: [], theme: null, texts: [], assets: [], pages: [] };
}
export function blocFixture(extra: Partial<TBlocWrite> = {}) {
    return JSON.parse(
        JSON.stringify(
            validateBlocWrite({
                id: "sample-card",
                kind: "component",
                name: "Card",
                group: "Base",
                description: "A card",
                root: { accepts: ["div"] },
                markupHTML: "<slot></slot>",
                viewJS: "",
                ownership: { kind: "code-managed" },
                ...extra,
            }),
        ),
    );
}
export async function uncheckedArchive(
    document: unknown,
    files: readonly { path: string; bytes: Blob | Uint8Array | string }[] = [],
) {
    const bytes = await writeZip([{ path: "resources.json", bytes: JSON.stringify(document) }, ...files]);
    return { bytes, expectedDigest: await sha256Digest(new Uint8Array(await bytes.arrayBuffer())) };
}
