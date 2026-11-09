import { HostingError } from "hosting/core/errors";
import { z } from "zod";
import { domainHostname, hostingOrigin } from "hosting/core/origin";

const installationSchema = z.strictObject({
    format: z.literal("ulvia-hosting/v1"),
    id: z.literal("installation"),
    phase: z.enum(["reserved", "provisioning", "ready"]),
    controlKey: z.string().min(1).max(128),
    controlOrigin: z.string().max(2048),
    controlInstanceId: z.string().min(1).max(128).nullable(),
    revision: z.int().min(1),
});
const domainSchema = z.strictObject({
    hostname: z.string().max(253),
    origin: z.string().max(2048),
    instanceId: z.string().min(1).max(128),
    claimId: z.uuid(),
    creationFingerprint: z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/u)
        .nullable(),
    state: z.enum(["pending", "verified", "active", "disabled"]),
    tls: z.enum(["pending", "ready", "failed", "not-required"]),
    revision: z.int().min(1),
});

export function readInstallation(value: unknown) {
    try {
        const record = installationSchema.parse(value);
        if (
            hostingOrigin(record.controlOrigin).origin !== record.controlOrigin ||
            (record.phase === "reserved") !== (record.controlInstanceId === null)
        ) {
            throw new TypeError("Persisted Control origin is not canonical");
        }
        return record;
    } catch (cause) {
        throw new HostingError("UNAVAILABLE", "Persisted hosting state is invalid", { cause });
    }
}

export function readDomain(value: unknown) {
    try {
        const record = domainSchema.parse(value);
        const { origin, hostname, local } = hostingOrigin(record.origin);
        if (
            origin !== record.origin ||
            hostname !== record.hostname ||
            domainHostname(record.hostname) !== hostname ||
            (record.tls === "not-required" && (!local || !origin.startsWith("http:"))) ||
            (record.state === "pending" && record.tls !== "pending") ||
            (record.state === "verified" && record.tls !== "pending" && record.tls !== "failed") ||
            (record.state === "active" && !["ready", "not-required"].includes(record.tls))
        ) {
            throw new TypeError("Persisted domain state is inconsistent");
        }
        return record;
    } catch (cause) {
        throw new HostingError("UNAVAILABLE", "Persisted hosting state is invalid", { cause });
    }
}
