# Licensing & Renewal - Master Plan

**Status:** Plan only - not implemented (licensing was previously deferred).
**Date:** 2026-06-05
**Scope:** Add a license/subscription mechanism with **annual renewal** - a way to
enable the application for a full year and renew it - **without breaking existing
functionality**. Builds on earlier decisions (below).

---

## 0. Prior decisions carried forward

From the earlier (deferred) licensing discussion:

- **Motivation:** protect the product when **deploying to customers**; accepts no
  client-side licensing is fully unbreakable - **signed keys** are the chosen
  balance of effort vs protection. This points to the **self-hosted signed-key
  path (Approach B)** as the decided direction.
- **Scope of a license:** time-based expiry **+ station limit + user limit +
  feature gating**.
- **Validation:** signed license keys; **public key embedded in the build**, the
  **private key kept by the vendor** to generate keys **offline**.
- **Expiry behaviour (as decided):** **14-day grace** period with warnings, then
  **lockout** - with the **owner still able to reach Settings to enter a new
  key**. (This plan also raises a gentler "read-only" alternative for live
  stations - see Sections 7 and 11.)
- **Renewal / "special account":** the owner enters a **new annual signed key** in
  Settings to re-enable for another year - exactly the "enable for a full year
  after use, then renew" behaviour requested.

The rest of this plan formalises that into the license record, the gate, the
grace/renewal flow, and the activation surface, and keeps **Approach A (SaaS)** as
an alternative for the current single Render deployment.

---

## 1. The core decision: who runs the server?

This single choice drives the whole design:

| Model | Who controls the server/clock | Best mechanism |
|---|---|---|
| **A. SaaS (vendor-hosted)** - what we have today on Render | The vendor | **Server-side license state** the vendor sets/extends. Simplest, most tamper-resistant. No keys needed. |
| **B. Self-hosted** - customer runs their own copy | The customer | **Offline-verifiable signed license key** (vendor signs, app verifies with a public key). Prevents forgery/clock abuse. |

The "special account that enables the app for a year" idea maps onto either, but is
implemented differently (Section 8). **Recommendation: build A now** (matches the
current Render deployment) and keep B's signed-key design ready for self-hosting.

---

## 2. Cross-cutting "no-break" guarantees

1. **Never hard-brick a live station.** Expiry moves to a **grace period** (still
   fully usable, with a loud "renew" banner), then to **read-only** - never an
   instant lockout. A renewal hiccup must not stop pumping or handovers.
2. **Enforced on the backend.** The license check is server-side; the frontend
   only reflects status. No client-only gate.
3. **Additive and reversible.** New `license` record + a check in middleware +
   new admin/activation surfaces. No existing endpoint, page, or business rule
   changes; with a valid (or absent-and-defaulted) license everything behaves
   exactly as today.
4. **Fail-open during rollout.** If no license record exists yet, treat the app
   as licensed (so deploying the feature does not lock anyone out). Enforcement is
   switched on only once a license is provisioned.
5. **Auditable.** Activation, renewal, and expiry transitions are written to the
   existing Audit Log.

---

## 3. The license record (shared by both models)

A single per-deployment (and optionally per-station) object the app checks:

```
license = {
  license_id,                       # unique id
  plan,                             # e.g. "standard"
  status,                           # active | grace | expired (derived from dates)
  activated_at,                     # set on first activation ("1 year from use")
  expires_at,                       # activated_at + 365 days (or stamped at issue)
  stations_allowed,                 # cap on active stations (optional)
  features,                         # optional feature flags
  signature, public_key_id          # self-hosted only (Approach B)
}
```

- **"Enable for a full year after use":** on first activation set
  `activated_at = now` and `expires_at = activated_at + 365 days`.
- **Renewal:** push `expires_at` forward another 365 days (Section 6).

Stored per-station in the existing JSON storage (e.g. `license.json`) so it fits
the current storage pattern; a deployment-wide license can live at the station
level for the primary station or in a small top-level store.

---

## 4. Approach A - SaaS (vendor-hosted) [recommended now]

**Idea:** the vendor owns the server, so the license is just **server-side state
the vendor sets and extends** - no keys, nothing the customer can forge.

- **Backend gate:** a small dependency/middleware computes `status` from
  `expires_at` and the grace window, and attaches it to the request context. Write
  endpoints honour the read-only fallback when `status == "expired"`.
- **Vendor control:** a vendor-only mechanism to set/extend `expires_at`:
  - simplest: a protected admin endpoint / internal tool, or
  - a hidden vendor "super-admin" surface (the practical form of the "special
    account" - see Section 8).
- **Renewal:** one action - extend `expires_at` by a year.
- **Why best here:** zero tamper surface (vendor owns the box), least code,
  instant renewal.

---

## 5. Approach B - Self-hosted (signed license keys)

**Idea:** the customer controls the server, so trust must come from a **signature
the customer cannot produce.**

- **Issue:** vendor signs a token (Ed25519 or RSA) over
  `{license_id, customer, stations, features, issued_at, expires_at}` with a
  **private key held only by the vendor**.
- **Verify:** the app verifies the signature with the **public key baked into the
  build**, then reads `expires_at`. Tampering invalidates the signature.
- **Activate:** an **Activation screen** accepts the key (paste/upload) -> verify
  -> store -> unlocked for the term.
- **Anti-abuse for "1 year from activation":** to stop a customer resetting
  `activated_at` or rolling the clock back, either (a) stamp a hard `expires_at`
  at issue time, or (b) add an **online activation/heartbeat** that records
  first-seen and last-seen at the vendor.
- **Renewal:** vendor issues a new signed key with a new expiry; customer pastes
  it in.

---

## 6. Renewal mechanism

- **Trigger:** vendor issues a renewal (Approach A: extend `expires_at`;
  Approach B: new signed key).
- **Apply:** Approach A is immediate server-side; Approach B is applied when the
  key is entered on the Activation screen.
- **Effect:** `expires_at` advances by 365 days; `status` returns to `active`; the
  renewal is logged in the Audit Log.
- **Idempotent / safe:** re-entering the same key, or extending an already-active
  license, simply sets the later expiry; never shortens it.

---

## 7. Grace period, warnings, and fallback

- **Advance warnings:** notify at **30 / 14 / 7 days** before `expires_at` (reuse
  the existing notification + bell system). Show an in-app banner from ~14 days out.
- **Grace period (decided: 14 days after expiry):** app stays **fully usable**
  with a prominent "License expired - renew now" banner. This protects a live
  station from a renewal delay.
- **After grace (as decided): lockout**, except the **owner can still reach
  Settings to enter a new key** and re-enable the app. *Gentler alternative to
  weigh:* a **read-only** fallback (view/close the current day, reports) instead
  of full lockout, given a live fuel station is operational infrastructure -
  see Section 11.
- **Configurable windows** (warning days, grace length) in settings.

---

## 8. Activation / license-admin surface (the "special account")

Reframe "a special account that enables the app for a year" as a controlled
**activation/renewal action**, not a login that silently flips a flag (which is
bypassable by clock/DB edits on self-host):

- **Approach A (SaaS):** a **vendor super-admin** capability (a protected page or
  endpoint) that shows license status and extends the expiry. This is the
  "special account" - vendor-controlled, revocable, audited.
- **Approach B (self-hosted):** an **Activation screen** that accepts a signed
  key; entering a valid key activates/renews. The key is the transferable,
  revocable, signed credential (better than tying a year to one person's login).
- Both surface a clear **License status** view (plan, activated, expires, days
  left) for the owner.

---

## 9. Security cautions

- Do not rely on any client-side check; enforce server-side.
- Self-hosted: never ship the private key; verify signatures only with the public
  key. Include a `license_id` for revocation and consider periodic online
  re-validation where the deployment can reach the internet.
- Clock tampering is possible on self-hosted; mitigate with online
  activation/heartbeat.
- Keep the vendor admin/activation surface access-controlled and audited.

---

## 10. Phasing (additive, reversible)

1. **License record + read path.** Add the `license` store and a backend resolver
   that derives `status` from dates. Fail-open if no record. No enforcement yet.
2. **Status surfacing.** License status view for the owner + advance-warning
   notifications/banners. Still no blocking.
3. **Grace + read-only fallback.** Backend gate enforces grace then read-only;
   tune the allowed-in-read-only action set.
4. **Renewal mechanism.** Approach A: vendor extend-expiry endpoint/page. (Approach
   B: signed-key activation screen + verifier, if/when self-hosting.)
5. **Hardening (self-host only).** Online activation/heartbeat; revocation.

Each phase ships on its own and is reversible; enforcement (Phase 3+) only acts
once a license is provisioned.

## 11. Open questions

1. **Hosting model (gates everything):** stay vendor-hosted SaaS on Render (build
   Approach A), or support self-hosted customers (build Approach B signed keys)?
2. **Scope of a license:** one license per deployment, or per **station** (with a
   `stations_allowed` cap)? Multi-station owners may want per-station terms.
3. **After-grace behaviour:** keep the **decided full lockout** (owner-only
   Settings to enter a key), or soften to a **read-only** fallback so a live
   station is never fully halted? If read-only, which actions stay allowed
   (e.g. close the open day, view reports)?
4. **Grace length and warning schedule:** confirm defaults (e.g. 14-day grace;
   30/14/7-day warnings).
5. **"1 year from activation" vs fixed expiry:** activation-relative term (start
   the clock on first use) or a fixed end date stamped at issue? (Affects
   anti-abuse on self-host.)

## 12. Relationship to prior notes

Supersedes the brief deferred licensing note (which recommended signed keys for
time/station/user/feature gating). This plan keeps signed keys as **Approach B**
(self-hosted) and adds **Approach A** (SaaS server-side) as the recommended path
for the current Render deployment, plus the renewal mechanism, grace period, and
the activation/admin surface.
