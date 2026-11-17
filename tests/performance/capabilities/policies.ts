import type { Budget, CapabilityTarget, Obligation, Variant } from "./types";

/** Initial diagnostic ceilings, declared before measurement; never calibrated to make a run pass. */
const LATENCY: Readonly<Record<Variant, number>> = {
    nominal: 500,
    cold: 2_000,
    warm: 250,
    large: 1_000,
    history: 1_000,
    concurrent: 2_000,
    invalidation: 1_000,
};

export function requiredVariants(target: CapabilityTarget): readonly Variant[] {
    const variants: Variant[] = ["nominal", "cold", "warm", "concurrent"];
    if (/(?:list|search|catalogue|aggregate|query|page|sources|snapshot|details)/u.test(target.definition.id)) {
        variants.push("large", "history");
    }
    if (target.definition.behavior.effect === "query") {
        variants.push("invalidation");
    }
    return variants;
}

export function requiredObligations(target: CapabilityTarget): readonly Obligation[] {
    return target.definition.bindings.flatMap(({ id }) =>
        requiredVariants(target).map((variant) => ({ target: target.key, binding: id, variant })),
    );
}

export function budgetFor(target: CapabilityTarget, variant: Variant): Budget {
    const asynchronous = target.definition.behavior.execution === "operation";
    const command = target.definition.behavior.effect === "command";
    return {
        latencyMs: asynchronous ? 30_000 : command ? Math.max(500, LATENCY[variant]) : LATENCY[variant],
        mongoOperations: asynchronous ? 1_000 : command ? 150 : 80,
        documentsExamined: variant === "large" || variant === "history" ? 10_000 : 2_000,
        internalRequests: asynchronous ? 100 : 15,
        requestBytes: 4 * 1024 * 1024,
        responseBytes: 4 * 1024 * 1024,
    };
}

export function loadPolicy(variant: Variant) {
    return variant === "concurrent" ? { load: { concurrency: 10, minimumRequestsPerMinute: 200 } } : {};
}
