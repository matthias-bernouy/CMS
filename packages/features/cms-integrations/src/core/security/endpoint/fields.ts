import type { DashboardField, DashboardFormOperation, DashboardWidget } from "@bernouy/cms-dashboards";
import type { IntegrationDefinition } from "../../../interfaces/Integration";

export type IntegrationFormFields = { fields: DashboardField[]; valuesPath?: string };

/** Read reference declarations from installed views, using the same names as their native forms. */
export function integrationFormFields(
    definition: IntegrationDefinition | undefined,
    target?: { source: string; endpoint: string },
): IntegrationFormFields[] {
    const forms: IntegrationFormFields[] = [];
    const append = (source: string, operation: DashboardFormOperation | undefined, fields: DashboardField[]) => {
        if (
            !operation ||
            (target && ((operation.sourceId ?? source) !== target.source || operation.endpoint !== target.endpoint))
        ) {
            return;
        }
        forms.push({
            valuesPath: operation.valuesPath,
            fields: fields.map((field) => ({ ...field, path: normalizedName(field.name ?? field.path) })),
        });
    };
    const visit = (source: string, widgets: DashboardWidget[]) => {
        for (const widget of widgets) {
            if (widget.widget === "w-section") {
                visit(source, widget.children);
            } else if (widget.widget === "w-tabs") {
                widget.tabs.forEach((tab) => visit(source, tab.children));
            } else {
                if (widget.widget === "w-detail") {
                    append(
                        source,
                        widget.save,
                        [...widget.main, ...(widget.aside ?? [])].flatMap((section) =>
                            "fields" in section ? section.fields : [],
                        ),
                    );
                }
                for (const action of widget.actions ?? []) {
                    append(source, action.form, action.form?.fields ?? []);
                }
            }
        }
    };
    for (const artifact of definition?.artifacts ?? []) {
        if (artifact.type === "dashboard-view") {
            const nodes = [artifact.view.view];
            while (nodes.length) {
                const node = nodes.pop()!;
                visit(artifact.view.source, node.widgets);
                nodes.push(...(node.children ?? []));
            }
        }
    }
    return forms;
}

export function integrationReferenceFields(definition: IntegrationDefinition | undefined): DashboardField[] {
    return integrationFormFields(definition).flatMap((form) => form.fields);
}

function normalizedName(value: string): string {
    return value.replace(/\[([^\]]+)\]/g, ".$1");
}
