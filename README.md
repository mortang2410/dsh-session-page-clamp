# dsh-session-page-clamp

A host-only DSH plugin that reduces oversized `session/page` history requests to a configured message budget. The browser can continue requesting 500 messages; the host calls its original page method with at most 50 by default. This does not limit the number of event records or bytes per message, change stored sessions, or modify the browser.

## Config

| Key | Default | Meaning |
| --- | --- | --- |
| `maxMessages` | `50` | Positive safe integer cap for explicit larger request budgets. |
| `enabled` | `true` | `false` installs no wrapper. |

Invalid configuration fails at activation with the plugin name and invalid field. Config uses Cordis's synchronous Standard Schema interface and has no runtime dependencies. Requests without `maxMessages`, requests at/below the cap, and invalid budgets go to the original service unchanged, by identity. Validation remains the original service's responsibility.

On a clamped request, the plugin makes a new request and turn-window object, lowers `turnWindow.minMessages` to the new budget, and preserves `minTurns` and absent fields. Calls forward the original receiver and AbortSignal and return the original promise unchanged.

## Install and activate

This checkout has no build step, dependencies, client bundle, or UI.

1. Add `"dsh-session-page-clamp": "link:/home/wilder/git-repos/dsh-session-page-clamp"` to the [web profile manifest](</home/wilder/.dsh/profiles/web/package.json>) dependencies.
2. Append `"dsh-session-page-clamp"` to `dsh.profile.bundles` in the [manifest](</home/wilder/.dsh/profiles/web/package.json>). The bundle inserts its own `session-page-clamp` row, so do not duplicate a row in the profile patch.
3. Run `pnpm install` from `/home/wilder/.dsh/profiles/web` and confirm the [installed bundle symlink](</home/wilder/.dsh/profiles/web/node_modules/dsh-session-page-clamp>) points here.
4. Validate composition with `dsh --profile web --dump-config | grep -o 'session-page-clamp'`. Never print the full dump; it can contain secrets.
5. The dispatcher restarts the existing host once ready. Installation and composition alone do not prove activation. This workstream does not restart anything or start a server.

For later config changes, use the existing profile configuration surface or a same-id `session-page-clamp` override, preserving both config keys. That is a separate authorized change; this install does not edit the profile patch.

## Verify

Run `node --test` in this checkout. Tests cover all eight behavior-contract points plus the live-verification script's request/response handling through fake external commands.

After the host restart, run:

```bash
/home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh
# Optional different session:
/home/wilder/git-repos/dsh-session-page-clamp/scripts/verify-live.sh session-example
```

The script reads the launch token from the user service journal without printing it, mints a cookie expecting HTTP 303, learns the latest session cursor by deliberately overshooting, and sends a real `session/page` request with `maxMessages: 500`, `minMessages: 50`, and `minTurns: 3`. Output contains only auth status, cursor, response byte count, record count, and `hasMore`, never the token, cookie contents, or response records. The cookie file is mode 600 under `/home/wilder/.dsh/.scratch/session-page-clamp/` and is emptied on exit. Response bodies stay in memory, with a 32 MiB bound; no response body is written to scratch. The default session is the dispatcher's measured large session.

Compare the post-restart measurement with the dispatcher's baseline for the same session and cursor. A smaller page alone is not proof of which code ran if the history changed. Also check the plugin's mounted state and any activation error after restart. `python3 /home/wilder/.dsh/check-web-plugins.py web` checks installed bundle names and browser boot-graph registrations; this host-only plugin has no client half for that checker to execute.

## Implementation limits

Cordis 4 returns a new shadow-method Proxy for each contextual method read, so `ctx.sessionController.page === wrapper` is not a valid activation check. Its contextual write trap also targets a transient shadow. The dispatcher revised contract point 5 after an actual Cordis mount reproduced this mismatch. The plugin therefore unwraps `ctx.sessionController[Symbol.for('cordis.original')]`, defines an own `page` property on that shared raw service, and verifies read-back on the raw object. The gateway's contextual method Proxy then invokes the wrapper, which forwards Cordis's shadow receiver unchanged so `this.ctx` and helper methods keep the invocation's context.

When there is no raw-original symbol, ordinary service objects retain assignment/read-back verification. A frozen instance or ignored proxy assignment falls back to its immediate prototype. If neither supported site works, activation fails loudly. Prototype fallback affects all instances sharing that prototype until disposal. The real-Cordis integration test resolves Cordis from the installed profile, emulates the gateway's exact `Reflect.get`/`Reflect.apply` sequence, and proves clamping, shadow helper behavior, original promise identity, and restoration. It skips only if Cordis cannot be resolved; it ran, without skipping, on this host.

The first mount owns the wrapper. A second mount detects its module-level Symbol and does not stack or change caps. Disposing the owner restores the exact original property descriptor/function; an inherited instance shadow is removed. A later remount wraps once. Duplicate mounts are not reference-counted.

This is a method-interposition seam rather than an upstream paging-policy extension point. A host upgrade can change its validity. The plugin only changes `page`, not `follow` snapshots or any other RPC.

## Rollback

Remove only this dependency and bundles-list entry from the web profile manifest, run `pnpm install` there, and have the dispatcher restart the existing host. The bundle's inserted row then disappears automatically. Do not overwrite the complete manifest or lockfile with baseline copies when other sessions may have changed them. The repository stays available for review and reinstallation; it has no remote and is not pushed.
