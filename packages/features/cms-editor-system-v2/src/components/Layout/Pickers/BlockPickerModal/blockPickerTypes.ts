import type { EditorCatalogEntry, MediaAccept } from "@bernouy/cms-content/editor";

export type BlockPickerItem =
    | { kind: "block"; entry: EditorCatalogEntry }
    | {
          kind: "template";
          id: string;
          label: string;
          description?: string;
          category?: string;
          subCategory?: string;
          icon?: string;
          content: string;
      }
    | {
          kind: "media";
          label: string;
          description?: string;
          category?: string;
          subCategory?: string;
          icon?: string;
          accept?: MediaAccept[];
      };

export type BlockPickerOption = {
    kind?: BlockPickerItem["kind"];
    item?: BlockPickerItem;
    entry?: EditorCatalogEntry;
    slot?: string;
    slotLabel: string;
};

export type BlockPickerSlotGroup = {
    slot?: string;
    label: string;
    disabledReason?: string;
    options: BlockPickerOption[];
};

export type BlockPickerSelectDetail = {
    option: BlockPickerOption;
};

export const BLOCK_PICKER_SELECT_EVENT = "editor-v2:block-picker-select";
