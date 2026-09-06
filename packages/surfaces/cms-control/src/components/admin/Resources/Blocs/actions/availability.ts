import { collectionSelectableResources } from "@bernouy/cms-integrations/resources";
import type { ManagedDetail } from "../data/model";
import type { AvailabilityView } from "../view/blocks";

export class AvailabilityDrafts {
    private drafts = new Map<string, Set<string>>();
    get(detail: ManagedDetail): AvailabilityView {
        const resources = collectionSelectableResources(detail.definition);
        const original = new Set(
            detail.activeResources ??
                resources.filter((resource) => resource.defaultActive).map((resource) => resource.id),
        );
        const selected = this.drafts.get(detail.id) ?? original;
        return {
            resources: new Map(resources.map((resource) => [resource.artifact, resource.id])),
            selected,
            dirty: [...new Set([...original, ...selected])].filter((id) => original.has(id) !== selected.has(id))
                .length,
        };
    }
    toggle(detail: ManagedDetail, resource: string, active: boolean): void {
        const view = this.get(detail);
        if (![...view.resources.values()].includes(resource)) {
            return;
        }
        const selected = new Set(view.selected);
        if (active) {
            selected.add(resource);
        } else {
            selected.delete(resource);
        }
        this.drafts.set(detail.id, selected);
    }
    clear(id: string): void {
        this.drafts.delete(id);
    }
}
