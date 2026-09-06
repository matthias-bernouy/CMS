import { createHash } from "node:crypto";

type Resource = Record<string, unknown>;
export function signingBinding(accountId: string, resourceId: string, destination: string, secret: string) {
    return { accountId, destination, digest: digest(accountId, resourceId, secret) };
}
export function signingBindingMatches(
    resources: Resource[],
    accountId: string,
    resourceId: string,
    destination: string,
    secret: unknown,
): boolean {
    if (typeof secret !== "string" || !secret.startsWith("whsec_")) {
        return false;
    }
    return resources.some((resource) => {
        const binding = resource.signingSecret;
        return (
            resource.id === resourceId &&
            isRecord(binding) &&
            binding.accountId === accountId &&
            binding.destination === destination &&
            binding.digest === digest(accountId, resourceId, secret)
        );
    });
}
export function trustedSigningOutputs(resources: Resource[], accountId: string, generated: Resource) {
    const existingOutputs: Record<string, string> = {};
    const existingResourceIds: Record<string, string> = {};
    for (const resource of resources) {
        const binding = resource.signingSecret;
        if (!isRecord(binding) || typeof binding.destination !== "string" || typeof resource.id !== "string") {
            continue;
        }
        const name = binding.destination;
        if (signingBindingMatches([resource], accountId, resource.id, name, generated[name])) {
            existingOutputs[name] = generated[name] as string;
            existingResourceIds[name] = resource.id;
        }
    }
    return { existingOutputs, existingResourceIds };
}
export function signingBindingsConfirmed(resources: Resource[], generated: Resource, names: string[]): boolean {
    return names.every((name) =>
        resources.some((resource) => {
            const binding = resource.signingSecret;
            return (
                isRecord(binding) &&
                typeof binding.accountId === "string" &&
                typeof resource.id === "string" &&
                signingBindingMatches([resource], binding.accountId, resource.id, name, generated[name])
            );
        }),
    );
}
function digest(accountId: string, resourceId: string, secret: string): string {
    return createHash("sha256").update([accountId, resourceId, secret].join("\n")).digest("hex");
}
function isRecord(value: unknown): value is Resource {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
