import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingOption,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";

const AUTO_TONE_BUCKETS = 6;

const variantOptions: SettingOption[] = [
    { label: "Soft", value: "soft" },
    { label: "Filled", value: "filled" },
    { label: "Outlined", value: "outlined" },
    { label: "Ghost", value: "ghost" },
];

const toneOptions: SettingOption[] = [
    { label: "Auto (from label)", value: "auto" },
    { label: "Primary", value: "primary" },
    { label: "Secondary", value: "secondary" },
    { label: "Success", value: "success" },
    { label: "Warning", value: "warning" },
    { label: "Danger", value: "danger" },
    { label: "Info", value: "info" },
];

export class BlocEditor extends Editor {
    private observer?: MutationObserver;

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Leading",
                slot: "leading",
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Badge",
                settings: [
                    {
                        type: "select",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "soft",
                        options: variantOptions,
                    },
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "auto",
                        options: toneOptions,
                    },
                    {
                        type: "segmented",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "md",
                        options: [
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Shape",
                        attribute: "shape",
                        defaultValue: "pill",
                        options: [
                            { label: "Pill", value: "pill" },
                            { label: "Rounded", value: "rounded" },
                            { label: "Square", value: "square" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Placement",
                        attribute: "placement",
                        defaultValue: "inline",
                        options: [
                            { label: "Inline", value: "inline" },
                            { label: "Media overlay", value: "overlay" },
                        ],
                    },
                ],
            },
        ];
    }

    override mountEditor(): void {
        this.refresh();
        this.observer = new MutationObserver(this.refresh);
        this.observer.observe(this.target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["tone"],
        });
    }

    override unmountEditor(): void {
        this.observer?.disconnect();
        this.observer = undefined;
    }

    private readonly refresh = (): void => {
        if ((this.target.getAttribute("tone") || "auto") !== "auto") {
            this.target.removeAttribute("data-auto-tone");
            return;
        }

        const label = Array.from(this.target.childNodes)
            .filter((node) => !(node instanceof Element && node.hasAttribute("slot")))
            .map((node) => node.textContent?.trim() || "")
            .join(" ")
            .trim();
        this.target.setAttribute("data-auto-tone", String(hashBucket(label)));
    };
}

function hashBucket(value: string): number {
    let hash = 0;
    for (const character of value) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    return Math.abs(hash) % AUTO_TONE_BUCKETS;
}

registerEditor({ editor: BlocEditor });
