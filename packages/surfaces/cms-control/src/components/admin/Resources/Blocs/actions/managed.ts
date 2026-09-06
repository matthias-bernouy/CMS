import { importIntegration, integrationUpgradeVersions, upgradeIntegrationInstallation } from "../../Integrations/api";
import { collectionSelectableResources } from "@bernouy/cms-integrations/resources";
import { collectionDefinition } from "../data/api";
import type { BlocCollection } from "../data/model";
import { button, element } from "../view/dom";
import { openDialog, dialogError } from "./dialog";

export async function showUpdates(
    root: ShadowRoot,
    collection: BlocCollection,
    changed: () => Promise<void>,
): Promise<void> {
    const id = collection.installation!.id;
    const { dialog, body, footer } = openDialog(root, `${collection.name} updates`);
    body.append(element("p", "dialog-description", "Checking available versions…"));
    try {
        const versions = await integrationUpgradeVersions(id);
        if (!dialog.open || !body.isConnected) {
            return;
        }
        body.replaceChildren(element("div", "version-current", `Installed version ${versions.current}`));
        if (!versions.versions.length) {
            body.append(
                element("h3", "update-title", "Your collection is up to date"),
                element("p", "dialog-description", "No newer compatible version is available from your repository."),
            );
            const done = button("Done", "close-dialog", "button primary");
            done.addEventListener("click", () => dialog.close());
            footer.append(done);
            const reasons =
                versions.targets
                    ?.filter((target) => !target.eligible)
                    .flatMap((target) => target.reasons.map((reason) => `${target.version}: ${reason}`)) ?? [];
            if (reasons.length) {
                const details = element("details", "technical-details");
                details.append(element("summary", "", "Other versions"), element("p", "", reasons.join(" ")));
                body.append(details);
            }
            return;
        }
        body.append(element("h3", "update-title", "An update is available"));
        const label = element("label", "form-field");
        const select = element("select");
        for (const version of versions.versions) {
            const option = element("option", "", version);
            option.value = version;
            select.append(option);
        }
        const preferred = [versions.stable, versions.latest].find(
            (version) => version && versions.versions.includes(version),
        );
        if (preferred) {
            select.value = preferred;
        }
        label.append(element("span", "", "Version to install"), select);
        body.append(label);
        const upgrade = button(`Update collection`, "confirm-update", "button primary");
        upgrade.addEventListener("click", async () => {
            upgrade.disabled = true;
            select.disabled = true;
            upgrade.textContent = "Updating…";
            try {
                await upgradeIntegrationInstallation(id, select.value);
                await changed();
                if (body.isConnected) {
                    dialog.close();
                }
            } catch (error) {
                dialogError(body, error instanceof Error ? error.message : "Update failed.");
            } finally {
                upgrade.disabled = false;
                select.disabled = false;
                upgrade.textContent = "Update collection";
            }
        });
        footer.append(upgrade);
    } catch (error) {
        dialogError(body, error instanceof Error ? error.message : "Unable to check for updates.");
    }
}

export async function showImport(
    root: ShadowRoot,
    kind: string,
    imported: (id: string) => Promise<void>,
): Promise<void> {
    const { dialog, body, footer } = openDialog(root, "Add a collection");
    body.append(element("p", "dialog-description", "Loading collection…"));
    try {
        const definition = await collectionDefinition(kind);
        if (!dialog.open || !body.isConnected) {
            return;
        }
        body.replaceChildren(
            element("h3", "update-title", definition.label),
            element("p", "dialog-description", definition.description ?? ""),
        );
        const count = collectionSelectableResources(definition).length;
        body.append(
            element("p", "version-current", `${count} blocs · Version ${definition.version}`),
            element(
                "p",
                "dialog-description",
                "You can choose which blocs appear in the editor from inside the collection.",
            ),
        );
        const add = button("Add collection", "confirm-import", "button primary");
        add.addEventListener("click", async () => {
            add.disabled = true;
            add.textContent = "Adding collection…";
            try {
                const result = await importIntegration({ kind: definition.kind, answers: {} });
                await imported(result.installation?.id ?? kind);
                if (body.isConnected) {
                    dialog.close();
                }
            } catch (error) {
                dialogError(body, error instanceof Error ? error.message : "Unable to add this collection.");
            } finally {
                add.disabled = false;
                add.textContent = "Add collection";
            }
        });
        footer.append(add);
    } catch (error) {
        dialogError(body, error instanceof Error ? error.message : "Unable to load this collection.");
    }
}
