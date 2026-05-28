export const P9R_ATTR = {
    ACTION: {
        DISABLE_DELETE:           "p9r-action-disable-delete",
        DISABLE_ADD_BEFORE:       "p9r-action-disable-add-before",
        DISABLE_ADD_AFTER:        "p9r-action-disable-add-after",
        DISABLE_DRAGGING:         "p9r-action-disable-dragging",
        DISABLE_DUPLICATE:        "p9r-action-disable-duplicate",
        DISABLE_SAVE_AS_TEMPLATE: "p9r-action-disable-save-as-template",
        DISABLE_CHANGE_COMPONENT: "p9r-action-disable-change-component",
        INLINE_ADDING:            "inline-adding",
        ALLOW_RESIZE_IMAGE:       "p9r-allow-resize-image",
    },

    TEXT: {
        DISABLE_TYPE:         "p9r-text-disable-type",
        DISABLE_EDITING:      "p9r-text-disable-editing",
        DISABLE_BOLD:         "p9r-text-disable-bold",
        DISABLE_ITALIC:       "p9r-text-disable-italic",
        DISABLE_UNDERLINE:    "p9r-text-disable-underline",
        DISABLE_OVERLINE:     "p9r-text-disable-overline",
        DISABLE_LINE_THROUGH: "p9r-text-disable-line-through",
        EDITABLE:             "p9r-text-editable",
        BLOC_MANAGEMENT:      "p9r-text-bloc-management",
        PLACEHOLDER:          "p9r-text-placeholder",
    },

    EDITOR: {
        IDENTIFIER:            "p9r-identifier",
        PARENT_IDENTIFIER:     "p9r-parent-identifier",
        IS_EDITOR:             "p9r-is-editor",
        OPAQUE:                "p9r-opaque",
        IS_CREATING:           "p9r-is-creating",
        PERSISTENT_IDENTIFIER: "p9r-persistent-identifier"
    }

} as const;