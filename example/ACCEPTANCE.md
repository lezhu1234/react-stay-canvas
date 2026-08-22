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
- When an ECS dev release is in scope, the **Stay ECS dev deployment** scenario also passes.

## Stay ECS dev deployment

This scenario covers the tag-triggered deployment of the example gallery to `https://canvas.dev.staying.fun`. It is independent of the GitHub Pages deployment.

### Environment and prerequisites

- The target commit is present on the remote `dev` branch and all deterministic checks have passed.
- GitHub Actions secrets `DEV_ACR_USERNAME`, `DEV_ACR_PASSWORD`, `DEV_ECS_HOST`, `DEV_ECS_USERNAME`, `DEV_ECS_PORT`, and `DEV_ECS_KEY` are configured.
- The Aliyun ACR target is the private repository `lezhu-dev/react-stay-canvas` in the Shanghai personal instance.
- The ECS Compose service, immutable image mapping, restricted deployer allowlist, loopback port `127.0.0.1:9006`, and Nginx route for `canvas.dev.staying.fun` are installed.
- ECS available memory is at least 1 GiB and Docker disk availability is at least 20 GiB.
- No other Stay dev release is in progress.

### Operator actions

1. Fetch `origin/dev` and tags, then record the full target commit SHA.
2. Confirm the target commit is an ancestor of `origin/dev` and choose an unused `dev-vYYMMDD-N` tag. Never reuse a pushed tag.
3. Push the tag and record the **DEV Docker Image** Actions run URL.
4. Wait for the workflow to build and push both the release tag and `sha-<commit>` tag, then deploy the SHA-tagged image through `/usr/local/sbin/stay-deploy-dev canvas`.
5. Confirm the Actions run succeeds and the ECS image mapping selects the expected SHA tag.
6. Confirm the Canvas container is healthy with zero restarts and no OOM event, and that only `127.0.0.1:9006` is published.
7. Request `/healthz`, the gallery root, one focused example route, and one integration route through `https://canvas.dev.staying.fun`.
8. Record memory and Docker disk availability, scan bounded container logs for errors, and compare all prod container IDs, images, and states with the pre-deployment baseline.

### Expected result

- The release and SHA tags resolve to the same ACR manifest; ECS runs the SHA tag.
- The Canvas service becomes healthy and the health endpoint returns HTTP 200.
- The gallery and client-side routes load through HTTPS without asset or routing failures.
- Resource gates remain satisfied and every prod container remains unchanged.

### Failure criteria and evidence

Acceptance fails if the tag does not belong to `dev`, build or push fails, the restricted deployer rejects the target, the container does not become healthy, the endpoint or assets fail, a resource gate is crossed, or any prod container changes. Preserve the Actions run URL, target SHA and tag, ACR manifest digest, container ID/image/health/restart/OOM fields, endpoint status codes, bounded error logs, resource figures, and the before/after prod comparison.

### Cleanup and rollback

On deployment failure, the restricted deployer must restore the previous Canvas image and wait for it to become healthy. Do not delete the pushed tag, the current image, or the rollback image. The gallery creates no server-side data, so acceptance requests require no data cleanup.

## Cleanup

Use the page's Reset control or reload the route between runs. Stop the preview server with `Ctrl+C` after the full gallery pass. The examples create no server-side data and require no additional cleanup.
