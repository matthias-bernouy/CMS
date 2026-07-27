import { ContentValidationError } from "cms-content/core/validation/errors";

export function nextSiteBlocUpdatedAt(previous: Date, candidate = new Date()): Date {
    const candidateTime = candidate.getTime();
    if (!Number.isFinite(candidateTime)) {
        throw new ContentValidationError("publicationDate", "must be a valid date");
    }
    return new Date(Math.max(candidateTime, previous.getTime() + 1));
}
