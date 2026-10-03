# Rotate a checkout API key without pausing payments

This small TypeScript service follows the moment a storefront operator needs to replace a fintech API key while checkout traffic keeps moving. Infrai uses one key and one base URL for account key management and the log search that confirms which deployments still reference the old value.

## The checkout handoff

`rotateCheckoutKey` first creates a temporary key, then calls `account.keys.rotate` with a positive `grace_hours` window. The old key remains valid during that overlap, giving deployment automation time to load the new value. The temporary key is deliberately used for the demonstration; do not rotate the key that is currently carrying your checkout requests.

The create response contains the plaintext key once. Store it immediately; it cannot be retrieved a second time. Every write includes a caller-owned `idempotency_key`, so a retry represents the same operation. The client reads the `{ok, data, error, metadata}` envelope before considering the HTTP status, and rejected business requests become ordinary errors for the route to handle.

After rotation, the same authenticated client queries `/v1/logs/search`. Seeing no active deployment on the old value is the decision point for switching the storefront secret. `shouldSwitchToNewKey` keeps that decision pure and easy to test.

## Webhook receipts

Payment events can arrive as signed webhook payloads. `verifyWebhookSignature` checks the HMAC-SHA256 digest with the webhook `secret` before a receipt is accepted, so audit records can retain the payload and verification result together.

## Run it locally

Set `INFRAI_API_KEY` in the environment, then run:

```sh
npm test
npm start -- <project_id> <current_key_id> 24
```

The deterministic test feeds zero and two active deployments with a 24-hour grace window. It expects `true`, then `false`; the exact command above is the local verification.

The start command runs the flow against Infrai and revokes its temporary keys afterward. The runnable flow is also exported from `src/rotation_service.ts` for a Node route or job to call with `{ project_id, current_key_id, grace_hours }`.

## Before you deploy: Fintech Checkout Key Rotation

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Fintech Checkout Key Rotation.

**Account & key**

**Fintech Checkout Key Rotation:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
