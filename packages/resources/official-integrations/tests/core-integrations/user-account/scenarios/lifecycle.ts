import { expect, test } from "bun:test";
import { applyDashboardSourceOverlays, dashboardViewAsLegacyDashboard } from "@bernouy/cms-dashboards";
import { decodeBlocSource } from "../harness/blocs";
import { createHarness } from "../harness/create";
import { sourceDelete, sourceJson, sourceRequest } from "../harness/requests";
import { jsonBody, okJson } from "../harness/responses";
import type { JsonRecord } from "../harness/types";

export function registerLifecycleTest(): void {
    test("updates, reads, lists, and deletes personal information through the installed CMS source", async () => {
        const harness = await createHarness();

        await okJson(
            await sourceJson(harness, "createExtraField", {
                id: "company",
                label: "Company",
                type: "string",
                multiple: true,
                showInDashboardTable: true,
                options: [
                    { id: "agency", value: "agency", label: "Agency", position: 0 },
                    { id: "club", value: "club", label: "Club", position: 1 },
                ],
            }),
        );
        await okJson(
            await sourceJson(harness, "createExtraField", {
                id: "employeeCount",
                label: "Employees",
                type: "number",
            }),
        );
        const reorderedFields = await okJson(
            await sourceJson(harness, "reorderExtraFields", {
                ids: ["employeeCount", "company"],
            }),
        );
        const field = await okJson(await sourceRequest(harness, "getExtraField", { id: "company" }));
        const unrestrictedField = await okJson(
            await sourceJson(harness, "createExtraField", {
                id: "company",
                label: "Company",
                type: "string",
                hasAllowedValues: false,
                options: [{ id: "agency", value: "agency", label: "Agency" }],
            }),
        );
        const upsertedField = await okJson(
            await sourceJson(harness, "createExtraField", {
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
            }),
        );
        const missing = await okJson(await sourceRequest(harness, "getAccount"));
        const updated = await okJson(
            await sourceJson(harness, "updateAccount", {
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
            }),
        );
        const invalidBirthDate = await sourceJson(harness, "updateAccount", { birthDate: "2020-02-31" });
        const invalidCountry = await sourceJson(harness, "updateAccount", { countryCode: "France" });
        const metadataUpdated = await okJson(
            await sourceJson(harness, "updateAccountMetadata", {
                company: "agency",
                employeeCount: "13",
            }),
        );
        const adminCreated = await okJson(
            await sourceJson(
                harness,
                "createUserPersonalInformation",
                {
                    givenName: "Admin",
                    surname: "Target",
                    metadata: { company: ["agency"] },
                },
                { userId: "target-user" },
            ),
        );
        const listed = await okJson(await sourceRequest(harness, "listAccounts", { q: "target", limit: "20" }));
        const fetched = await okJson(await sourceRequest(harness, "getAccountByUserId", { userId: "target-user" }));
        const deleted = await okJson(
            await sourceDelete(harness, "deleteUserPersonalInformation", { userId: "target-user" }),
        );
        const installedView = await harness.dashboardViews.getView("user-account-users");
        const fieldsView = await harness.dashboardViews.getView("user-account-fields");
        const installedDashboard = installedView ? dashboardViewAsLegacyDashboard(installedView) : null;
        const fieldsDashboard = fieldsView ? dashboardViewAsLegacyDashboard(fieldsView) : null;
        const materializedOverlays = await harness.materializedOverlays();
        const dashboard = installedDashboard
            ? applyDashboardSourceOverlays(installedDashboard, materializedOverlays)
            : null;
        const accountsTable = dashboard?.views.find((view) => view.id === "accountsTable") as JsonRecord | undefined;
        const accountDetail = dashboard?.views.find((view) => view.id === "accountDetail") as JsonRecord | undefined;
        const extraFieldsTable = fieldsDashboard?.views.find((view) => view.id === "extraFieldsTable") as
            | JsonRecord
            | undefined;
        const extraFieldDetail = fieldsDashboard?.views.find((view) => view.id === "extraFieldDetail") as
            | JsonRecord
            | undefined;
        const source = await harness.sources.getSource("urn:user-account");
        const createExtraFieldEndpoint = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:user-account:createExtraField",
        );
        const reorderExtraFieldsEndpoint = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:user-account:reorderExtraFields",
        );
        const deleteExtraFieldEndpoint = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:user-account:deleteExtraField",
        );
        const updateEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:user-account:updateAccount");
        const updateMetadataEndpoint = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:user-account:updateAccountMetadata",
        );
        const getEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:user-account:getAccount");
        const getByUserIdEndpoint = source?.endpoints.find(
            (endpoint) => endpoint.urn === "urn:user-account:getAccountByUserId",
        );
        const accountForm = harness.importedBlocs.find((bloc) => bloc.tag === "user-account-form");
        const accountFormController = harness.importedBlocs.find((bloc) => bloc.tag === "user-account-form-controller");
        const accountAvatar = harness.importedBlocs.find((bloc) => bloc.tag.includes("user-account-avatar"));
        const accountFormTemplate = decodeBlocSource(accountForm, "template.html");
        const accountAvatarTemplate = decodeBlocSource(accountAvatar, "template.html");
        const accountAvatarStyle = decodeBlocSource(accountAvatar, "style.css");

        expect(missing).toMatchObject({ exists: false, userId: "user-123" });
        const accountDetailView = dashboard?.views.find((view) => view.id === "accountDetail");
        if (accountDetailView?.widget !== "w-detail") {
            throw new Error("user account detail not installed");
        }
        expect(accountDetailView.actions?.find((action) => action.id === "saveAccount")?.after).toEqual({
            resource: "$result",
        });
        expect(source?.meta).toMatchObject({
            icon: "assets/user-personal-information.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(
            getByUserIdEndpoint?.input?.params?.find((param) => param.name === "userId")?.schema?.semantic?.authority,
        ).toBe("cms");
        expect(installedDashboard?.meta).toMatchObject({
            icon: "assets/users.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(fieldsDashboard?.meta).toMatchObject({
            icon: "assets/fields.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(field).toMatchObject({
            field: { id: "company", label: "Company", type: "string", multiple: true, showInDashboardTable: true },
        });
        expect(reorderedFields).toEqual({ ids: ["employeeCount", "company"] });
        expect(unrestrictedField).toMatchObject({ field: { id: "company" } });
        expect(unrestrictedField.field.options).toBeUndefined();
        expect(field.field.options).toEqual([
            { id: "agency", value: "agency", label: "Agency", position: 0 },
            { id: "club", value: "club", label: "Club", position: 1 },
        ]);
        expect(upsertedField).toMatchObject({
            field: {
                id: "company",
                label: "Company",
                type: "string",
                required: true,
                multiple: true,
                showInDashboardTable: true,
            },
        });
        expect(upsertedField.field.options).toEqual([
            { id: "club", value: "club", label: "Club", position: 0 },
            { id: "agency", value: "agency", label: "Agency", position: 1 },
        ]);
        expect(materializedOverlays[0]?.fields.find((item) => item.id === "company")?.options).toEqual([
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
        expect(adminCreated).toEqual(fetched);
        expect(listed.accounts).toEqual([
            expect.objectContaining({
                userId: "target-user",
                givenName: "Admin",
                surname: "Target",
                metadata: { company: ["agency"] },
            }),
        ]);
        expect(fetched).toMatchObject({
            exists: true,
            userId: "target-user",
            givenName: "Admin",
            surname: "Target",
            metadata: { company: ["agency"] },
        });
        expect(deleted).toEqual({ deleted: true, userId: "target-user" });
        expect(harness.rest.rows("accounts").map((row) => row.cms_user_id)).toEqual(["user-123"]);
        expect(accountsTable?.selection).toEqual({ opens: "accountDetail" });
        expect((accountsTable?.columns as JsonRecord[]).map((column) => column.id)).toContain("company");
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
        expect(extraFieldsTable?.actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: "newExtraField", selection: { opens: "extraFieldDetail" } }),
                expect.objectContaining({
                    id: "reorderExtraFields",
                    endpoint: { endpoint: "reorderExtraFields", body: { ids: "$value" } },
                }),
            ]),
        );
        expect(extraFieldDetail?.source).toEqual({
            endpoint: "getExtraField",
            params: { id: "$selection.id" },
            itemPath: "field",
        });
        expect(createExtraFieldEndpoint?.effects).toEqual({ invalidatesSchema: true });
        expect(reorderExtraFieldsEndpoint?.effects).toEqual({ invalidatesSchema: true });
        expect(deleteExtraFieldEndpoint?.effects).toEqual({ invalidatesSchema: true });
        expect(extraFieldDetail?.actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "deleteExtraField",
                    confirm: "Delete this field definition? Existing user metadata values will be kept.",
                    visibleWhen: { value: "$field.id", notEquals: "" },
                }),
            ]),
        );
        expect(extraFieldDetail?.main).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    fields: expect.arrayContaining([
                        expect.objectContaining({
                            id: "id",
                            type: "readonly",
                            visibleWhen: { value: "$field.id", notEquals: "" },
                        }),
                    ]),
                }),
            ]),
        );
        expect(
            (accountDetail?.main as JsonRecord[]).find((section) => section.id === "additionalInformation"),
        ).toMatchObject({
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
        expect((accountDetail?.aside as JsonRecord[]).find((section) => section.id === "avatar")).toMatchObject({
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
        expect(accountFormTemplate).toContain(
            'name="birthDate" label="Date de naissance" type="date" autocomplete="bday" min="1900-01-01"',
        );
        expect(accountFormTemplate).not.toContain('date-format="day-month-year"');
        expect(accountFormTemplate).not.toContain('placeholder="jj/mm/aaaa"');
        expect(accountFormTemplate).not.toContain("invalid-date-message");
        expect(accountFormTemplate).toContain('type="submit" data-account-button>Enregistrer</button>');
        expect(accountFormTemplate).toContain('name="addressLine3"');
        expect(accountFormTemplate).toContain('name="countryCode"');
        expect(accountFormTemplate).toContain('data-account-field="login-email" data-auth-load');
        expect(accountFormTemplate).toContain(
            'data-auth-email label="Adresse e-mail" type="email" autocomplete="email" value="{{ subject.email }}" disabled',
        );
        expect(accountFormTemplate).not.toContain('name="email"');
        expect(accountFormTemplate.indexOf('data-account-field="birth-date"')).toBeLessThan(
            accountFormTemplate.indexOf('data-account-field="login-email"'),
        );
        expect(accountFormTemplate.indexOf('data-account-field="login-email"')).toBeLessThan(
            accountFormTemplate.indexOf('data-account-field="phone"'),
        );
        expect(accountForm?.compositionHTML).toContain("<user-account-form-controller");
        expect(accountForm?.viewJS).toBeUndefined();
        expect(accountFormController?.viewJS).toContain("`${prefix}/system-auth/me`");
        expect(accountFormController?.viewJS).toContain(
            'this.querySelector(\'[data-account-field="birth-date"]\'), "max", currentLocalDate()',
        );
        expect(accountFormTemplate).toContain("<basic-input");
        expect(accountFormTemplate).toContain('<basic-button><button type="submit" data-account-button');
        expect(accountFormTemplate).toContain('<user-account-avatar data-avatar-input name="file"');
        expect(accountFormTemplate).toContain('<basic-grid min="lg" max="none"');
        expect(accountFormTemplate).toContain("<basic-stack");
        expect(accountFormTemplate).toContain('<basic-skeleton shape="circle" width="7rem" height="7rem"');
        expect(accountFormTemplate).toContain('label="Chargement de vos informations"');
        expect(accountFormTemplate).not.toContain(">Chargement…</p>");
        expect(accountFormTemplate).not.toContain("Mes informations");
        expect(accountFormTemplate).not.toContain("data-account-title");
        expect(accountFormTemplate).not.toContain("<p9r-grid");
        expect(accountFormTemplate).not.toContain("<p9r-stack");
        expect(accountFormTemplate).toContain(
            '<basic-toast data-toast-kind="success" tone="success" appearance="filled" role="status" aria-live="polite"',
        );
        expect(accountFormTemplate).toContain(
            '<basic-toast data-toast-kind="error" tone="danger" appearance="filled" role="alert" aria-live="assertive"',
        );
        expect(accountFormTemplate).not.toContain("<basic-toast type=");
        expect(accountFormTemplate).not.toContain('<p cms-condition="save.ok"');
        expect(accountFormTemplate).not.toContain("<cms-binding-core");
        expect(accountFormTemplate).not.toContain("<style");
        expect(accountAvatarTemplate).toContain('class="action"');
        expect(accountAvatarStyle).toContain(".picker:hover .action");
        expect(accountAvatar?.viewJS).toContain("extends Component");
        expect(accountAvatar?.viewJS).toContain("URL.createObjectURL(file)");
        expect(accountFormTemplate).not.toContain('cms-source-publish="user-account:avatar-updated"');
        expect(accountFormTemplate).not.toContain('cms-reload-on="user-account:avatar-updated"');
        expect(accountFormTemplate).not.toContain('cms-source-publish="user-account:updated"');
        expect(accountFormTemplate).not.toContain('cms-reload-on="user-account:updated"');
        expect(accountFormController?.viewJS).toContain('this.querySelector("[data-avatar-form]")?.requestSubmit()');
        expect(accountFormController?.viewJS).toContain('fileId.includes("{{")');
        expect(accountFormController?.viewJS).toContain("this.avatarObserver.observe(this");
        expect(accountFormTemplate).not.toContain('name="avatarUrl"');
        expect(accountFormTemplate.indexOf("<user-account-avatar")).toBeLessThan(
            accountFormTemplate.indexOf('<basic-skeleton shape="circle"'),
        );
        expect(accountFormTemplate).toContain('cms-source-trigger="submit"');
        expect(accountFormTemplate).toContain('value="{{ givenName }}"');
        expect(accountForm?.editorJS).toContain("show-birth-date");
        expect(accountForm?.editorJS).toContain("show-address-line-3");

        const removedField = await okJson(await sourceDelete(harness, "deleteExtraField", { id: "company" }));
        const fieldsAfterRemoval = await okJson(await sourceRequest(harness, "listExtraFields"));
        const accountAfterRemoval = await okJson(await sourceRequest(harness, "getAccount"));
        expect(removedField).toEqual({ deleted: true, id: "company" });
        expect(fieldsAfterRemoval.fields).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: "company" })]),
        );
        expect(accountAfterRemoval).toMatchObject({ metadata: { employeeCount: 13 } });
        expect(accountAfterRemoval.metadata.company).toBeUndefined();
    });
}
