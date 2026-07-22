import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { childContentSlot, childOverride, dataScope, parentContentOverride } from "./fixtures";

export class DataRootEditor extends Editor {
    override mountEditor(): void {
        this.declareDataScope(dataScope);
    }
}

export class ParentEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [{ kind: "self", label: "Parent", settings: [] }];
    }

    override mountEditor(): void {
        for (const child of this.getChildren()) {
            child.addSettings(childOverride);
            child.addContentSlots(parentContentOverride);
        }
    }
}

export class ChildEditor extends Editor {
    protected override textCapability() {
        return { format: "richtext" as const, bold: true, dynamic: true };
    }

    protected override contentSlots(): ContentSlot[] {
        return [childContentSlot];
    }

    protected override settings(): SettingSection[] {
        return [{ kind: "self", label: "Child", settings: [] }];
    }
}

export class RichTextParentEditor extends Editor {
    protected override textCapability() {
        return { format: "richtext" as const, bold: true, size: true };
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Items",
                slot: "items",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

export class SpanEditor extends Editor {
    protected override textCapability() {
        return { format: "richtext" as const, bold: true };
    }
}

export class OpaqueEditor extends Editor {
    protected override structureMode() {
        return "opaque" as const;
    }
}

export class UnsafeCompositionEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [childContentSlot];
    }

    protected override textCapability() {
        return { format: "text" as const, dynamic: true };
    }
}
