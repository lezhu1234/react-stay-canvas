# Example Gallery Acceptance Handbook

This handbook covers the manual acceptance of the 10 focused examples and 3 integration scenarios in the example gallery. Scenario-specific actions and expected results live on the corresponding example page under **Acceptance handbook**.

## Environment and prerequisites

- No account, credential, external runtime service, or external test data is required.
- Dependency installation requires package-registry access or a populated local package cache.
- Use a desktop browser with pointer and keyboard input.
- Keep DevTools Console open throughout the run.
- Start from a clean checkout containing the version under review.

## Automated preflight

Run from the repository root:

```bash
pnpm install --frozen-lockfile
npm ci --prefix test
npm ci --prefix example
pnpm build
npm test --prefix test
npm run build --prefix example
npm run preview --prefix example -- --host 127.0.0.1
```

The three install commands use the repository's lockfiles and must complete before the build and test commands. The build and test commands must succeed before manual acceptance begins. Open the address printed by the preview command.

## Manual execution

1. Open every example from the gallery overview.
2. Open the page's **Acceptance handbook** tab.
3. Confirm the listed environment and prerequisites.
4. Perform each operator action in order on **Live result**.
5. Return to **Acceptance handbook** and check each expected result only after observing it.
6. Retain the evidence requested on the page.
7. Run cleanup before continuing to the next example.

The example routes are the source of truth for scenario details. This keeps each runbook beside the exact component and source code being accepted.

## Failure criteria

Acceptance fails when any page-specific expected result is not reproducible, an action runs more than once, stale Canvas pixels remain, state survives Reset unexpectedly, or DevTools reports an uncaught exception or React error.

Record the first failing action, the route, browser version, timestamp, screenshot, and Console output. Do not continue from the failed state when retesting; reset the page first.

## Completion gate

The gallery is accepted only when:

- All automated preflight commands pass.
- All 13 example routes have every expected result checked.
- Required evidence is retained for every route.
- No unresolved failure remains.

## Cleanup

Use the page's Reset control or reload the route between runs. Stop the preview server with `Ctrl+C` after the full gallery pass. The examples create no server-side data and require no additional cleanup.
