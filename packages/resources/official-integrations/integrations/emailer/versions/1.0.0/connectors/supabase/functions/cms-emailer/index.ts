type JsonRecord = Record<string, unknown>;

type TemplateRow = {
    key: string;
    name: string;
    status: string;
    from_email: string | null;
    reply_to: string | null;
    subject: string;
    html_body: string;
    text_body: string | null;
    required_tokens: unknown;
    sample_data: JsonRecord;
    metadata: JsonRecord;
    created_at?: string;
    updated_at?: string;
};

type MessageRow = {
    id: string;
    template_key: string | null;
    status: string;
    to_emails: unknown;
    cc_emails: unknown;
    bcc_emails: unknown;
    from_email: string;
    reply_to: string | null;
    subject: string;
    html_body: string;
    text_body: string | null;
    data_snapshot: JsonRecord;
    provider_message_id: string | null;
    error: string | null;
    idempotency_key: string | null;
    created_at?: string;
    sent_at?: string | null;
    updated_at?: string;
};

type TokenDefinition = {
    name: string;
    description?: string;
    sample?: string;
};

type EmailTransport = {
    sendMail(input: {
        from: string;
        replyTo?: string;
        to: string[];
        cc?: string[];
        bcc?: string[];
        subject: string;
        html: string;
        text?: string;
    }): Promise<{ messageId?: string; response?: string }>;
};

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

const emailerSchema = "emailer";
const templateSelect = [
    "key",
    "name",
    "status",
    "from_email",
    "reply_to",
    "subject",
    "html_body",
    "text_body",
    "required_tokens",
    "sample_data",
    "metadata",
    "created_at",
    "updated_at",
].join(",");
const messageSelect = [
    "id",
    "template_key",
    "status",
    "to_emails",
    "cc_emails",
    "bcc_emails",
    "from_email",
    "reply_to",
    "subject",
    "html_body",
    "text_body",
    "data_snapshot",
    "provider_message_id",
    "error",
    "idempotency_key",
    "created_at",
    "sent_at",
    "updated_at",
].join(",");

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));
        if (route === "/settings") return await withMethod(request, "GET", () => settings(request));
        if (route === "/templates") return await withMethod(request, "GET", () => listTemplates(request));
        if (route === "/template/archive") return await withMethod(request, "POST", () => archiveTemplate(request));
        if (route === "/template/render") return await withMethod(request, "POST", () => renderTemplateRoute(request));
        if (route === "/template/send-test") return await withMethod(request, "POST", () => sendTestEmail(request));
        if (route === "/template/send") return await withMethod(request, "POST", () => sendTemplateEmail(request));
        if (route === "/template") return await templateRoute(request);
        if (route === "/messages") return await withMethod(request, "GET", () => listMessages(request));
        if (route === "/message") return await withMethod(request, "GET", () => getMessage(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function templateRoute(request: Request): Promise<Response> {
    if (request.method === "GET") return getTemplate(request);
    if (request.method === "POST") return upsertTemplate(request);
    return methodNotAllowed("GET, POST, OPTIONS");
}

async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ ok: true });
}

async function settings(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({
        provider: "supabase",
        functionName: "cms-emailer",
        cmsApiKeyConfigured: envStatus("CMS_EMAILER_API_KEY"),
        smtpHost: optionalEnv("SMTP_HOST"),
        smtpPort: optionalEnv("SMTP_PORT"),
        smtpSecure: optionalEnv("SMTP_SECURE") || "false",
        smtpUserConfigured: envStatus("SMTP_USER"),
        smtpPasswordConfigured: envStatus("SMTP_PASSWORD"),
        defaultFrom: optionalEnv("SMTP_FROM"),
        defaultReplyTo: optionalEnv("SMTP_REPLY_TO"),
    });
}

async function listTemplates(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = new URLSearchParams();
    query.set("select", templateSelect);
    query.set("order", "updated_at.desc");
    query.set("limit", String(boundedLimit(url.searchParams.get("limit"))));
    query.set("offset", String(boundedOffset(url.searchParams.get("offset"))));
    const status = optionalText(url.searchParams.get("status"), 40);
    if (status) query.set("status", `eq.${status}`);
    const q = optionalSearch(url.searchParams.get("q"));
    if (q) query.set("or", `(key.ilike.*${q}*,name.ilike.*${q}*,subject.ilike.*${q}*)`);

    const response = await rest(`templates?${query.toString()}`, {
        method: "GET",
        headers: { prefer: "count=exact" },
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as TemplateRow[];
    return json({
        items: rows.map(publicTemplateSummary),
        total: countFromContentRange(response.headers.get("content-range")) ?? rows.length,
        limit: boundedLimit(url.searchParams.get("limit")),
        offset: boundedOffset(url.searchParams.get("offset")),
    });
}

async function getTemplate(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const key = requiredQuery(request, "key");
    if (key === "__new__") return json(defaultTemplate());
    const row = await templateByKey(key);
    if (!row) throw new HttpError(404, "template not found");
    return json(publicTemplate(row));
}

async function upsertTemplate(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const row = await upsertTemplateRow(templatePayload(body));
    return json(publicTemplate(row));
}

async function archiveTemplate(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const key = requiredQuery(request, "key");
    const row = await patchTemplateRow(key, { status: "archived" });
    return json(publicTemplate(row));
}

async function renderTemplateRoute(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const template = await requiredTemplate(requiredTextValue(body.key, "key", 140));
    const data = dataPayload(body, template.sample_data);
    const rendered = renderTemplate(template, data);
    return json({ key: template.key, ...rendered });
}

async function sendTestEmail(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const template = await requiredTemplate(requiredTextValue(body.key, "key", 140));
    if (template.status === "archived") throw new HttpError(400, "archived templates cannot be sent");
    const toEmail = emailField(body.toEmail, "toEmail");
    return json(await sendRenderedTemplate(template, {
        toEmails: [toEmail],
        ccEmails: [],
        bccEmails: [],
        data: dataPayload(body, template.sample_data),
        idempotencyKey: optionalTextValue(body.idempotencyKey, "idempotencyKey", 200),
    }));
}

async function sendTemplateEmail(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const template = await requiredTemplate(requiredTextValue(body.key, "key", 140));
    if (template.status !== "active") throw new HttpError(400, "template must be active");
    const idempotencyKey = optionalTextValue(body.idempotencyKey, "idempotencyKey", 200);
    if (idempotencyKey) {
        const existing = await messageByIdempotencyKey(idempotencyKey);
        if (existing) return json(publicMessage(existing));
    }
    return json(await sendRenderedTemplate(template, {
        toEmails: emailList(body.toEmails ?? body.toEmail, "toEmails"),
        ccEmails: optionalEmailList(body.ccEmails, "ccEmails"),
        bccEmails: optionalEmailList(body.bccEmails, "bccEmails"),
        data: dataPayload(body, {}),
        idempotencyKey,
        fromEmail: optionalEmailValue(body.fromEmail, "fromEmail"),
        replyTo: optionalEmailValue(body.replyTo, "replyTo"),
    }));
}

async function sendRenderedTemplate(
    template: TemplateRow,
    input: {
        toEmails: string[];
        ccEmails: string[];
        bccEmails: string[];
        data: JsonRecord;
        idempotencyKey?: string;
        fromEmail?: string;
        replyTo?: string;
    },
): Promise<JsonRecord> {
    const rendered = renderTemplate(template, input.data);
    const fromEmail = input.fromEmail ?? template.from_email ?? defaultFromEmail();
    const replyTo = input.replyTo ?? template.reply_to ?? defaultReplyTo();
    try {
        const transport = await emailTransport();
        const info = await transport.sendMail({
            from: fromEmail,
            ...(replyTo ? { replyTo } : {}),
            to: input.toEmails,
            ...(input.ccEmails.length ? { cc: input.ccEmails } : {}),
            ...(input.bccEmails.length ? { bcc: input.bccEmails } : {}),
            subject: rendered.subject,
            html: rendered.htmlBody,
            ...(rendered.textBody ? { text: rendered.textBody } : {}),
        });
        const message = await insertMessageRow({
            id: crypto.randomUUID(),
            template_key: template.key,
            status: "sent",
            to_emails: input.toEmails,
            cc_emails: input.ccEmails,
            bcc_emails: input.bccEmails,
            from_email: fromEmail,
            reply_to: replyTo ?? null,
            subject: rendered.subject,
            html_body: rendered.htmlBody,
            text_body: rendered.textBody,
            data_snapshot: input.data,
            provider_message_id: info.messageId ?? info.response ?? null,
            error: null,
            idempotency_key: input.idempotencyKey ?? null,
            sent_at: new Date().toISOString(),
        });
        return publicMessage(message);
    } catch (error) {
        const message = await insertMessageRow({
            id: crypto.randomUUID(),
            template_key: template.key,
            status: "failed",
            to_emails: input.toEmails,
            cc_emails: input.ccEmails,
            bcc_emails: input.bccEmails,
            from_email: fromEmail,
            reply_to: replyTo ?? null,
            subject: rendered.subject,
            html_body: rendered.htmlBody,
            text_body: rendered.textBody,
            data_snapshot: input.data,
            provider_message_id: null,
            error: safeError(error),
            idempotency_key: input.idempotencyKey ?? null,
            sent_at: null,
        });
        throw new HttpError(502, publicMessage(message).error as string);
    }
}

async function listMessages(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const query = new URLSearchParams();
    query.set("select", messageSelect);
    query.set("order", "created_at.desc");
    query.set("limit", String(boundedLimit(url.searchParams.get("limit"))));
    query.set("offset", String(boundedOffset(url.searchParams.get("offset"))));
    const status = optionalText(url.searchParams.get("status"), 40);
    const templateKey = optionalText(url.searchParams.get("templateKey"), 140);
    if (status) query.set("status", `eq.${status}`);
    if (templateKey) query.set("template_key", `eq.${templateKey}`);
    const q = optionalSearch(url.searchParams.get("q"));
    if (q) query.set("or", `(subject.ilike.*${q}*,from_email.ilike.*${q}*)`);

    const response = await rest(`messages?${query.toString()}`, {
        method: "GET",
        headers: { prefer: "count=exact" },
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as MessageRow[];
    return json({
        items: rows.map(publicMessageSummary),
        total: countFromContentRange(response.headers.get("content-range")) ?? rows.length,
        limit: boundedLimit(url.searchParams.get("limit")),
        offset: boundedOffset(url.searchParams.get("offset")),
    });
}

async function getMessage(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const id = requiredQuery(request, "id");
    const row = await messageById(id);
    if (!row) throw new HttpError(404, "message not found");
    return json(publicMessage(row));
}

function renderTemplate(template: TemplateRow, data: JsonRecord): { subject: string; htmlBody: string; textBody: string } {
    for (const token of normalizeTokenDefinitions(template.required_tokens)) {
        if (!lookup(data, token.name).found) throw new HttpError(400, `missing required token: ${token.name}`);
    }
    return {
        subject: renderString(template.subject, data, "subject"),
        htmlBody: renderString(template.html_body, data, "htmlBody"),
        textBody: renderString(template.text_body ?? "", data, "textBody"),
    };
}

function renderString(source: string, data: JsonRecord, field: string): string {
    const rendered = source.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, rawName: string) => {
        const name = rawName.trim();
        if (!isTokenName(name)) throw new HttpError(400, `${field} contains an invalid token`);
        const found = lookup(data, name);
        if (!found.found || found.value === null || found.value === undefined) return "";
        return String(found.value);
    });
    if (rendered.includes("{{") || rendered.includes("}}")) {
        throw new HttpError(400, `${field} contains a malformed token`);
    }
    return rendered;
}

async function templateByKey(key: string): Promise<TemplateRow | null> {
    const query = new URLSearchParams();
    query.set("select", templateSelect);
    query.set("key", `eq.${key}`);
    query.set("limit", "1");
    const response = await rest(`templates?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as TemplateRow[];
    return rows[0] ?? null;
}

async function requiredTemplate(key: string): Promise<TemplateRow> {
    const template = await templateByKey(key);
    if (!template) throw new HttpError(404, "template not found");
    return template;
}

async function upsertTemplateRow(payload: JsonRecord): Promise<TemplateRow> {
    const query = new URLSearchParams();
    query.set("on_conflict", "key");
    const response = await rest(`templates?${query.toString()}`, {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as TemplateRow[];
    return rows[0]!;
}

async function patchTemplateRow(key: string, patch: JsonRecord): Promise<TemplateRow> {
    const query = new URLSearchParams();
    query.set("key", `eq.${key}`);
    const response = await rest(`templates?${query.toString()}`, {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(patch),
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as TemplateRow[];
    if (!rows[0]) throw new HttpError(404, "template not found");
    return rows[0];
}

async function insertMessageRow(payload: JsonRecord): Promise<MessageRow> {
    const response = await rest("messages", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as MessageRow[];
    return rows[0]!;
}

async function messageById(id: string): Promise<MessageRow | null> {
    const query = new URLSearchParams();
    query.set("select", messageSelect);
    query.set("id", `eq.${id}`);
    query.set("limit", "1");
    const response = await rest(`messages?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as MessageRow[];
    return rows[0] ?? null;
}

async function messageByIdempotencyKey(key: string): Promise<MessageRow | null> {
    const query = new URLSearchParams();
    query.set("select", messageSelect);
    query.set("idempotency_key", `eq.${key}`);
    query.set("limit", "1");
    const response = await rest(`messages?${query.toString()}`, { method: "GET" });
    if (!response.ok) throw await restError(response);
    const rows = await response.json() as MessageRow[];
    return rows[0] ?? null;
}

function templatePayload(body: JsonRecord): JsonRecord {
    const key = templateKey(body.key);
    if (key === "__new__") throw new HttpError(400, "key must be changed before saving");
    const subject = requiredTextValue(body.subject, "subject", 1000);
    const htmlBody = requiredTextValue(body.htmlBody, "htmlBody", 200_000);
    assertTemplateTokens(subject, "subject");
    assertTemplateTokens(htmlBody, "htmlBody");
    const textBody = optionalTextValue(body.textBody, "textBody", 200_000) ?? "";
    assertTemplateTokens(textBody, "textBody");
    return {
        key,
        name: requiredTextValue(body.name, "name", 200),
        status: enumField(body.status ?? "draft", "status", ["draft", "active", "archived"]),
        from_email: optionalEmailValue(body.fromEmail, "fromEmail") ?? null,
        reply_to: optionalEmailValue(body.replyTo, "replyTo") ?? null,
        subject,
        html_body: htmlBody,
        text_body: textBody || null,
        required_tokens: normalizeTokenDefinitions(body.requiredTokens),
        sample_data: sampleDataPayload(body),
        metadata: objectValue(body.metadata, "metadata", {}),
    };
}

function assertTemplateTokens(source: string, field: string): void {
    renderString(source, {}, field);
}

function defaultTemplate(): JsonRecord {
    return {
        key: "__new__",
        name: "",
        status: "draft",
        fromEmail: "",
        replyTo: "",
        subject: "",
        htmlBody: "<p>Hello {{ user.name }}</p>",
        textBody: "Hello {{ user.name }}",
        requiredTokens: [{ name: "user.name", description: "Recipient display name", sample: "Ada" }],
        sampleDataJson: JSON.stringify({ user: { name: "Ada" } }, null, 2),
        testRecipient: "",
    };
}

function publicTemplateSummary(row: TemplateRow): JsonRecord {
    return {
        key: row.key,
        name: row.name,
        status: row.status,
        subject: row.subject,
        updatedAt: row.updated_at ?? "",
        createdAt: row.created_at ?? "",
    };
}

function publicTemplate(row: TemplateRow): JsonRecord {
    return {
        ...publicTemplateSummary(row),
        fromEmail: row.from_email ?? "",
        replyTo: row.reply_to ?? "",
        htmlBody: row.html_body,
        textBody: row.text_body ?? "",
        requiredTokens: normalizeTokenDefinitions(row.required_tokens),
        sampleData: row.sample_data ?? {},
        sampleDataJson: JSON.stringify(row.sample_data ?? {}, null, 2),
        metadata: row.metadata ?? {},
        testRecipient: "",
    };
}

function publicMessageSummary(row: MessageRow): JsonRecord {
    return {
        id: row.id,
        templateKey: row.template_key ?? "",
        status: row.status,
        toEmails: stringArray(row.to_emails),
        fromEmail: row.from_email,
        subject: row.subject,
        providerMessageId: row.provider_message_id ?? "",
        error: row.error ?? "",
        createdAt: row.created_at ?? "",
        sentAt: row.sent_at ?? "",
    };
}

function publicMessage(row: MessageRow): JsonRecord {
    return {
        ...publicMessageSummary(row),
        ccEmails: stringArray(row.cc_emails),
        replyTo: row.reply_to ?? "",
        htmlBody: row.html_body,
        textBody: row.text_body ?? "",
        data: row.data_snapshot ?? {},
        idempotencyKey: row.idempotency_key ?? "",
        updatedAt: row.updated_at ?? "",
    };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;
    const serviceKey = supabaseServiceKey();
    const headers = new Headers(init.headers);
    headers.set("apikey", serviceKey);
    headers.set("authorization", `Bearer ${serviceKey}`);
    headers.set("accept-profile", emailerSchema);
    if (init.body !== undefined) {
        headers.set("content-type", "application/json");
        headers.set("content-profile", emailerSchema);
    }
    return await fetch(url, { ...init, headers });
}

async function restError(response: Response): Promise<HttpError> {
    const data = await response.json().catch(() => null) as JsonRecord | null;
    const message = data && typeof data.message === "string"
        ? data.message
        : await response.text().catch(() => "");
    return new HttpError(response.status, message || `Supabase request failed with ${response.status}`);
}

async function emailTransport(): Promise<EmailTransport> {
    const injected = (globalThis as unknown as { __CMS_EMAILER_TRANSPORT__?: EmailTransport }).__CMS_EMAILER_TRANSPORT__;
    if (injected) return injected;
    const mod = await import("nodemailer") as unknown as { default?: { createTransport: (options: JsonRecord) => EmailTransport }; createTransport?: (options: JsonRecord) => EmailTransport };
    const createTransport = mod.createTransport ?? mod.default?.createTransport;
    if (!createTransport) throw new HttpError(500, "SMTP transport is not available");
    return createTransport({
        host: requiredEnv("SMTP_HOST"),
        port: Number(requiredEnv("SMTP_PORT")),
        secure: envBoolean("SMTP_SECURE"),
        auth: {
            user: requiredEnv("SMTP_USER"),
            pass: requiredEnv("SMTP_PASSWORD"),
        },
    });
}

function supabaseServiceKey(): string {
    const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (keys) {
        try {
            const parsed = JSON.parse(keys) as JsonRecord;
            const first = typeof parsed.default === "string"
                ? parsed.default
                : Object.values(parsed).find((value): value is string => typeof value === "string");
            if (first) return first;
        } catch {
            // Fall through to the legacy single-key variable.
        }
    }
    return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function defaultFromEmail(): string {
    return emailField(requiredEnv("SMTP_FROM"), "SMTP_FROM");
}

function defaultReplyTo(): string | undefined {
    const value = Deno.env.get("SMTP_REPLY_TO")?.trim();
    return value ? emailField(value, "SMTP_REPLY_TO") : undefined;
}

function requireCmsRequest(request: Request): void {
    const configured = requiredEnv("CMS_EMAILER_API_KEY");
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
    if (!token || token !== configured) throw new HttpError(401, "invalid CMS API key");
}

function requiredEnv(name: string): string {
    const value = Deno.env.get(name)?.trim();
    if (!value) throw new HttpError(500, `${name} is not configured`);
    return value;
}

function optionalEnv(name: string): string {
    return Deno.env.get(name)?.trim() ?? "";
}

function envStatus(name: string): string {
    return optionalEnv(name) ? "configured" : "missing";
}

function envBoolean(name: string): boolean {
    const value = Deno.env.get(name)?.trim().toLowerCase();
    return value === "true" || value === "1";
}

function dataPayload(body: JsonRecord, fallback: JsonRecord): JsonRecord {
    if (isRecord(body.data)) return body.data;
    return sampleDataPayload(body, fallback);
}

function sampleDataPayload(body: JsonRecord, fallback: JsonRecord = {}): JsonRecord {
    if (isRecord(body.sampleData)) return body.sampleData;
    const raw = optionalTextValue(body.sampleDataJson, "sampleDataJson", 200_000);
    if (raw === undefined || raw.trim() === "") return fallback;
    try {
        const parsed = JSON.parse(raw);
        return objectValue(parsed, "sampleDataJson", fallback);
    } catch {
        throw new HttpError(400, "sampleDataJson must be valid JSON");
    }
}

function normalizeTokenDefinitions(value: unknown): TokenDefinition[] {
    if (value === undefined || value === null || value === "") return [];
    if (!Array.isArray(value)) throw new HttpError(400, "requiredTokens must be an array");
    const out: TokenDefinition[] = [];
    for (const [index, item] of value.entries()) {
        const token = isRecord(item)
            ? {
                name: optionalTextValue(item.name, `requiredTokens.${index}.name`, 120) ?? "",
                description: optionalTextValue(item.description, `requiredTokens.${index}.description`, 300),
                sample: optionalTextValue(item.sample, `requiredTokens.${index}.sample`, 500),
            }
            : { name: optionalTextValue(item, `requiredTokens.${index}`, 120) ?? "" };
        if (!token.name) continue;
        if (!isTokenName(token.name)) throw new HttpError(400, `requiredTokens.${index}.name is invalid`);
        out.push(stripUndefined(token));
    }
    return out;
}

function templateKey(value: unknown): string {
    const key = requiredTextValue(value, "key", 140).toLowerCase();
    if (key === "__new__") return key;
    if (!/^[a-z0-9][a-z0-9_.-]{1,120}$/.test(key)) {
        throw new HttpError(400, "key must use lowercase letters, numbers, dots, dashes, or underscores");
    }
    return key;
}

function emailList(value: unknown, field: string): string[] {
    const list = optionalEmailList(value, field);
    if (!list.length) throw new HttpError(400, `${field} must contain at least one email`);
    return list;
}

function optionalEmailList(value: unknown, field: string): string[] {
    if (value === undefined || value === null || value === "") return [];
    const values = Array.isArray(value) ? value : String(value).split(",");
    return values.map((item, index) => emailField(item, `${field}.${index}`));
}

function optionalEmailValue(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || String(value).trim() === "") return undefined;
    return emailField(value, field);
}

function emailField(value: unknown, field: string): string {
    const email = requiredTextValue(value, field, 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, `${field} is invalid`);
    return email;
}

function objectValue(value: unknown, field: string, fallback: JsonRecord): JsonRecord {
    if (value === undefined || value === null || value === "") return fallback;
    if (!isRecord(value)) throw new HttpError(400, `${field} must be an object`);
    return value;
}

function enumField<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
        throw new HttpError(400, `${field} must be ${allowed.join("|")}`);
    }
    return value as T;
}

function requiredTextValue(value: unknown, field: string, max: number): string {
    const result = optionalTextValue(value, field, max);
    if (!result) throw new HttpError(400, `${field} is required`);
    return result;
}

function optionalTextValue(value: unknown, field: string, max: number): string | undefined {
    if (value === undefined || value === null) return undefined;
    const result = String(value).trim();
    if (!result) return undefined;
    if (result.length > max) throw new HttpError(400, `${field} is too long`);
    return result;
}

function optionalText(value: string | null, max: number): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, max);
}

function optionalSearch(value: string | null): string | undefined {
    const text = optionalText(value, 80);
    return text?.replace(/[()*,]/g, " ").trim() || undefined;
}

function requiredQuery(request: Request, name: string): string {
    return requiredTextValue(new URL(request.url).searchParams.get(name), name, 200);
}

function boundedLimit(value: string | null, max = 100): number {
    const parsed = Number(value ?? 50);
    if (!Number.isFinite(parsed) || parsed < 1) return 50;
    return Math.min(Math.trunc(parsed), max);
}

function boundedOffset(value: string | null): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.trunc(parsed);
}

function countFromContentRange(value: string | null): number | null {
    if (!value) return null;
    const match = value.match(/\/(\d+)$/);
    return match ? Number(match[1]) : null;
}

function lookup(source: JsonRecord, path: string): { found: boolean; value: unknown } {
    let current: unknown = source;
    for (const segment of path.split(".")) {
        if (!isRecord(current) || !Object.hasOwn(current, segment)) return { found: false, value: undefined };
        current = current[segment];
    }
    return { found: true, value: current };
}

function isTokenName(value: string): boolean {
    return /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(value);
}

function stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];
}

async function readJsonObject(request: Request): Promise<JsonRecord> {
    let value: unknown;
    try {
        value = await request.json();
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    if (!isRecord(value)) throw new HttpError(400, "body must be an object");
    return value;
}

async function withMethod(request: Request, method: string, handler: () => Promise<Response> | Response): Promise<Response> {
    if (request.method !== method) return methodNotAllowed(`${method}, OPTIONS`);
    return await handler();
}

function methodNotAllowed(allow: string): Response {
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...corsHeaders, allow },
    });
}

function routePath(request: Request): string {
    const path = new URL(request.url).pathname;
    const marker = "/cms-emailer";
    const index = path.indexOf(marker);
    if (index < 0) return path;
    return path.slice(index + marker.length) || "/";
}

function optionsResponse(): Response {
    return new Response(null, { status: 204, headers: corsHeaders });
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "content-type": "application/json" },
    });
}

function handleError(error: unknown): Response {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "internal error" }, 500);
}

function safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
}

function stripUndefined<T extends JsonRecord>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
