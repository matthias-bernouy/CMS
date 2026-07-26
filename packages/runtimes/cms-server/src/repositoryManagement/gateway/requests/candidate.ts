import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { validateIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import { parseStrictRepositoryJson } from "../strictJson";
import { canonicalText } from "../validation/helpers";

const CANDIDATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export type PreparedRepositoryCandidate = Readonly<{
    bytes: Uint8Array;
    candidateDigest: string;
    packageDigest: string;
    verificationDigest: string;
    kind: string;
    version: string;
}>;

export async function prepareRepositoryCandidate(document: Uint8Array): Promise<PreparedRepositoryCandidate> {
    const bytes = document.slice();
    const candidate = await validateIntegrationCandidateEnvelope(parseStrictRepositoryJson(bytes));
    const canonical = canonicalJsonBytes(candidate.envelope);
    if (!equalBytes(bytes, canonical)) {
        throw new TypeError("Repository candidate must be canonical");
    }
    return {
        bytes,
        candidateDigest: candidate.candidateDigest,
        packageDigest: candidate.packageDigest,
        verificationDigest: candidate.verificationDigest,
        kind: candidate.envelope.package.kind,
        version: candidate.envelope.package.version,
    };
}

export function repositoryCandidateId(value: unknown): string {
    const candidateId = canonicalText(value, 128);
    if (!CANDIDATE_ID.test(candidateId)) {
        throw new TypeError("Repository candidate ID is invalid");
    }
    return candidateId;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}
