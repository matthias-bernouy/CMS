import { sha256Digest } from "@bernouy/binary-media";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { encodePublicationUpload } from "@bernouy/repository/repository/publication";
import { capability } from "../../../../fixtures/inventory";
import { assertCondition } from "../../../queries/types";

/** Real immutable authored documentation; none of these metadata-only test capabilities is timed as an executable handler. */
export async function catalogueContract(namespace: string, patch: number, large: boolean) {
    assertCondition(
        Number.isSafeInteger(patch) && patch >= 0 && patch < 128,
        "metadata-catalogue-contract-version-bound",
    );
    const count = large ? 64 : 1;
    const documents = await Promise.all(
        Array.from({ length: count }, async (_unused, index) => {
            const path = `guide-${patch}-${String(index).padStart(3, "0")}.md`;
            const title = `Controlled documentation ${patch} topic ${index}`;
            const token = `performancetopic${index}`;
            const content =
                `# ${title}\n\n` +
                Array.from(
                    { length: large ? 40 : 200 },
                    (_value, paragraph) =>
                        `Controlled documentation ${token} version ${patch}. Paragraph ${paragraph} describes a deterministic fixture workflow.\n\n`,
                ).join("");
            const bytes = new TextEncoder().encode(content);
            return {
                path,
                title,
                content,
                bytes,
                digest: await sha256Digest(bytes),
                capabilityId: `read.topic${String(index).padStart(3, "0")}`,
                token,
            };
        }),
    );
    const identity = {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: namespace,
        contractId: `${namespace}/controlled-documentation`,
        name: "Controlled metadata catalogue",
        version: `1.0.${patch}`,
    };
    const capabilities = documents.map((doc, index) => ({
        ...capability(),
        id: doc.capabilityId,
        docs: [doc.path],
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: `/read-${index}`,
                input: {},
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
    }));
    const admission = await admitContractBundleJson(
        JSON.stringify({
            ...identity,
            capabilities,
            documentation: documents.map(({ path, title, bytes, digest }) => ({
                path,
                title,
                byteLength: bytes.byteLength,
                digest,
            })),
        }),
        documents.map(({ path, bytes }) => ({ id: `docs/${path}`, bytes })),
    );
    const assets = documents.map(({ path, bytes, digest }) => ({ id: `docs/${path}`, bytes, digest }));
    const manifest = encodePublicationUpload({
        kind: "contract",
        canonicalJson: admission.canonicalJson,
        assets: assets.map(({ id, bytes, digest }) => ({ id, byteLength: bytes.byteLength, digest })),
    });
    return {
        kind: "contract" as const,
        id: identity.contractId,
        version: identity.version,
        namespace,
        admission,
        digest: admission.digest,
        canonicalJson: admission.canonicalJson,
        assets,
        manifest,
        documents,
    };
}

export type CatalogueContract = Awaited<ReturnType<typeof catalogueContract>>;
