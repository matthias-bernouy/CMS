export const registrationForm = {
    key: "event-registration",
    version: 1,
    accessMode: "public",
    definition: {
        schemaVersion: 1,
        title: "Event registration",
        description: "Choose a session and share the details needed to register.",
        submitLabel: "Register",
        successMessage: "Your registration was received.",
        minCompletionMs: 1200,
        steps: [
            {
                id: "contact",
                title: "Contact details",
                description: "We will use these details only for this registration.",
                fields: [
                    { key: "attendeeName", type: "text", label: "Your name", autocomplete: "name", required: true },
                    { key: "email", type: "email", label: "Email address", autocomplete: "email", required: true },
                ],
            },
            {
                id: "preferences",
                title: "Event preferences",
                description: "Choose the session that works best for you.",
                fields: [
                    {
                        key: "organization",
                        type: "text",
                        label: "Organization",
                        autocomplete: "organization",
                        required: true,
                    },
                    {
                        key: "session",
                        type: "choice",
                        label: "Preferred session",
                        required: true,
                        options: [
                            { key: "morning", label: "Morning" },
                            { key: "afternoon", label: "Afternoon" },
                            { key: "evening", label: "Evening" },
                        ],
                    },
                ],
            },
            {
                id: "attendance",
                title: "Attendance details",
                description: "Tell us how you plan to join.",
                fields: [
                    {
                        key: "attendanceType",
                        type: "select",
                        label: "Attendance type",
                        required: true,
                        options: [
                            { key: "in-person", label: "In person" },
                            { key: "remote", label: "Remote" },
                        ],
                    },
                    { key: "city", type: "text", label: "City", autocomplete: "address-level2", required: true },
                ],
            },
            {
                id: "review",
                title: "Review your registration",
                description: "Add an optional note before submitting.",
                fields: [
                    {
                        key: "notes",
                        type: "textarea",
                        label: "Additional notes",
                        placeholder: "Anything the organizers should know?",
                    },
                    {
                        key: "consent",
                        type: "checkbox",
                        label: "I confirm that these registration details are accurate.",
                        required: true,
                    },
                ],
            },
        ],
    },
} as const;
