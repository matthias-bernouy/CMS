/** Rendering and authorization boundary shared by every authored Page. */
export type PageSurface = "control" | "delivery";

/** Surface-neutral authored Page document. */
export interface PageDocument {
    readonly html: string;
}

export interface PageSlot {
    readonly accepts?: readonly PageSlotAccept[];
    readonly min?: number;
    readonly max?: number;
}

export type PageSlotAccept =
    | { readonly kind: "component"; readonly tag: string }
    | { readonly kind: "any-component" }
    | { readonly kind: "plain-text" }
    | { readonly kind: "rich-text"; readonly profile: PageRichTextProfile };

export type PageRichTextProfile = "inline" | "prose";

export type ManagedNativeElementTag =
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "p"
    | "a"
    | "button"
    | "input"
    | "textarea"
    | "select"
    | "output"
    | "img"
    | "svg"
    | "span";

export interface ManagedNativeAttributeConstraint {
    readonly required?: boolean;
    readonly values?: readonly string[];
}

export interface ManagedNativeElement {
    readonly accepts: readonly ManagedNativeElementTag[];
    readonly attributes?: Readonly<Record<string, ManagedNativeAttributeConstraint>>;
}

export type MediaAccept = "image" | "bitmap" | "svg" | "video" | "audio" | "document";

export interface BlocSettingOption {
    readonly value: string;
    readonly label: string;
    readonly icon?: string;
}

export type BlocSettingControl =
    | { readonly kind: "text"; readonly placeholder?: string }
    | { readonly kind: "select" | "segmented"; readonly options: readonly BlocSettingOption[] }
    | { readonly kind: "color"; readonly tokens?: readonly BlocSettingOption[]; readonly allowCustom?: boolean }
    | {
          readonly kind: "page-link";
          readonly allowPage?: boolean;
          readonly allowExternal?: boolean;
          readonly allowMedia?: boolean;
          readonly mediaAccept?: readonly MediaAccept[];
      }
    | { readonly kind: "media-picker"; readonly accept?: readonly MediaAccept[] }
    | { readonly kind: "theme-token-picker"; readonly accept?: readonly string[] }
    | { readonly kind: "number" | "range"; readonly step?: number; readonly suffix?: string }
    | { readonly kind: "toggle" };

interface BlocSettingBase {
    readonly id: string;
    readonly label: string;
    readonly group?: string;
    readonly help?: string;
    readonly visibleWhen?: readonly BlocSettingVisibilityRule[];
}

export type BlocSettingVisibilityValue = string | boolean;

export interface BlocSettingVisibilityRule {
    readonly setting: string;
    readonly equals?: BlocSettingVisibilityValue | readonly BlocSettingVisibilityValue[];
    readonly notEquals?: BlocSettingVisibilityValue | readonly BlocSettingVisibilityValue[];
}

export type BlocSettingItem = BlocSettingBase &
    (
        | {
              readonly type: "string";
              readonly default: string;
              readonly minLength?: number;
              readonly maxLength?: number;
              readonly control: Exclude<BlocSettingControl, { readonly kind: "toggle" | "number" | "range" }>;
          }
        | {
              readonly type: "boolean";
              readonly default: boolean;
              readonly control: Extract<BlocSettingControl, { readonly kind: "toggle" }>;
          }
        | {
              readonly type: "number" | "integer";
              readonly default: number;
              readonly minimum?: number;
              readonly maximum?: number;
              readonly control: Extract<BlocSettingControl, { readonly kind: "number" | "range" }>;
          }
    );

export type BlocSettings = readonly BlocSettingItem[];

/** Normalized Page-facing contract for a Bloc host. */
export interface PageBlocContract {
    readonly id: string;
    readonly kind: "component" | "composition";
    readonly slots: Readonly<Record<string, PageSlot>>;
    readonly nativeElement?: ManagedNativeElement;
    readonly settings?: BlocSettings;
}
