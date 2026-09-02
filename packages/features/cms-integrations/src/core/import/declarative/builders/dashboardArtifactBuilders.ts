import type { DashboardDefinition, DashboardViewDefinition } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { resolveTemplates, type TemplateContext } from "../../../definitions/templating/templates";
import type { IntegrationDefinition } from "../../../../interfaces/Integration";

export function buildDashboardViewArtifacts(
    definition: IntegrationDefinition,
    context: TemplateContext,
): DashboardViewDefinition[] {
    const version = definition.version ?? "unversioned";
    return buildArtifacts("dashboard view", () =>
        (definition.artifacts ?? [])
            .filter((artifact) => artifact.type === "dashboard-view")
            .map((artifact) => {
                const view = resolveTemplates(artifact.view, context);
                const placement = view.availability?.defaultPlacement;
                return {
                    ...view,
                    ...(placement?.dashboardId === view.source && definition.kind !== view.source
                        ? {
                              availability: {
                                  ...view.availability,
                                  defaultPlacement: { ...placement, dashboardId: definition.kind },
                              },
                          }
                        : {}),
                    revision: artifact.view.revision ?? `${version}:${artifact.view.id}`,
                    origin: { kind: "integration", integrationId: definition.kind, version },
                };
            }),
    );
}

export function buildDashboardArtifacts(
    definition: IntegrationDefinition,
    context: TemplateContext,
    views: readonly DashboardViewDefinition[] = [],
): DashboardDefinition[] {
    const version = definition.version ?? "unversioned";
    return buildArtifacts("dashboard", () => [
        ...(definition.artifacts ?? [])
            .filter((artifact) => artifact.type === "dashboard")
            .map((artifact) => {
                const dashboard = resolveTemplates(artifact.dashboard, context);
                return {
                    ...dashboard,
                    views: materializeMounts(dashboard.views, views),
                    revision: dashboard.revision ?? `${version}:${dashboard.id}`,
                    origin: { kind: "integration" as const, integrationId: definition.kind, version },
                };
            }),
        ...buildDefaultDashboards(definition, views, version),
    ]);
}

function buildDefaultDashboards(
    definition: IntegrationDefinition,
    views: readonly DashboardViewDefinition[],
    version: string,
): DashboardDefinition[] {
    const groups = new Map<string, DashboardViewDefinition[]>();
    for (const view of views) {
        const dashboardId = view.availability?.defaultPlacement?.dashboardId;
        if (dashboardId) {
            groups.set(dashboardId, [...(groups.get(dashboardId) ?? []), view]);
        }
    }
    const explicitIds = new Set(
        (definition.artifacts ?? []).flatMap((artifact) =>
            artifact.type === "dashboard" ? [artifact.dashboard.id] : [],
        ),
    );
    return [...groups]
        .filter(([dashboardId]) => !explicitIds.has(dashboardId))
        .map(([dashboardId, groupedViews]) => {
            groupedViews.sort(
                (left, right) =>
                    (left.availability?.defaultPlacement?.order ?? 0) -
                        (right.availability?.defaultPlacement?.order ?? 0) || left.id.localeCompare(right.id),
            );
            const mounts = groupedViews.map((view) => ({
                id: view.view.id,
                label: view.meta.name,
                icon: view.meta.icon ?? view.view.icon ?? "layout",
                use: view.id,
                ...(view.revision ? { revision: view.revision } : {}),
            }));
            return {
                schemaVersion: 2,
                id: dashboardId,
                meta: {
                    name: groups.size === 1 ? definition.label : dashboardId,
                    icon: groupedViews[0]?.meta.icon ?? groupedViews[0]?.view.icon ?? "layout",
                },
                homeView: mounts[0]!.id,
                views: mounts,
                origin: { kind: "integration", integrationId: definition.kind, version },
                status: "published",
                revision: `${version}:${dashboardId}`,
            };
        });
}

function materializeMounts(
    mounts: DashboardDefinition["views"],
    views: readonly DashboardViewDefinition[],
): DashboardDefinition["views"] {
    const byId = new Map(views.map((view) => [view.id, view]));
    return mounts.map((mount) => {
        const view = mount.use ? byId.get(mount.use) : undefined;
        return {
            ...mount,
            label: mount.label ?? view?.meta.name ?? view?.view.label ?? mount.id,
            icon: mount.icon ?? view?.meta.icon ?? view?.view.icon ?? "layout",
            ...(mount.children ? { children: materializeMounts(mount.children, views) } : {}),
        };
    });
}

function buildArtifacts<T>(kind: string, build: () => T[]): T[] {
    try {
        return build();
    } catch (error) {
        if (error instanceof IntegrationInputError) {
            throw error;
        }
        throw new IntegrationInputError(
            "artifacts",
            error instanceof Error ? error.message : `invalid ${kind} artifact`,
        );
    }
}
