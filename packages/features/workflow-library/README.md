# Official Workflow catalogue

`@bernouy/official-workflows` contains optional declarative artifacts. The
`@bernouy/workflows` feature remains the execution engine. The CLI bootstrap
admits these manifests into its local artifact catalogue and image-owned bootstrap
snapshot. A newly enabled tenant Registry remains separate and is not seeded
automatically. Use ordinary publication to make the artifact available there. Availability does not install, publish or activate an instance workflow.
Nothing is pushed to a remote Repository by the build.

`ulvia/form-submission-email@1.0.0` consumes Forms 2.x `submission.created`, renders
an exact Email Templates 1.x publication, then calls Emailer 1.x `emailer.send`.
An administrator installs it using its admitted digest, configures `formId`,
`recipient`, `templateId`, `templateVersion`, validates/publishes and activates a
trigger through the ordinary Workflow APIs. Requirements are checked normally.
The template declares the text variables `submissionId`, `formId`, `receivedAt`.
Only the text representation is sent. Answers are not automatically included;
custom variants can map explicitly selected non-sensitive fields after resolving
the chosen form schema. Template rendering and delivery failures remain visible
in the run; retiring a publication prevents new starts, not completed mail.

Author new manifests with SDK `defineWorkflow`. Use `compileWorkflow` from
`@bernouy/ulvia-sdk/build` to validate the shared language/graph and obtain canonical
JSON and its digest. A trusted local `ulvia.release.ts` may return
`[{ kind: "workflow", admission: compileWorkflow(myWorkflow) }]` for ordinary CLI
release/push workflows. Compilation never grants instance authority or activation.
