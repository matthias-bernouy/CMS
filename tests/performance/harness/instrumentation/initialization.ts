import { record } from "./records";

type Method = (...args: never[]) => unknown;
type Methods = Record<string, Method>;
const installed = new WeakMap<object, Set<string>>();

/** Test preload only. Preserve arguments, results and exceptions; record no payload or error message. */
export function measureInitializationMethod(object: object, method: string, name: string): void {
    const target = object as Methods;
    const methods = installed.get(object) ?? new Set<string>();
    if (methods.has(method)) {
        return;
    }
    installed.set(object, methods);
    methods.add(method);
    const original = target[method];
    if (typeof original !== "function") {
        throw new Error(`Initialization performance hook is unavailable: ${name}`);
    }
    target[method] = async function (...args) {
        const started = performance.now();
        let success = false;
        try {
            const value = await original.apply(this, args);
            success = true;
            return value;
        } finally {
            record({ kind: "initialization-phase", name, durationMs: performance.now() - started, success });
        }
    };
}

export function instrumentInitialization(value: object): void {
    const prototype = value as Methods;
    const plan = prototype.plan!;
    prototype.plan = function (...args) {
        const options = (this as Methods & { options: Record<string, unknown> }).options;
        measureInitializationMethod(options as Methods, "execution", "execution.snapshot");
        measureInitializationMethod(options as Methods, "validateCandidate", "preview.total");
        for (const name of ["list", "getMetadata", "get"]) {
            measureInitializationMethod(options.source as Methods, name, `source.${name}`);
        }
        if (options.verifier) {
            for (const name of ["metadataJson", "metadata", "artifact", "evolution"]) {
                measureInitializationMethod(options.verifier as Methods, name, `verify.${name}`);
            }
        }
        return plan.apply(this, args);
    };
    measureInitializationMethod(prototype, "plan", "plan.total");
    record({ kind: "instrumentation", component: "initialization" });
}
