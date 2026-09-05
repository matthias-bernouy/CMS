import type { SettingMetadata } from "../base";
import type { MediaAccept } from "../../document/ContentSlots";

export type PageLinkSetting = SettingMetadata<"page-link", string> & {
    allowPage?: boolean;
    allowExternal?: boolean;
    allowMedia?: boolean;
    mediaAccept?: MediaAccept[];
};
