import type { SegmentedSetting, SettingSection } from "@bernouy/cms-content/editor";

export function visibility(label: string, attribute: string): SegmentedSetting {
    return {
        type: "segmented",
        label,
        attribute,
        defaultValue: "true",
        options: [
            { label: "Show", value: "true" },
            { label: "Hide", value: "false" },
        ],
    };
}

export function fieldStyleSection(): SettingSection {
    const values = ["primary", "secondary", "neutral", "info", "success", "warning", "danger"];
    return {
        kind: "self",
        label: "Field style",
        settings: [
            {
                type: "select",
                label: "Tone",
                attribute: "field-tone",
                defaultValue: "primary",
                options: values.map(option),
            },
            {
                type: "select",
                label: "Appearance",
                attribute: "field-appearance",
                defaultValue: "outlined",
                options: ["outlined", "soft", "filled", "ghost"].map(option),
            },
        ],
    };
}

export function notificationSection(): SettingSection {
    return {
        kind: "self",
        label: "Notifications",
        settings: [
            select("Position", "toast-position", "top-right", ["top-right", "top-left", "bottom-right", "bottom-left"]),
            segmented("Width", "toast-width", "auto", ["auto", "sm", "md", "lg", "full"]),
            segmented("Density", "toast-density", "regular", ["compact", "regular", "spacious"]),
            segmented("Radius", "toast-radius", "md", ["none", "sm", "md", "lg", "pill"]),
            segmented("Shadow", "toast-shadow", "none", ["none", "sm", "md", "lg"]),
            { type: "text", label: "Success duration", attribute: "success-toast-duration", defaultValue: "4500" },
            { type: "text", label: "Error duration", attribute: "error-toast-duration", defaultValue: "6000" },
        ],
    };
}

function select(label: string, attribute: string, defaultValue: string, values: string[]) {
    return { type: "select" as const, label, attribute, defaultValue, options: values.map(option) };
}

function segmented(label: string, attribute: string, defaultValue: string, values: string[]): SegmentedSetting {
    return { type: "segmented", label, attribute, defaultValue, options: values.map(option) };
}

function option(value: string): { label: string; value: string } {
    const words = value.replaceAll("-", " ");
    return { label: words.charAt(0).toUpperCase() + words.slice(1), value };
}
