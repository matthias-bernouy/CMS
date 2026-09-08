type RecordValue = Record<string, unknown>;
type Dependencies = {
    authenticate(request: Request): void;
    read(): Promise<RecordValue | null>;
    rest(path: string, init: RequestInit): Promise<Response>;
    values(row: RecordValue | null): RecordValue;
    patch(input: RecordValue): RecordValue;
    verify(row: RecordValue, password: string): Promise<void>;
    fail(status: number, message: string): never;
};
export function createSourceManagement(deps: Dependencies) {
    return async (request: Request): Promise<Response> => {
        deps.authenticate(request);
        const body = (await request.json()) as RecordValue;
        const input = record(body.input);
        const secrets = record(body.secretValues);
        const row = (await deps.read()) ?? { id: "default" };
        const result = () => ({
            values: deps.values(row),
            savedRevision: row.saved_revision ?? null,
            appliedRevision: row.applied_revision ?? null,
            operation: row.operation ?? "idle",
        });
        const update = async (patch: RecordValue) => {
            const revision = row.saved_revision ? `eq.${encodeURIComponent(String(row.saved_revision))}` : "is.null";
            const response = await deps.rest(
                `settings?id=eq.default&saved_revision=${revision}&operation=eq.${row.operation ?? "idle"}`,
                {
                    method: "PATCH",
                    headers: { "content-type": "application/json", prefer: "return=representation" },
                    body: JSON.stringify(patch),
                },
            );
            if (!response.ok) {
                deps.fail(502, "Unable to persist Emailer settings");
            }
            const rows = (await response.json()) as RecordValue[];
            if (!rows[0]) {
                deps.fail(409, "Emailer settings changed; reload and retry");
            }
            Object.assign(row, rows[0]);
        };
        const inspect = async (settings: RecordValue, password: string) => {
            let status = "needs_configuration";
            let check = {
                id: "smtp_credentials",
                status: "warning",
                code: "connection_incomplete",
                message: "Complete the SMTP Connection settings.",
            };
            const authenticationComplete = settings.smtp_user
                ? Boolean(password)
                : !password && !settings.smtp_password;
            if (authenticationComplete && settings.smtp_host && settings.smtp_port && settings.default_from) {
                try {
                    await deps.verify(settings, password);
                    status = "ready";
                    check = {
                        id: "smtp_credentials",
                        status: "ok",
                        code: settings.smtp_user ? "smtp_authenticated" : "smtp_connected",
                        message: settings.smtp_user
                            ? "SMTP connection and authentication verified without sending mail."
                            : "SMTP connection verified without authentication or sending mail.",
                    };
                } catch {
                    status = "blocked";
                    check = {
                        id: "smtp_credentials",
                        status: "error",
                        code: "smtp_authentication_failed",
                        message: "SMTP connection or authentication failed. Review Connection settings.",
                    };
                }
            }
            return { status, check };
        };
        if (body.operation === "read-connection") {
            return Response.json(result());
        }
        const password = typeof secrets.smtpPassword === "string" ? secrets.smtpPassword : "";
        if (body.operation === "save-connection") {
            if (row.operation === "applying" || input.expectedRevision !== (row.saved_revision ?? null)) {
                deps.fail(409, "Emailer settings revision changed or configuration is running");
            }
            const patch = deps.patch(record(input.values ?? input));
            const inspected = await inspect({ ...row, ...patch }, password);
            if (inspected.status !== "ready") {
                deps.fail(422, inspected.check.message);
            }
            const revision = crypto.randomUUID();
            await update({
                ...patch,
                saved_revision: revision,
                applied_revision: revision,
                operation: "idle",
            });
            return Response.json(result());
        }
        if (body.operation === "retry-connection") {
            if (!row.saved_revision || input.expectedRevision !== row.saved_revision) {
                deps.fail(409, "Emailer connection revision changed");
            }
            const inspected = await inspect(row, password);
            if (inspected.status !== "ready") {
                deps.fail(422, inspected.check.message);
            }
            await update({ applied_revision: row.saved_revision, operation: "idle" });
            return Response.json(result());
        }
        if (body.operation !== "health") {
            deps.fail(400, "Unsupported management operation");
        }
        const { status: inspectedStatus, check } = await inspect(row, password);
        let status = inspectedStatus;
        const checks: RecordValue[] = [check];
        if (row.saved_revision !== row.applied_revision || !row.applied_revision) {
            if (status !== "blocked") {
                status = "needs_configuration";
            }
            checks.push({
                id: "configuration",
                status: "warning",
                code: "settings_not_applied",
                message: "Save or retry the Connection settings.",
            });
        }
        return Response.json({
            schemaVersion: 1,
            status,
            checkedAt: new Date().toISOString(),
            configuration: { savedRevision: row.saved_revision ?? null, appliedRevision: row.applied_revision ?? null },
            checks,
        });
    };
}
function record(value: unknown): RecordValue {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}
