import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";

export async function integrationVerificationContractLineageId(kind: string, contractId: string): Promise<string> {
    const digest = await sha256Hex(canonicalJsonBytes({ kind, contractId }));
    return `contract-${digest.slice(0, 32)}`;
}

export async function integrationVerificationContractRevisionId(value: unknown): Promise<string> {
    const digest = await sha256Hex(canonicalJsonBytes(value));
    return `contract-revision-${digest.slice(0, 32)}`;
}
