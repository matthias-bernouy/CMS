import { expect, test } from "bun:test";
import { applyDashboardSourceOverlays, dashboardViewAsLegacyDashboard } from "@bernouy/cms-dashboards";
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
        expect(missing).toMatchObject({ exists: false, userId: "user-123" });
        expect(source?.meta).toMatchObject({
            icon: "assets/user-personal-information.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(installedDashboard?.meta).toMatchObject({
            icon: "assets/users.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(fieldsDashboard?.meta).toMatchObject({
            icon: "assets/fields.svg",
            svg: expect.stringContaining("<svg"),
        });
        expect(
            getByUserIdEndpoint?.input?.params?.find((param) => param.name === "userId")?.schema?.semantic?.authority,
        ).toBe("cms");
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
