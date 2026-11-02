import { sha256Digest } from "@bernouy/binary-media";
import { admitContractBundle, parseContractRelease } from "@bernouy/cms-repository/contracts";
import { parseDocumentationMarkdown } from "@bernouy/cms-repository/contracts/documentation";
import { contractDocument, capabilityDocument } from "../support/fixtures";

export async function documented(
    text = "# Send a message\n\nUse the selected schema.\n",
    overrides: Record<string, unknown> = {},
) {
    const bytes = new TextEncoder().encode(text);
    const document = {
        path: "guides/send.md",
        title: parseDocumentationMarkdown(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).title,
        byteLength: bytes.byteLength,
        digest: await sha256Digest(bytes),
    };
    const source = contractDocument({
        documentation: [document],
        capabilities: [capabilityDocument({ docs: [document.path] })],
        ...overrides,
    });
    return {
        source,
        bytes,
        document,
        admission: await admitContractBundle(source, [{ id: `docs/${document.path}`, bytes }]),
    };
}
