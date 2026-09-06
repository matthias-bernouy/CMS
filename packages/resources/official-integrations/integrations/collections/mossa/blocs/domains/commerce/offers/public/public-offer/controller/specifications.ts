type RecordValue = Record<string, any>;

export function metadataSpecifications(
    metadata: unknown,
    fields: unknown,
    excludedFields: string[],
): Array<[string, unknown, string?]> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || !Array.isArray(fields)) {
        return [];
    }
    const definitions = new Map(
        fields
            .filter((field) => field && typeof field.key === "string" && typeof field.label === "string")
            .map((field) => [field.key, field]),
    );
    return Object.entries(metadata).flatMap(([key, value]) => {
        const field = definitions.get(key);
        if (!field || excludedFields.includes(key)) {
            return [];
        }
        const label = field.label.trim();
        const unit = typeof field.unit === "string" ? field.unit.trim() || undefined : undefined;
        return label ? [[label, value, unit] as [string, unknown, string?]] : [];
    });
}

export function variantSpecifications(variant: unknown): Array<[string, unknown, string?]> {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
        return [];
    }
    const value = variant as RecordValue;
    const options = Array.isArray(value.options) ? value.options : Array.isArray(value.choices) ? value.choices : [];
    if (options.length) {
        return options.flatMap((option) => {
            if (!option || typeof option !== "object") {
                return [];
            }
            const item = option as RecordValue;
            const label = String(item.axisLabel || item.axisKey || "Option").trim();
            const optionValue = String(item.valueLabel || item.valueKey || "").trim();
            return optionValue ? [[label, optionValue] as [string, unknown, string?]] : [];
        });
    }
    const title = String(value.title || "").trim();
    return title ? [["Variant", title]] : [];
}
export function sourceSpecifications(value: unknown): Array<[string, unknown, string?]> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
            return [];
        }
        const specification = entry as RecordValue;
        const label = String(specification.label || "").trim();
        const fieldValue = specification.value;
        return label && fieldValue !== undefined
            ? [[label, fieldValue, String(specification.unit || "").trim() || undefined]]
            : [];
    });
}
export function displayValue(value: unknown, unit?: string): string {
    if (Array.isArray(value)) {
        return value.map((item) => displayValue(item)).join(", ");
    }
    if (typeof value === "boolean") {
        return value ? "Oui" : "Non";
    }
    if (typeof value === "object" && value) {
        return Object.values(value)
            .map((item) => displayValue(item))
            .join(" · ");
    }
    const text = String(value);
    return unit && !text.toLowerCase().endsWith(unit.toLowerCase()) ? `${text} ${unit}` : text;
}
