import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { RepositoryRequestError } from "@bernouy/repository/repository/publication";
import type { PublicationEnvelope, RemoteCoordinate } from "@bernouy/repository/repository/publication";
import { formatCoordinate } from "../arguments";

export class PublicationPushError extends Error {
    constructor(
        coordinate: RemoteCoordinate,
        envelope: PublicationEnvelope,
        url: string,
        completed: number,
        total: number,
        cause: unknown,
    ) {
        const lines = [
            `Push stopped at ${formatCoordinate(coordinate)} (${completed}/${total} completed).`,
            `Repository: ${new URL(url).origin}`,
            cause instanceof Error ? cause.message : "Publication failed.",
        ];
        if (cause instanceof RepositoryRequestError && cause.response?.status === 409 && !cause.publicationCode) {
            lines.push("Check the receiving Repository logs for the refusal reason.");
            if (envelope.kind === "contract" && parseContractReleaseJson(envelope.canonicalJson).events?.length) {
                lines.push(
                    "Possible cause: the receiving Repository runtime does not support contract events yet. Publishing new contracts does not upgrade its runtime; upgrade the receiving stack runtime before retrying.",
                );
            }
        }
        lines.push(
            "Completed releases remain published. After resolving the failure, retry the same command; exact retries are idempotent.",
        );
        super(lines.join("\n"), { cause });
        this.name = "PublicationPushError";
    }
}
