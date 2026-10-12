
# Commit Convention

Use a short type plus a focused domain for new commits. This is a recommended
convention; no commit-message gate is configured, and historical commits do not
all follow it:

```text
feat(domain): summary
fix(domain): summary
improve(domain): summary
docs(domain): summary
test(domain): summary
chore(domain): summary
```

Examples:

```text
feat(cms-content): add image variant manifest
fix(cms-kernel): validate page editor id before loading
docs(agents): refresh package instructions
```

Keep the domain close to the package or feature being changed:
`cms-kernel`, `cms-auth`, `components`, `http-runner`, `cli`,
`docs`, and so on.
