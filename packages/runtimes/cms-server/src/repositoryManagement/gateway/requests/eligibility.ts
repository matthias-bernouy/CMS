import type { RepositoryVersionBlockInput } from "@bernouy/cms-control";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { assertEqual, canonicalText, digest, packageKind, packageVersion } from "../validation/helpers";

export type PreparedRepositoryVersionBlock = Readonly<{
    input: RepositoryVersionBlockInput;
    bytes: Uint8Array;
}>;

export function prepareRepositoryVersionBlock(
    input: RepositoryVersionBlockInput,
    actor: string,
): PreparedRepositoryVersionBlock {
    const kind = packageKind(input.kind);
    const version = packageVersion(input.version);
    const currentDecision = {
        revisionId: canonicalText(input.currentDecision.revisionId, 512),
        digest: digest(input.currentDecision.digest),
    };
    const confirmation = {
        action: input.confirmation.action,
        kind: packageKind(input.confirmation.kind),
        version: packageVersion(input.confirmation.version),
        decisionRevisionId: canonicalText(input.confirmation.decisionRevisionId, 512),
        decisionDigest: digest(input.confirmation.decisionDigest),
    };
    assertEqual(confirmation.action, "block");
    assertEqual(confirmation.kind, kind);
    assertEqual(confirmation.version, version);
    assertEqual(confirmation.decisionRevisionId, currentDecision.revisionId);
    assertEqual(confirmation.decisionDigest, currentDecision.digest);
    const normalized: RepositoryVersionBlockInput = {
        kind,
        version,
        currentDecision,
        reason: canonicalText(input.reason, 4_096),
        confirmation: { ...confirmation, action: "block" as const },
    };
    return {
        input: normalized,
        bytes: canonicalJsonBytes({ ...normalized, actor }),
    };
}
