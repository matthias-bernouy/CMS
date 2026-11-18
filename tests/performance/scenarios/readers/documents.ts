import { createHash } from "node:crypto";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { assertTextChunk, consumeText } from "./continuation";
import type { PreparedSample } from "../../harness/execution/samples";
import type { ReaderContext } from "./context";

let compiled: ReturnType<typeof compileOfficialFeatures> | undefined;

export async function prepareDocumentReader(context: ReaderContext, binding: string): Promise<PreparedSample> {
    compiled ??= compileOfficialFeatures();
    const admission = (await compiled).contracts.find((entry) => entry.release.contractId === "ulvia/cms.content");
    assertCondition(admission);
    const declaration = admission.release.documentation?.find((entry) => entry.path === "overview.md");
    const asset = admission.documentationAssets?.find((entry) => entry.id === "docs/overview.md");
    assertCondition(declaration && asset);
    const expected = await asset.bytes.text();
    assertCondition(Buffer.byteLength(expected) === declaration.byteLength);
    assertCondition(`sha256:${createHash("sha256").update(expected).digest("hex")}` === declaration.digest);
    const reference = {
        contractId: admission.release.contractId,
        releaseDigest: admission.digest,
        path: declaration.path,
    };
    const input = { reference };
    let first: unknown;
    return {
        async send() {
            return (
                await context.call("documentation.get", binding, input, (output) => {
                    const row = requireRecord(output);
                    assertCondition(canonicalizeIJson(row.reference) === canonicalizeIJson(reference));
                    assertCondition(row.version === admission.release.version && row.title === declaration.title);
                    assertTextChunk(row, expected, 0, 16384, true);
                    first = row;
                })
            ).observation;
        },
        async verify() {
            await consumeText(first, expected, 16384, true, (offset) =>
                context.checked("documentation.get", { ...input, offset }),
            );
            const end = await context.checked("documentation.get", { ...input, offset: expected.length });
            assertTextChunk(end, expected, expected.length, 16384, true);
            await context.refused("documentation.get", { ...input, offset: expected.length + 1 }, [422]);
            for (const path of ["../secrets.md", "%2e%2e/secrets.md", "/etc/passwd"]) {
                await context.refused("documentation.get", { reference: { ...reference, path } }, [422]);
            }
            await context.refused(
                "documentation.get",
                { reference: { ...reference, releaseDigest: `sha256:${"0".repeat(64)}` } },
                [409],
            );
        },
    };
}
