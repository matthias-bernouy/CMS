import { RepositoryCandidateRequestError } from "../body";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function readCandidateId(request: Request): string {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "candidateId") || params.getAll("candidateId").length !== 1) {
        throw new RepositoryCandidateRequestError("Invalid candidate query");
    }
    return candidateIdentifier(params.get("candidateId"));
}

export function candidateIdentifier(value: unknown): string {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        throw new TypeError("Candidate identifier is invalid");
    }
    return value;
}
