import type { PublishedForm } from "./definition";

export const restaurantPreview: PublishedForm = {
    key: "restaurant-onboarding",
    version: 1,
    accessMode: "public",
    definition: {
        schemaVersion: 1,
        title: "Launch your restaurant profile",
        description: "Four short steps, then your restaurant profile is ready to publish.",
        submitLabel: "Finish setup",
        successMessage: "Your restaurant profile is ready.",
        minCompletionMs: 1200,
        steps: [
            {
                id: "contact",
                title: "Who should we keep in the loop?",
                description: "We will only use these details for your restaurant setup.",
                fields: [
                    { key: "ownerName", type: "text", label: "Your name", autocomplete: "name", required: true },
                    { key: "email", type: "email", label: "Email address", autocomplete: "email", required: true },
                ],
            },
            {
                id: "identity",
                title: "Give your place a personality.",
                description: "Choose the name guests will remember and a visual direction.",
                fields: [
                    {
                        key: "restaurantName",
                        type: "text",
                        label: "Restaurant name",
                        hint: "This is how it will appear on your public profile.",
                        autocomplete: "organization",
                        required: true,
                    },
                    {
                        key: "mood",
                        type: "choice",
                        label: "What should it feel like?",
                        required: true,
                        options: [
                            { key: "warm", label: "Warm and crafted" },
                            { key: "bright", label: "Bright and fresh" },
                            { key: "bold", label: "Bold and modern" },
                        ],
                    },
                ],
            },
            {
                id: "essentials",
                title: "Help guests find the right table.",
                description: "A few practical details make your profile useful from day one.",
                fields: [
                    {
                        key: "cuisine",
                        type: "select",
                        label: "Cuisine",
                        required: true,
                        options: ["French", "Italian", "Japanese", "Mediterranean"].map((label) => ({
                            label,
                            key: label.toLowerCase(),
                        })),
                    },
                    { key: "city", type: "text", label: "City", autocomplete: "address-level2", required: true },
                ],
            },
            {
                id: "review",
                title: "One last look.",
                description: "Add a short introduction. You can change everything later.",
                fields: [
                    {
                        key: "introduction",
                        type: "textarea",
                        label: "Restaurant introduction",
                        placeholder: "Tell guests what makes your table special…",
                    },
                    {
                        key: "consent",
                        type: "checkbox",
                        label: "I confirm that these details are accurate and may be published.",
                        required: true,
                    },
                ],
            },
        ],
    },
};
