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
pnpm verify
npm run preview --prefix example -- --host 127.0.0.1
```

The three install commands use the repository's lockfiles and must complete before verification. `pnpm verify` builds the library, runs the test suite, type-checks the example source, and builds the example gallery; every step must succeed before manual acceptance begins. Open the address printed by the preview command.

## Manual execution

1. On the overview, switch to Chinese. Confirm the overview, navigation, example titles, controls, statuses, Canvas labels, and acceptance handbook use Chinese. Reload once and confirm Chinese remains selected.
2. Switch to English and confirm the same surfaces use English. Reload once and confirm English remains selected.
3. Open one 440px Canvas example, one 720px Canvas integration, and the two-Canvas transfer example on a wide viewport. Confirm every Canvas border ends at the rendered Canvas edge rather than filling the result panel with an empty strip.
4. Narrow the viewport below the Canvas width. Confirm the result panel stays within the page and the Canvas area scrolls horizontally without shrinking or clipping its drawing surface. Restore the desktop viewport.
5. Open every example from the gallery overview.
6. Open the page's **Acceptance handbook** tab.
7. Confirm the listed environment and prerequisites.
8. Perform each operator action in order on **Live result**.
9. Return to **Acceptance handbook** and check each expected result only after observing it.
10. Retain the evidence requested on the page.
11. Run cleanup before continuing to the next example.

The example routes are the source of truth for scenario details. This keeps each runbook beside the exact component and source code being accepted.

## Cross-example visual consistency

Apply these checks whenever the route exposes the relevant behavior:

- A selected or pointer-hit object has an immediate Canvas-level visual change, not only a status or log update.
- A visible label names the same Child, selector, node, annotation, or asset reported by the controls and status area.
- Labels owned by a movable Child travel with that Child through drag, transform, history, import, and export operations.
- Selector query matches use orange outlines; the latest pointer hit uses a blue outline without erasing the query result.
- Single-selection examples restore the previous object before highlighting the next one, and clicking empty space clears selection.
- Repeated imports, history restores, and copied nodes retain a visible stable identity so the operator can distinguish the affected object.

Acceptance fails if a label remains behind its object, a status names an object that cannot be identified in the Canvas, or a selected object has no visible feedback.

## Failure criteria

Acceptance fails when any page-specific expected result is not reproducible, an action runs more than once, stale Canvas pixels remain, state survives Reset unexpectedly, or DevTools reports an uncaught exception or React error.

Record the first failing action, the route, browser version, timestamp, screenshot, and Console output. Do not continue from the failed state when retesting; reset the page first.

## Completion gate

The gallery is accepted only when:

- All automated preflight commands pass.
- Both language modes pass the shell and persistence check.
- Fixed-width Canvas borders fit their rendered content on wide screens and scroll safely on narrow screens.
- All applicable cross-example visual-consistency checks pass.
- All 13 example routes have every expected result checked.
- Required evidence is retained for every route.
- No unresolved failure remains.

## Cleanup

Use the page's Reset control or reload the route between runs. Stop the preview server with `Ctrl+C` after the full gallery pass. The examples create no server-side data and require no additional cleanup.
