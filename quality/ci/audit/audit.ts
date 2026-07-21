import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type AuditException = {
    advisory: string;
    rationale: string;
    owner: string;
    createdAt: string;
    expiresAt: string;
};

type AuditExceptionsFile = {
    schemaVersion: 1;
    exceptions: AuditException[];
};

const EXCEPTIONS_PATH = join(import.meta.dir, "audit-exceptions.json");
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ADVISORY_PATTERN =
    /^(?:CVE-\d{4}-\d{4,}|GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4})$/i;
const REQUIRED_FIELDS = ["advisory", "createdAt", "expiresAt", "owner", "rationale"].sort();

function parseDate(value: string, label: string): number {
    if (!DATE_PATTERN.test(value)) {
        throw new Error(`${label} must use YYYY-MM-DD`);
    }
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
        throw new Error(`${label} is not a valid calendar date`);
    }
    return timestamp;
}

export function validateAuditExceptions(value: unknown, today = new Date()): AuditException[] {
    if (!value || typeof value !== "object") {
        throw new Error("Audit exceptions must be an object");
    }
    const file = value as Partial<AuditExceptionsFile>;
    if (file.schemaVersion !== 1) {
        throw new Error("Unsupported audit-exception schema");
    }
    if (!Array.isArray(file.exceptions)) {
        throw new Error("Audit exceptions must be an array");
    }

    const todayTimestamp = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const advisories = new Set<string>();
    for (const [index, exception] of file.exceptions.entries()) {
        if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
            throw new Error(`Audit exception ${index + 1} must be an object`);
        }
        const fields = Object.keys(exception).sort();
        if (JSON.stringify(fields) !== JSON.stringify(REQUIRED_FIELDS)) {
            throw new Error(`Audit exception ${index + 1} must contain only ${REQUIRED_FIELDS.join(", ")}`);
        }
        if (typeof exception.advisory !== "string" || !ADVISORY_PATTERN.test(exception.advisory)) {
            throw new Error(`Audit exception ${index + 1} has an invalid advisory identifier`);
        }
        if (typeof exception.rationale !== "string" || exception.rationale.trim().length < 20) {
            throw new Error(`Audit exception ${exception.advisory} needs a substantive rationale`);
        }
        if (typeof exception.owner !== "string" || exception.owner.trim().length === 0) {
            throw new Error(`Audit exception ${exception.advisory} needs an owner`);
        }
        if (typeof exception.createdAt !== "string" || typeof exception.expiresAt !== "string") {
            throw new Error(`Audit exception ${exception.advisory} needs valid creation and expiry dates`);
        }
        const createdAt = parseDate(exception.createdAt, `${exception.advisory}.createdAt`);
        const expiresAt = parseDate(exception.expiresAt, `${exception.advisory}.expiresAt`);
        if (createdAt > todayTimestamp) {
            throw new Error(`Audit exception ${exception.advisory} starts in the future`);
        }
        if (expiresAt < todayTimestamp) {
            throw new Error(`Audit exception ${exception.advisory} expired`);
        }
        if (expiresAt < createdAt || expiresAt - createdAt > 30 * DAY_IN_MILLISECONDS) {
            throw new Error(`Audit exception ${exception.advisory} may last at most 30 days`);
        }
        const normalizedAdvisory = exception.advisory.toUpperCase();
        if (advisories.has(normalizedAdvisory)) {
            throw new Error(`Duplicate audit exception ${exception.advisory}`);
        }
        advisories.add(normalizedAdvisory);
    }
    return file.exceptions;
}

export function buildAuditCommand(exceptions: AuditException[]): string[] {
    return [
        process.execPath,
        "audit",
        "--audit-level=high",
        ...exceptions.map((exception) => `--ignore=${exception.advisory}`),
    ];
}

async function main(): Promise<void> {
    const file = JSON.parse(await readFile(EXCEPTIONS_PATH, "utf8")) as unknown;
    const exceptions = validateAuditExceptions(file);
    const audit = Bun.spawn(buildAuditCommand(exceptions), {
        cwd: join(import.meta.dir, "../../.."),
        stdout: "inherit",
        stderr: "inherit",
    });
    const exitCode = await audit.exited;
    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}

if (import.meta.main) {
    await main();
}
