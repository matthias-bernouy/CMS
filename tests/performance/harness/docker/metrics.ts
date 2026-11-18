import type { InvocationWitness, WorkMetrics, DependencyMetrics } from "../../capabilities/types";
import { dependencyEvidence } from "../services/dependencies";
import type { ProbeRow } from "./probe";
import type { ProfileMetrics } from "./profiler";

const nonnegative = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;

export function collectMetrics(
    traceId: string,
    rows: readonly ProbeRow[],
    profiles: readonly ProfileMetrics[],
    healthy: boolean,
    businessTarget?: string,
    relatedTraces: readonly string[] = [],
    requireOperation = false,
    dependencies?: readonly DependencyMetrics[],
) {
    const dependency = dependencyEvidence(businessTarget, dependencies);
    const traces = new Set([traceId, ...relatedTraces]);
    const selected = rows.filter((row) => typeof row.traceId === "string" && traces.has(row.traceId));
    const roots = selected.filter((row) => row.traceId === traceId);
    const mongo = selected.filter((row) => row.kind === "mongo");
    const calls = selected.filter((row) => row.kind === "http");
    const bodies = selected.filter((row) => row.kind === "http-body");
    const invocations: InvocationWitness[] = roots
        .filter((row) => row.kind === "capability")
        .map((row) => {
            if (
                typeof row.target !== "string" ||
                typeof row.binding !== "string" ||
                !nonnegative(row.durationMs) ||
                typeof row.success !== "boolean"
            ) {
                throw new Error("Malformed capability witness");
            }
            return {
                target: row.target,
                binding: row.binding,
                traceId,
                durationMs: row.durationMs,
                success: row.success,
                ...(typeof row.epoch === "string" ? { epoch: row.epoch } : {}),
                ...(typeof row.firstInProcess === "boolean" ? { firstInProcess: row.firstInProcess } : {}),
            };
        });
    for (const binding of roots.filter(
        (row) => row.kind === "binding" && row.success === true && row.transport === "mcp",
    )) {
        const matching = roots.find(
            (row) =>
                row.kind === "capability" &&
                row.success === true &&
                row.contractId === binding.contractId &&
                row.capabilityId === binding.capabilityId,
        );
        if (
            matching &&
            typeof binding.binding === "string" &&
            typeof matching.target === "string" &&
            nonnegative(matching.durationMs)
        ) {
            invocations.push({
                target: matching.target,
                binding: binding.binding,
                traceId,
                durationMs: matching.durationMs,
                success: true,
                ...(typeof matching.epoch === "string" ? { epoch: matching.epoch } : {}),
                ...(typeof matching.firstInProcess === "boolean" ? { firstInProcess: matching.firstInProcess } : {}),
            });
        }
    }
    const profile = profiles.filter((row) => traces.has(row.traceId));
    const business = roots.filter((row) => row.kind === "capability" && row.target === businessTarget);
    const operations = roots.filter(
        (row) =>
            row.kind === "operation" &&
            row.success === true &&
            business.some(
                (invocation) =>
                    invocation.contractId === row.contractId &&
                    invocation.capabilityId === row.capabilityId &&
                    typeof row.contractVersion === "string" &&
                    String(invocation.target).includes(`@${row.contractVersion}#`),
            ),
    );
    const valid = profile.every(
        (row) =>
            typeof row.database === "string" &&
            row.database.length > 0 &&
            [row.operations, row.documentsExamined, row.keysExamined, row.documentsReturned].every(nonnegative),
    );
    const work: WorkMetrics = {
        mongoOperations: mongo.length,
        documentsExamined: profile.reduce((sum, row) => sum + row.documentsExamined, 0),
        keysExamined: profile.reduce((sum, row) => sum + row.keysExamined, 0),
        documentsReturned: profile.reduce((sum, row) => sum + row.documentsReturned, 0),
        internalRequests: calls.length + dependency.requests,
        internalResponseBytes:
            bodies.reduce((sum, row) => sum + (nonnegative(row.bytes) ? row.bytes : 0), 0) + dependency.responseBytes,
        instrumentationComplete:
            healthy &&
            dependency.complete &&
            valid &&
            (!requireOperation || operations.length === 1) &&
            !selected.some((row) => row.kind === "overflow") &&
            bodies.length === calls.length &&
            bodies.every((row) => row.complete === true && nonnegative(row.bytes)) &&
            mongo.every(
                (command) =>
                    typeof command.database === "string" &&
                    command.database.length > 0 &&
                    profile.some(
                        (row) =>
                            row.database === command.database && row.traceId === command.traceId && row.operations > 0,
                    ),
            ),
    };
    const spans = new Set(business.map((row) => row.spanId));
    for (let previous = -1; previous !== spans.size; ) {
        previous = spans.size;
        for (const row of selected) {
            if (row.kind === "capability" && row.parentSpanId && spans.has(row.parentSpanId)) {
                spans.add(row.spanId);
            }
        }
    }
    const businessMongo = mongo.filter((row) => row.spanId && spans.has(row.spanId)).length;
    const businessDocuments = profile
        .filter((row) => row.spanId && spans.has(row.spanId))
        .reduce((sum, row) => sum + row.documentsExamined, 0);
    const businessRequests = calls.filter((row) => row.spanId && spans.has(row.spanId)).length;
    const pollMongo = mongo.filter((row) => row.traceId !== traceId).length;
    const pollDocuments = profile
        .filter((row) => row.traceId !== traceId)
        .reduce((sum, row) => sum + row.documentsExamined, 0);
    const pollRequests = calls.filter((row) => row.traceId !== traceId).length;
    const network = [...new Set(calls.flatMap((row) => (typeof row.path === "string" ? [row.path] : [])))]
        .toSorted()
        .map((path) => ({
            path,
            requests: calls.filter((row) => row.path === path).length,
            responseBytes: bodies
                .filter((row) => row.path === path)
                .reduce((sum, row) => sum + (nonnegative(row.bytes) ? row.bytes : 0), 0),
        }));
    const stages = roots.filter((row) => row.kind === "initialization-phase");
    const phases = [...new Set(stages.map((row) => String(row.name)))].toSorted().map((name) => {
        const entries = stages.filter((row) => row.name === name);
        if (entries.some((row) => !nonnegative(row.durationMs) || typeof row.success !== "boolean")) {
            throw new Error("Malformed initialization phase evidence");
        }
        return {
            name,
            calls: entries.length,
            failed: entries.filter((row) => !row.success).length,
            totalMs: entries.reduce((sum, row) => sum + Number(row.durationMs), 0),
            maxMs: Math.max(...entries.map((row) => Number(row.durationMs))),
        };
    });
    return {
        work,
        invocations,
        ...(network.length || dependency.network.length ? { network: [...network, ...dependency.network] } : {}),
        ...(phases.length ? { phases } : {}),
        ...(businessTarget
            ? {
                  breakdown: {
                      handlerMs: Math.max(
                          0,
                          ...[...business, ...operations].map((row) =>
                              nonnegative(row.durationMs) ? row.durationMs : 0,
                          ),
                      ),
                      businessMongoOperations: businessMongo,
                      commonMongoOperations: mongo.length - businessMongo - pollMongo,
                      businessDocumentsExamined: businessDocuments,
                      commonDocumentsExamined: work.documentsExamined - businessDocuments - pollDocuments,
                      businessInternalRequests: businessRequests + dependency.requests,
                      commonInternalRequests: calls.length - businessRequests - pollRequests,
                      ...(relatedTraces.length
                          ? {
                                pollMongoOperations: pollMongo,
                                pollDocumentsExamined: pollDocuments,
                                pollInternalRequests: pollRequests,
                            }
                          : {}),
                  },
              }
            : {}),
    };
}
