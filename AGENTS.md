<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Author attribution is a shared presentational footer in setup and workspace, outside session data and browser PDF generation, so links never affect saved work.
- Prebundle React runtimes and all used UI/lazy export dependencies in Vite before the first screen; dependency discovery must not replace React chunks beneath a mounted preview renderer.
- Additional sphere selection uses independent `s:<id>:additional` boolean fields; the locked `wheel_apply_ops` transaction enforces the cap and clears selection on promotion/deletion, preserving concurrent edits and legacy files.
- Help is an uncontrolled local dialog shared by setup and workspace; its content is separate from session data so it never syncs or enters PDF exports.
- Sector hue is derived from the immutable sphere ID; global CSS tokens control fill intensity, and pointer-preview wedges are local UI state so hovering never writes session scores.
- Session data lives in one `wheel_sessions` row as a flat field map `{key: {v, r}}`; all writes go through the `wheel_apply_ops` SQL function so per-field changes never overwrite each other and text-field conflicts are detected by revision.
- The table has no RLS policies and no anon/authenticated grants; only server functions (`src/lib/wheel/session.functions.ts`) touch it after checking the SHA-256 of the link secret — keeps access tied to the secret link.
- Live sync uses 1s polling through server functions instead of direct realtime subscriptions, because subscriptions could not verify the link secret.
- The link secret travels in the URL hash (`#k=`) so it never reaches server logs; local backup is per session id in localStorage.
- PDF is generated in the browser with pdf-lib + embedded PT Sans (public/fonts) from one snapshot; it never screenshots the UI.
