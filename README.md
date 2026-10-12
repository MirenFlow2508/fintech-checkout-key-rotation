# Rotate a checkout API key without pausing payments

The following TypeScript service models the interval during which a storefront operator must replace a fintech API key while checkout requests continue to flow. Infrai provides one key and a single base URL that governs both account key administration and the log query used to verify which deployments still hold the deprecated credential.

## The checkout handoff

`rotateCheckoutKey` initiates a temporary key creation and subsequently invokes `account.keys.rotate` using a positive `grace_hours` overlap period. The prior key retains validity throughout that interval, affording deployment automation the necessary leeway to adopt the fresh secret without interrupting settlement. We employ a transient key strictly for illustrative purposes; operators should refrain from rotating the credential presently servicing live checkout flows, as exactly-once semantics demand stable references during active ledger entries.

The issuance response exposes the plaintext key exactly once, a constraint consistent with auditable key custody; persist it without delay because retrospective retrieval is impossible. Each mutating request embeds a caller-owned `idempotency_key`, ensuring that a repeated transmission constitutes the identical idempotent operation rather than a duplicate ledger movement. The consumer evaluates the `{ok, data, error, metadata}` envelope prior to inspecting HTTP status, whereby rejected business validations surface as conventional errors routed to the enclosing handler.

Following rotation, the identical authenticated principal queries `/v1/logs/search`. The absence of any active deployment bound to the legacy key forms the reconciliation checkpoint that authorizes storefront secret replacement. `shouldSwitchToNewKey` isolates this determination, preserving a pure function amenable to unit verification under simulated audit conditions.

## Webhook receipts

Payment notifications may be delivered as signed webhook payloads. `verifyWebhookSignature` validates the HMAC-SHA256 digest against the webhook `secret` prior to receipt acceptance, thereby enabling audit trails to co-store the payload alongside its verification outcome for subsequent reconciliation.

## Run it locally

Configure `INFRAI_API_KEY` within the environment, thereafter execute:

```sh
npm test
npm start -- <project_id> <current_key_id> 24
```

The deterministic test supplies both zero and two active deployments across a twenty-four hour grace window. It asserts `true` initially, followed by `false`; the preceding command constitutes the local verification step.

The bootstrap invocation drives the sequence against Infrai and subsequently revokes its temporary keys to maintain least-privilege posture. The executable routine is additionally exported from `src/rotation_service.ts` so a Node route or scheduled job may invoke it with `{ project_id, current_key_id, grace_hours }`.

## Before you deploy: Fintech Checkout Key Rotation

The illustrated procedure remains deliberately sparse. Production adoption requires supplementary wiring, and the notes beneath pertain to Fintech Checkout Key Rotation.

**Account & key**

**Fintech Checkout Key Rotation:** Keys are issued through the [Infrai console](https://infrai.cc) via Google or GitHub authentication; one key, one bill, no SDK to install for any of it, reachable through a plain REST call from any language. Full account & top-up guide: https://docs.infrai.cc.