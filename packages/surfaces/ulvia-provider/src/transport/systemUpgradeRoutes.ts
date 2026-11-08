import type { Runner } from "@bernouy/http-runner";
import { readBoundedRequestBody } from "@bernouy/http-runner";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { ProviderInstanceLifecycle } from "../instances/lifecycle";
import type { SystemUpgradeInput } from "../instances/installationPlan";

type Handler = (request: Request) => Promise<Response>;
type Operation = "review" | "apply" | "resume";
type ParsedInput =
    | { operation: "resume"; administratorSub: string }
    | (SystemUpgradeInput & { operation: "review" })
    | (SystemUpgradeInput & { operation: "apply"; planDigest: string });

/** Infrastructure control only; the caller's operator token is checked before reading the body. */
export function mountSystemUpgradeRoutes(
    runner: Runner,
    lifecycle: ProviderInstanceLifecycle,
    authorize: (handler: Handler) => Handler,
    onError: (error: unknown) => Response,
): void {
    for (const [suffix, operation] of [
        ["/system/plan", "review"],
        ["/system", "apply"],
        ["/system/resume", "resume"],
    ] as const) {
        runner.post(
            `/ulvia/operator/instances/:instanceId${suffix}`,
            authorize(async (request) => {
                try {
                    const value = await readInput(request, operation);
                    const path = new URL(request.url).pathname;
                    const id = decodeURIComponent(path.slice("/ulvia/operator/instances/".length, -suffix.length));
                    const result =
                        value.operation === "resume"
                            ? await lifecycle.resumeSystemUpgrade(id, value.administratorSub)
                            : value.operation === "review"
                              ? await lifecycle.reviewSystemUpgrade(id, value)
                              : await lifecycle.upgradeSystem(id, value);
                    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
                } catch (error) {
                    return onError(error);
                }
            }),
        );
    }
}

async function readInput(request: Request, operation: Operation): Promise<ParsedInput> {
    const bytes = await readBoundedRequestBody(request, 4096);
    const value = parseStrictJson(bytes, 4096, 4);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("System upgrade input must be an object");
    }
    const record = value as Record<string, unknown>;
    const keys =
        operation === "resume"
            ? "administratorSub"
            : operation === "review"
              ? "administratorSub,expectedRevision,manifestDigest"
              : "administratorSub,expectedRevision,manifestDigest,planDigest";
    if (
        Object.keys(record).sort().join(",") !== keys ||
        typeof record.administratorSub !== "string" ||
        record.administratorSub.length < 1 ||
        record.administratorSub.length > 200 ||
        /[\s\x00-\x1f]/u.test(record.administratorSub) ||
        (operation !== "resume" &&
            (!Number.isSafeInteger(record.expectedRevision) ||
                Number(record.expectedRevision) < 1 ||
                typeof record.manifestDigest !== "string" ||
                !/^sha256:[a-f0-9]{64}$/u.test(record.manifestDigest))) ||
        (operation === "apply" &&
            (typeof record.planDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(record.planDigest)))
    ) {
        throw new TypeError("Invalid system upgrade input");
    }
    if (operation === "resume") {
        return { operation, administratorSub: record.administratorSub };
    }
    const input = {
        administratorSub: record.administratorSub,
        expectedRevision: Number(record.expectedRevision),
        manifestDigest: String(record.manifestDigest),
    };
    return operation === "review"
        ? { ...input, operation }
        : { ...input, operation, planDigest: String(record.planDigest) };
}
