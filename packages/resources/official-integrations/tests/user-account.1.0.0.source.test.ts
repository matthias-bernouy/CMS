import { Buffer, File } from "node:buffer";
import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { applyDashboardSourceOverlays } from "@bernouy/cms-dashboards";
import {
    handleSourceRequest,
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    materializeSourceOverlays,
    SourceOverlaySourceRepository,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const edgeFunctionUrl = "../integrations/user-account/versions/1.0.0/connectors/supabase/functions/cms-user-account/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(globalThis as { Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown } }).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return { shutdown() { /* test stub */ } };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("user-account 1.0.0 source", () => {
    test("updates, reads, lists, and deletes personal information through the installed CMS source", async () => {
        const harness = await createHarness();

        await okJson(await sourceJson(harness, "createExtraField", {
            id: "company",
            label: "Company",
            type: "string",
            multiple: true,
            showInDashboardTable: true,
            options: [
                { id: "agency", value: "agency", label: "Agency", position: 0 },
                { id: "club", value: "club", label: "Club", position: 1 },
            ],
        }));
        await okJson(await sourceJson(harness, "createExtraField", {
            id: "employeeCount",
            label: "Employees",
            type: "number",
        }));
        const reorderedFields = await okJson(await sourceJson(harness, "reorderExtraFields", {
            ids: ["employeeCount", "company"],
        }));
        const field = await okJson(await sourceRequest(harness, "getExtraField", { id: "company" }));
        const unrestrictedField = await okJson(await sourceJson(harness, "createExtraField", {
            id: "company",
            label: "Company",
            type: "string",
            hasAllowedValues: false,
            options: [{ id: "agency", value: "agency", label: "Agency" }],
        }));
        const upsertedField = await okJson(await sourceJson(harness, "createExtraField", {
            id: "company",
            label: "Company",
            type: "string",
            required: "true",
            multiple: "true",
            hasAllowedValues: true,
            showInDashboardTable: "true",
            options: [
                { id: "club", value: "club", label: "Club", position: 99 },
                { id: "agency", value: "agency", label: "Agency", position: 42 },
            ],
        }));
        const missing = await okJson(await sourceRequest(harness, "getAccount"));
        const updated = await okJson(await sourceJson(harness, "updateAccount", {
            phone: " +33600000000 ",
            givenName: " Test ",
            surname: " User ",
            birthDate: "1992-04-18",
            addressLine1: " 12 rue des Tests ",
            addressLine2: "Bâtiment B",
            addressLine3: "Appartement 4",
            postalCode: "75001",
            city: "Paris",
            region: "Île-de-France",
            countryCode: "fr",
            locale: "fr-FR",
            timezone: "Europe/Paris",
            metadata: { company: ["club"], employeeCount: "12" },
        }));
        const invalidBirthDate = await sourceJson(harness, "updateAccount", { birthDate: "2020-02-31" });
        const invalidCountry = await sourceJson(harness, "updateAccount", { countryCode: "France" });
        const metadataUpdated = await okJson(await sourceJson(harness, "updateAccountMetadata", {
            company: "agency",
            employeeCount: "13",
        }));
        const adminCreated = await okJson(await sourceJson(harness, "createUserPersonalInformation", {
            givenName: "Admin",
            surname: "Target",
            metadata: { company: ["agency"] },
        }, { userId: "target-user" }));
        const listed = await okJson(await sourceRequest(harness, "listAccounts", { q: "target", limit: "20" }));
        const fetched = await okJson(await sourceRequest(harness, "getAccountByUserId", { userId: "target-user" }));
        const deleted = await okJson(await sourceDelete(harness, "deleteUserPersonalInformation", { userId: "target-user" }));
        const installedDashboard = await harness.dashboards.getDashboard("user-account-users");
        const fieldsDashboard = await harness.dashboards.getDashboard("user-account-fields");
        const materializedOverlays = await harness.materializedOverlays();
        const dashboard = installedDashboard
            ? applyDashboardSourceOverlays(installedDashboard, materializedOverlays)
            : null;
        const accountsTable = dashboard?.views.find(view => view.id === "accountsTable") as JsonRecord | undefined;
        const accountDetail = dashboard?.views.find(view => view.id === "accountDetail") as JsonRecord | undefined;
        const extraFieldsTable = fieldsDashboard?.views.find(view => view.id === "extraFieldsTable") as JsonRecord | undefined;
        const extraFieldDetail = fieldsDashboard?.views.find(view => view.id === "extraFieldDetail") as JsonRecord | undefined;
        const source = await harness.sources.getSource("urn:user-account");
        const createExtraFieldEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:createExtraField");
        const reorderExtraFieldsEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:reorderExtraFields");
        const deleteExtraFieldEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:deleteExtraField");
        const updateEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:updateAccount");
        const updateMetadataEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:updateAccountMetadata");
        const getEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:getAccount");
        const getByUserIdEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:user-account:getAccountByUserId");
        const accountForm = harness.importedBlocs.find(bloc => bloc.tag.includes("user-account-form"));
        const accountAvatar = harness.importedBlocs.find(bloc => bloc.tag.includes("user-account-avatar"));
        const accountFormTemplate = decodeBlocSource(accountForm, "template.html");
        const accountAvatarTemplate = decodeBlocSource(accountAvatar, "template.html");
        const accountAvatarStyle = decodeBlocSource(accountAvatar, "style.css");

        expect(missing).toMatchObject({ exists: false, userId: "user-123" });
        expect(source?.meta).toMatchObject({ icon: "assets/user-personal-information.svg", svg: expect.stringContaining("<svg") });
        expect(getByUserIdEndpoint?.input?.params?.find(param => param.name === "userId")
            ?.schema?.semantic?.authority).toBe("cms");
        expect(installedDashboard?.meta).toMatchObject({ icon: "assets/users.svg", svg: expect.stringContaining("<svg") });
        expect(fieldsDashboard?.meta).toMatchObject({ icon: "assets/fields.svg", svg: expect.stringContaining("<svg") });
        expect(field).toMatchObject({ field: { id: "company", label: "Company", type: "string", multiple: true, showInDashboardTable: true } });
        expect(reorderedFields).toEqual({ ids: ["employeeCount", "company"] });
        expect(unrestrictedField).toMatchObject({ field: { id: "company" } });
        expect(unrestrictedField.field.options).toBeUndefined();
        expect(field.field.options).toEqual([
            { id: "agency", value: "agency", label: "Agency", position: 0 },
            { id: "club", value: "club", label: "Club", position: 1 },
        ]);
        expect(upsertedField).toMatchObject({ field: { id: "company", label: "Company", type: "string", required: true, multiple: true, showInDashboardTable: true } });
        expect(upsertedField.field.options).toEqual([
            { id: "club", value: "club", label: "Club", position: 0 },
            { id: "agency", value: "agency", label: "Agency", position: 1 },
        ]);
        expect(materializedOverlays[0]?.fields.find(item => item.id === "company")?.options).toEqual([
            { value: "club", label: "Club" },
            { value: "agency", label: "Agency" },
        ]);
        expect(updated).toMatchObject({
            exists: true,
            userId: "user-123",
            phone: "+33600000000",
            givenName: "Test",
            surname: "User",
            birthDate: "1992-04-18",
            addressLine1: "12 rue des Tests",
            addressLine2: "Bâtiment B",
            addressLine3: "Appartement 4",
            postalCode: "75001",
            city: "Paris",
            region: "Île-de-France",
            countryCode: "FR",
            locale: "fr-FR",
            timezone: "Europe/Paris",
            metadata: { company: ["club"], employeeCount: 12 },
        });
        expect(invalidBirthDate.status).toBe(400);
        expect(await jsonBody(invalidBirthDate)).toEqual({ error: "birthDate is invalid" });
        expect(invalidCountry.status).toBe(400);
        expect(await jsonBody(invalidCountry)).toEqual({ error: "countryCode is too long" });
        expect(metadataUpdated).toMatchObject({
            exists: true,
            userId: "user-123",
            metadata: { company: ["agency"], employeeCount: 13 },
        });
        expect(adminCreated).toMatchObject({ exists: true, userId: "target-user", metadata: { company: ["agency"] } });
        expect(listed.accounts).toEqual([expect.objectContaining({ userId: "target-user", givenName: "Admin", surname: "Target", metadata: { company: ["agency"] } })]);
        expect(fetched).toMatchObject({ exists: true, userId: "target-user", givenName: "Admin", surname: "Target", metadata: { company: ["agency"] } });
        expect(deleted).toEqual({ deleted: true, userId: "target-user" });
        expect(harness.rest.rows("accounts").map(row => row.cms_user_id)).toEqual(["user-123"]);
        expect(accountsTable?.selection).toEqual({ opens: "accountDetail" });
        expect((accountsTable?.columns as JsonRecord[]).map(column => column.id)).toContain("company");
        expect(accountDetail?.source).toEqual({ endpoint: "getAccountByUserId", params: { userId: "$selection.id" } });
        expect(fieldsDashboard?.source).toBe("user-account");
        expect(extraFieldsTable).toMatchObject({
            widget: "w-navigation-list",
            item: {
                title: { path: "label" },
                badge: { path: "type" },
            },
            reorderable: { action: "reorderExtraFields" },
        });
        expect(extraFieldsTable?.actions).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "newExtraField", selection: { opens: "extraFieldDetail" } }),
            expect.objectContaining({ id: "reorderExtraFields", endpoint: { endpoint: "reorderExtraFields", body: { ids: "$value" } } }),
        ]));
        expect(extraFieldDetail?.source).toEqual({
            endpoint: "getExtraField",
            params: { id: "$selection.id" },
            itemPath: "field",
        });
        expect(createExtraFieldEndpoint?.effects).toEqual({ invalidatesSchema: true });
        expect(reorderExtraFieldsEndpoint?.effects).toEqual({ invalidatesSchema: true });
        expect(deleteExtraFieldEndpoint?.effects).toEqual({ invalidatesSchema: true });
        expect(extraFieldDetail?.actions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: "deleteExtraField",
                confirm: "Delete this field definition? Existing user metadata values will be kept.",
                visibleWhen: { value: "$field.id", notEquals: "" },
            }),
        ]));
        expect(extraFieldDetail?.main).toEqual(expect.arrayContaining([
            expect.objectContaining({
                fields: expect.arrayContaining([
                    expect.objectContaining({ id: "id", type: "readonly", visibleWhen: { value: "$field.id", notEquals: "" } }),
                ]),
            }),
        ]));
        expect((accountDetail?.main as JsonRecord[]).find(section => section.id === "additionalInformation")).toMatchObject({
            id: "additionalInformation",
            title: "Additional information",
            fields: expect.arrayContaining([
                expect.objectContaining({
                    id: "company",
                    path: "metadata.company",
                    type: "tokens",
                    options: [
                        { value: "club", label: "Club" },
                        { value: "agency", label: "Agency" },
                    ],
                }),
                expect.objectContaining({ id: "employeeCount", type: "number" }),
            ]),
        });
        expect((accountDetail?.aside as JsonRecord[]).find(section => section.id === "avatar")).toMatchObject({
            fields: [expect.objectContaining({ id: "avatarPreview", path: "avatarUrl", format: "image" })],
        });
        expect(updateEndpoint?.input?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        company: { type: "array", items: { type: "string" } },
                        employeeCount: { type: "number" },
                    },
                },
            },
        });
        expect(updateMetadataEndpoint?.input?.body).toMatchObject({
            properties: {
                company: { type: "array", items: { type: "string" } },
                employeeCount: { type: "number" },
            },
        });
        expect(getEndpoint?.output?.[0]?.body).toMatchObject({
            properties: {
                metadata: {
                    properties: {
                        company: { type: "array", items: { type: "string" } },
                    },
                },
            },
        });
        expect(accountFormTemplate).toContain('name="givenName"');
        expect(accountFormTemplate).toContain('name="surname"');
        expect(accountFormTemplate).toContain('name="birthDate" label="Date de naissance" type="date" date-format="day-month-year"');
        expect(accountFormTemplate).toContain('placeholder="jj/mm/aaaa"');
        expect(accountFormTemplate).toContain('data-account-button>Enregistrer</basic-button>');
        expect(accountFormTemplate).toContain('name="addressLine3"');
        expect(accountFormTemplate).toContain('name="countryCode"');
        expect(accountFormTemplate).toContain('data-account-field="login-email" data-auth-load');
        expect(accountFormTemplate).toContain('data-auth-email label="Adresse e-mail" type="email" autocomplete="email" value="{{ subject.email }}" disabled');
        expect(accountFormTemplate).not.toContain('name="email"');
        expect(accountFormTemplate.indexOf('data-account-field="birth-date"'))
            .toBeLessThan(accountFormTemplate.indexOf('data-account-field="login-email"'));
        expect(accountFormTemplate.indexOf('data-account-field="login-email"'))
            .toBeLessThan(accountFormTemplate.indexOf('data-account-field="phone"'));
        expect(accountForm?.viewJS).toContain('extends Composition');
        expect(accountForm?.viewJS).toContain('`${prefix}/system-auth/me`');
        expect(accountFormTemplate).toContain('<basic-input');
        expect(accountFormTemplate).toContain('<basic-button type="submit"');
        expect(accountFormTemplate).toContain('<user-account-avatar data-avatar-input name="file"');
        expect(accountFormTemplate).toContain('<basic-grid min="lg" max="none"');
        expect(accountFormTemplate).toContain('<basic-stack');
        expect(accountFormTemplate).toContain('<basic-skeleton shape="circle" width="7rem" height="7rem"');
        expect(accountFormTemplate).toContain('label="Chargement de vos informations"');
        expect(accountFormTemplate).not.toContain('>Chargement…</p>');
        expect(accountFormTemplate).not.toContain('Mes informations');
        expect(accountFormTemplate).not.toContain('data-account-title');
        expect(accountFormTemplate).not.toContain('<p9r-grid');
        expect(accountFormTemplate).not.toContain('<p9r-stack');
        expect(accountFormTemplate).toContain('<basic-toast data-toast-kind="success" role="status" aria-live="polite"');
        expect(accountFormTemplate).toContain('<basic-toast data-toast-kind="error" role="alert" aria-live="assertive"');
        expect(accountFormTemplate).not.toContain('<basic-toast type=');
        expect(accountFormTemplate).not.toContain('<p cms-condition="save.ok"');
        expect(accountFormTemplate).not.toContain('<cms-binding-core');
        expect(accountFormTemplate).not.toContain('<style');
        expect(accountAvatarTemplate).toContain('class="action"');
        expect(accountAvatarStyle).toContain('.picker:hover .action');
        expect(accountAvatar?.viewJS).toContain('extends Component');
        expect(accountAvatar?.viewJS).toContain('URL.createObjectURL(file)');
        expect(accountFormTemplate).not.toContain('cms-source-publish="user-account:avatar-updated"');
        expect(accountFormTemplate).not.toContain('cms-reload-on="user-account:avatar-updated"');
        expect(accountFormTemplate).not.toContain('cms-source-publish="user-account:updated"');
        expect(accountFormTemplate).not.toContain('cms-reload-on="user-account:updated"');
        expect(accountForm?.viewJS).toContain('this.querySelector("[data-avatar-form]")?.requestSubmit()');
        expect(accountForm?.viewJS).toContain('fileId.includes("{{")');
        expect(accountForm?.viewJS).toContain('this.avatarObserver.observe(this');
        expect(accountFormTemplate).not.toContain('name="avatarUrl"');
        expect(accountFormTemplate.indexOf('<user-account-avatar'))
            .toBeLessThan(accountFormTemplate.indexOf('<basic-skeleton shape="circle"'));
        expect(accountFormTemplate).toContain('cms-source-trigger="submit"');
        expect(accountFormTemplate).toContain('value="{{ givenName }}"');
        expect(accountForm?.editorJS).toContain('show-birth-date');
        expect(accountForm?.editorJS).toContain('show-address-line-3');

        const removedField = await okJson(await sourceDelete(harness, "deleteExtraField", { id: "company" }));
        const fieldsAfterRemoval = await okJson(await sourceRequest(harness, "listExtraFields"));
        const accountAfterRemoval = await okJson(await sourceRequest(harness, "getAccount"));
        expect(removedField).toEqual({ deleted: true, id: "company" });
        expect(fieldsAfterRemoval.fields).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "company" })]));
        expect(accountAfterRemoval).toMatchObject({ metadata: { employeeCount: 13 } });
        expect(accountAfterRemoval.metadata.company).toBeUndefined();
    });

    test("rejects unknown and disallowed flat metadata fields", async () => {
        const harness = await createHarness();
        await okJson(await sourceJson(harness, "createExtraField", {
            id: "level",
            label: "Level",
            type: "string",
            options: [
                { value: "club", label: "Club" },
                { value: "competition", label: "Competition" },
            ],
        }));

        const unknown = await sourceJson(harness, "updateAccountMetadata", { hiddenRole: "admin" });
        const disallowed = await sourceJson(harness, "updateAccountMetadata", { level: "professional" });

        expect(unknown.status).toBe(400);
        expect(await unknown.text()).toBe("body.hiddenRole is not allowed");
        expect(disallowed.status).toBe(400);
        expect(await jsonBody(disallowed)).toEqual({ error: "level is not an allowed value" });
    });

    test("stores and serves only the avatar referenced by the account row", async () => {
        const harness = await createHarness();
        const upload = await okJson(await sourceUpload(harness, "uploadAccountAvatar", new File(["avatar"], "avatar.png", { type: "image/png" })));
        const fileId = String(upload.avatarFileId);

        const file = await sourceRequest(harness, "getAccountAvatar", { fileId });

        expect(upload).toMatchObject({ exists: true, userId: "user-123", avatarFileId: fileId });
        expect(fileId).toStartWith("avatars/");
        expect(file.status).toBe(200);
        expect(file.headers.get("content-type")).toBe("image/png");
        expect(await file.text()).toBe("avatar");
    });

    test("requires a CMS key and user id for user-scoped requests", async () => {
        const harness = await createHarness();

        const unauthorized = await harness.sourceFetch(`${functionsBaseUrl}/cms-user-account/health`, {
            headers: { authorization: "Bearer wrong" },
        });
        const missingUser = await harness.sourceFetch(`${functionsBaseUrl}/cms-user-account/personal-information`, {
            headers: { authorization: `Bearer ${activeEnv.CMS_USER_ACCOUNT_API_KEY}` },
        });

        expect(unauthorized.status).toBe(401);
        expect(await jsonBody(unauthorized)).toEqual({ error: "invalid CMS API key" });
        expect(missingUser.status).toBe(401);
        expect(await jsonBody(missingUser)).toEqual({ error: "missing x-user-id" });
    });
});

function decodeBlocSource(bloc: IntegrationBlocArtifact | undefined, path: string): string {
    const encoded = bloc?.source?.[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
}

async function createHarness() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("user-account");
    if (!definition) throw new Error("user-account definition not found");

    const sources = new InMemorySourceRepository();
    const sourceOverlays = new InMemorySourceOverlayRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    await installations.create({
        id: "basic-blocs",
        label: "Basic Blocs",
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "bloc", id: "basic-input", action: "created" }],
        runs: [],
    });
    const importedBlocs: IntegrationBlocArtifact[] = [];
    let deployment: IntegrationConnectorDeployment | undefined;
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-user-account", action: "deployed" },
                ],
            };
        },
    };

    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            sourceOverlays,
            installations,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: "user-account", answers: { id: "user-account" }, options: {} },
        [definition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key" }),
    };

    const handler = await loadEdgeHandler();
    const rest = new UserAccountSupabaseMock();
    activeFetch = async (input, init) => rest.fetch(input, init);
    const sourceFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        try {
            const request = requestFromFetchInput(input, init);
            if (!request.url.startsWith(`${functionsBaseUrl}/cms-user-account/`)) {
                throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
            }
            return await handler(request);
        } catch (error) {
            return new Response(error instanceof Error ? error.stack ?? error.message : String(error), { status: 599 });
        }
    };
    const overlayDeps = {
        fetchImpl: sourceFetch,
        resolveSecret: async (ref: string): Promise<string | undefined> => {
            const key = secretRefToKey(ref) ?? ref;
            return await secrets.get(key) ?? undefined;
        },
    };
    const overlaySources = new SourceOverlaySourceRepository(sources, sourceOverlays, { deps: overlayDeps });

    return {
        result,
        sources: overlaySources,
        baseSources: sources,
        sourceOverlays,
        secrets,
        roles,
        dashboards,
        importedBlocs,
        deployment,
        rest,
        async materializedOverlays() {
            const source = await sources.getSource("urn:user-account");
            if (!source) throw new Error("user-account source not installed");
            return await materializeSourceOverlays(source, await sourceOverlays.getAllOverlays(), overlayDeps);
        },
        sourceFetch,
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return await secrets.get(key) ?? undefined;
        },
    };
}

class UserAccountSupabaseMock {
    private readonly tables: Record<string, JsonRecord[]> = {
        accounts: [],
        extra_fields: [],
    };
    private readonly storageObjects = new Map<string, { body: string; headers: Headers }>();

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin !== supabaseUrl) throw new Error(`unexpected fetch: ${method} ${request.url}`);
        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        if (url.pathname.startsWith("/storage/v1/object/")) return await this.storageFetch(request, url, method);
        if (!url.pathname.startsWith("/rest/v1/")) throw new Error(`unexpected fetch: ${method} ${request.url}`);

        expect(request.headers.get("accept-profile")).toBe("user_account");
        if (method !== "GET" && method !== "HEAD") expect(request.headers.get("content-profile")).toBe("user_account");
        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) throw new Error(`unexpected table: ${table}`);
        if (method === "GET") return jsonResponse(this.select(table, url));
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            const inserted = this.insert(table, row, url.searchParams.get("on_conflict") === "id");
            return jsonResponse([inserted], 201);
        }
        if (method === "PATCH") {
            const patch = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.selectRefs(table, url).map(row => this.update(table, row, patch));
            return jsonResponse(rows);
        }
        if (method === "DELETE") {
            const deleted = this.delete(table, url);
            return jsonResponse(deleted);
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map(row => ({ ...row }));
    }

    private async storageFetch(request: Request, url: URL, method: string): Promise<Response> {
        const prefix = "/storage/v1/object/user-account-avatars/";
        const objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
        if (method === "POST") {
            this.storageObjects.set(objectPath, {
                body: await request.text(),
                headers: new Headers({
                    "content-type": request.headers.get("content-type") ?? "application/octet-stream",
                    etag: "etag-1",
                }),
            });
            return jsonResponse({ Key: objectPath }, 200);
        }
        if (method === "GET") {
            const object = this.storageObjects.get(objectPath);
            if (!object) return jsonResponse({ message: "not found" }, 404);
            return new Response(object.body, { status: 200, headers: object.headers });
        }
        throw new Error(`unexpected storage method: ${method} ${url}`);
    }

    private select(table: string, url: URL): JsonRecord[] {
        return this.selectRefs(table, url).map(row => ({ ...row }));
    }

    private selectRefs(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        const userId = filterValue(url.searchParams.get("cms_user_id"));
        const id = filterValue(url.searchParams.get("id"));
        const or = url.searchParams.get("or");
        if (userId?.operator === "eq") rows = rows.filter(row => same(row.cms_user_id, userId.value));
        if (id?.operator === "eq") rows = rows.filter(row => same(row.id, id.value));
        if (or) {
            const search = or.match(/ilike\.\*([^*]+)\*/)?.[1]?.toLowerCase() ?? "";
            rows = rows.filter(row => ["cms_user_id", "phone", "given_name", "surname", "display_name"].some(key => String(row[key] ?? "").toLowerCase().includes(search)));
        }
        if (table === "extra_fields") {
            rows = [...rows].sort((left, right) =>
                Number(left.position ?? 0) - Number(right.position ?? 0)
                || String(left.id).localeCompare(String(right.id)));
        }
        return rows;
    }

    private insert(table: string, value: JsonRecord, upsert = false): JsonRecord {
        const now = "2026-07-06T11:00:00.000Z";
        if (table === "extra_fields" && upsert) {
            const existing = this.tables[table]!.find(row => same(row.id, value.id));
            if (existing) return this.update(table, existing, value);
        }
        const row = table === "extra_fields"
            ? { required: false, show_in_dashboard_table: false, position: this.tables[table]!.length, ...value, created_at: now, updated_at: now }
            : { ...value, created_at: now, updated_at: now };
        this.tables[table]!.push(row);
        return { ...row };
    }

    private update(table: string, row: JsonRecord, patch: JsonRecord): JsonRecord {
        Object.assign(row, patch, { updated_at: "2026-07-06T11:15:00.000Z" });
        return { ...row };
    }

    private delete(table: string, url: URL): JsonRecord[] {
        const userId = filterValue(url.searchParams.get("cms_user_id"));
        const id = filterValue(url.searchParams.get("id"));
        const deleted: JsonRecord[] = [];
        this.tables[table] = this.tables[table]!.filter(row => {
            const match = (userId?.operator === "eq" && same(row.cms_user_id, userId.value))
                || (id?.operator === "eq" && same(row.id, id.value));
            if (match) deleted.push(table === "extra_fields" ? { id: row.id } : { cms_user_id: row.cms_user_id });
            return !match;
        });
        return deleted;
    }
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-user-account edge handler was not registered");
    return edgeHandler;
}

async function sourceRequest(harness: Harness, endpoint: string, params: Record<string, string> = {}): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await proxySource(harness, new Request(url));
}

async function sourceJson(harness: Harness, endpoint: string, body: unknown, params: Record<string, string> = {}): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await proxySource(harness, new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    }));
}

async function sourceUpload(harness: Harness, endpoint: string, file: File, params: Record<string, string> = {}): Promise<Response> {
    const form = new FormData();
    form.set("file", file);
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await proxySource(harness, new Request(url, { method: "POST", body: form }));
}

async function sourceDelete(harness: Harness, endpoint: string, params: Record<string, string>): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await proxySource(harness, new Request(url, { method: "DELETE" }));
}

async function proxySource(harness: Harness, request: Request): Promise<Response> {
    return await handleSourceRequest(harness.sources, request, {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) return null;
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    return await response.json() as JsonRecord;
}

async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}
