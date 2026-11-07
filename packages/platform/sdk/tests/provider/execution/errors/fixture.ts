import { capabilitiesFor, contractString, defineFeature, z } from "@bernouy/ulvia-sdk";
import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
export const metadata = { contractId: "example/errors", name: "Errors", publisherId: "example", version: "1.0.0" };
export const context = { requestId: "local", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };
export interface Services {
    notes: { read(id: string): Promise<string> };
}
export const author = capabilitiesFor<Services>();
export class MissingNote extends Error {}
export const payload = z.strictObject({ message: contractString({ minLength: 1, maxLength: 128 }) });
export const read = author({
    id: "read",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    input: z.strictObject({ id: contractString({ maxLength: 128 }) }),
    output: contractString({ maxLength: 128 }),
    errors: {
        MISSING: { retryable: false, output: payload },
        FORBIDDEN: { retryable: false, output: payload },
        UNAVAILABLE: { retryable: true, output: payload },
        EMPTY: { retryable: false },
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/read/{id}",
            input: { path: { id: "id" } },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { MISSING: 404, FORBIDDEN: 403, UNAVAILABLE: 503, EMPTY: 409 },
            },
        },
    ],
    execute: ({ input, services }) => services.notes.read(input.id),
});
export const mapError: FeatureErrorMapper = (cause) =>
    cause instanceof MissingNote ? { code: "MISSING", output: { message: "Note is absent." } } : undefined;
export function errorFeature(mapper: FeatureErrorMapper = mapError) {
    return defineFeature({ ...metadata, capabilities: [read], mapError: mapper });
}
export const unavailable = {
    notes: {
        read: async () => {
            throw new MissingNote("private-note-token");
        },
    },
};
