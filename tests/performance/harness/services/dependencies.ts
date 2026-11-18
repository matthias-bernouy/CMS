import type { DependencyMetrics } from "../../capabilities/types";

/** External delivery and ownership proofs require real bounded service evidence, not merely returned DTOs. */
export function dependencyEvidence(target: string | undefined, dependencies: readonly DependencyMetrics[] = []) {
    const required = [
        /^ulvia\/(?:cms\.hosting@[^#]+#sha256:[a-f0-9]{64}:(?:domains|zones)\.verify|provider\.tls@[^#]+#sha256:[a-f0-9]{64}:certificates\.permit)$/u.test(
            target ?? "",
        )
            ? "dns"
            : undefined,
        /^ulvia\/cms\.(?:emailer\.smtp@[^#]+#sha256:[a-f0-9]{64}:emailer\.send|access@[^#]+#sha256:[a-f0-9]{64}:request-(?:email-verification|password-reset))$/u.test(
            target ?? "",
        )
            ? "smtp"
            : undefined,
    ].filter(Boolean);
    const valid = dependencies.every(
        (entry) =>
            ["dns", "smtp"].includes(entry.service) &&
            entry.complete &&
            [entry.requests, entry.requestBytes, entry.responseBytes].every(
                (value) => Number.isSafeInteger(value) && value >= 0,
            ),
    );
    return {
        complete:
            valid &&
            new Set(dependencies.map(({ service }) => service)).size === dependencies.length &&
            required.every((service) =>
                dependencies.some(
                    (entry) =>
                        entry.service === service &&
                        entry.requests > 0 &&
                        entry.requestBytes > 0 &&
                        entry.responseBytes > 0,
                ),
            ),
        requests: dependencies.reduce((sum, entry) => sum + entry.requests, 0),
        responseBytes: dependencies.reduce((sum, entry) => sum + entry.responseBytes, 0),
        network: dependencies.map((entry) => ({
            path: `controlled-${entry.service}`,
            requests: entry.requests,
            responseBytes: entry.responseBytes,
        })),
    };
}
