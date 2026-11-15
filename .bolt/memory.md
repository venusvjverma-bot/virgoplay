# Project memory

## Product intent & audience

- **VirgoPlay** is a creator-focused web platform with a creator portal and child-creator profiles.
- Includes a promotional/landing page (with footer) and authenticated portal areas.
- Has legal pages: Terms & Conditions, Privacy Policy (currently contain no contact email).

## Brand personality & voice

- Public-facing support contact presented in friendly "email us" format with mailto links alongside plain-text address display.
- Domain identity transitioning from `virgoplay.net` to `virgoimagination.com`.

## Visual design & UX direction

- Vite + React frontend; build output in `dist/` (regenerates on build, not hand-edited).
- **HelpSupportModal**: shared component reachable from creator dashboard/nav; shows support email as clickable mailto link + plain text below.
- **ChildProfilePage**: contains two separate support-contact blocks, each with mailto link + plain-text address.
- Password-reset flow sends links pointing to `https://virgoplay.net/reset-password`.
- Placeholder/example emails (`you@example.com`) used in form fields; internal test accounts (`test.test@gmail.com`, `dev@dev.com`) exist but are not public contact details.

## Decisions, constraints & rationale

- User requires full investigation and explicit approval before any file modifications.
- Contact email replacement is pending: `support@virgoplay.net` → `contact@virgoimagination.com` (6 occurrences across 2 source files).
- Two scope options proposed: **Minimal** (6 email occurrences only) vs **Extended** (also update 2 reset-link URLs and 2 `noreply@virgoplay.net` sender addresses in backend functions).
- Sender address changes depend on email provider's verified domain — separate decision from public contact email.

## Open questions & assumptions

- Awaiting user approval on scope (Minimal vs Extended) for email/domain replacement.
- Whether `noreply@virgoplay.net` backend sender addresses should migrate to `virgoimagination.com` domain.
- Whether password-reset URLs should update to new domain.
- Assumption: `dist/` occurrences need no manual action (auto-regenerated on next build).