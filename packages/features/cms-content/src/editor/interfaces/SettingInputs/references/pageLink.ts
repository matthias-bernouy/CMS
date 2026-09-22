import type { SettingMetadata } from "cms-content/editor/interfaces/SettingInputs/base";
import type { MediaAccept } from "cms-content/editor/interfaces/document/ContentSlots";

export type PageLinkSetting = SettingMetadata<"page-link", string> & {
    allowPage?: boolean;
    allowExternal?: boolean;
    allowMedia?: boolean;
    mediaAccept?: MediaAccept[];
};
