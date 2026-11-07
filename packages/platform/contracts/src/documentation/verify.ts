import type { ContractRelease } from "../interfaces/ContractRelease";
import type { VerifiedFixtureAsset } from "../core/admission/admitContractRelease";
import { ReleaseValidationError } from "../core/protocol/errors";
import { parseDocumentationMarkdown } from "./markdown";

export async function verifyDocumentation(
    release: ContractRelease,
    assets: readonly VerifiedFixtureAsset[],
): Promise<void> {
    const paths = new Set(release.documentation?.map((doc) => doc.path));
    for (const doc of release.documentation ?? []) {
        const bytes = assets.find((asset) => asset.id === `docs/${doc.path}`)?.bytes;
        if (!bytes) {
            throw new ReleaseValidationError("invalid_contract", "missing documentation bytes");
        }
        let text: string;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(await bytes.arrayBuffer());
        } catch {
            throw new ReleaseValidationError("invalid_contract", "documentation must be valid UTF-8");
        }
        const parsed = parseDocumentationMarkdown(text);
        if (parsed.title !== doc.title) {
            throw new ReleaseValidationError("invalid_contract", "documentation title disagrees with Markdown");
        }
        for (const link of parsed.links) {
            if (link.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(link)) {
                continue;
            }
            const raw = link.split(/[?#]/u, 1)[0]!;
            let decoded: string;
            try {
                decoded = decodeURIComponent(raw);
            } catch {
                throw new ReleaseValidationError("invalid_contract", "invalid documentation link");
            }
            const parts = doc.path.split("/").slice(0, -1);
            if (decoded.startsWith("/") || decoded.includes("\\")) {
                throw new ReleaseValidationError("invalid_contract", "documentation links must stay in docs/");
            }
            for (const part of decoded.split("/")) {
                if (part === "..") {
                    if (!parts.length) {
                        throw new ReleaseValidationError("invalid_contract", "documentation link escapes docs/");
                    }
                    parts.pop();
                } else if (part && part !== ".") {
                    parts.push(part);
                }
            }
            if (!paths.has(parts.join("/"))) {
                throw new ReleaseValidationError("invalid_contract", `missing internal documentation link: ${link}`);
            }
        }
    }
}
