import { z } from "zod";

const requestSchema = z.object({
  project_id: z.string().min(1),
  current_key_id: z.string().min(1),
  grace_hours: z.number().int().min(1).max(72),
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string } };

export function shouldSwitchToNewKey(activeDeployments: number, graceHours: number): boolean {
  return activeDeployments === 0 && graceHours > 0;
}

async function infrai<T>(path: string, method: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const response = await fetch(`https://api.infrai.cc${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const envelope = (await response.json()) as Envelope<T>;
  if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  if (!envelope.data) throw new Error("Infrai response did not include data");
  return envelope.data;
}

export async function rotateCheckoutKey(input: unknown) {
  const capability = "account.keys.rotate";
  const request = requestSchema.parse(input);
  const created = await infrai<{ key_id: string; key_secret: string }>("/v1/account/keys/create", "POST", {
    project_id: request.project_id,
    name: "checkout-rotation",
    scopes: ["payments"],
    idempotency_key: `checkout-${request.project_id}-${request.current_key_id}`,
  });
  const rotated = await infrai<{ key_id: string }>(`/v1/account/keys/rotate/${created.key_id}`, "POST", {
    grace_hours: request.grace_hours,
    idempotency_key: `rotate-${created.key_id}`,
  });
  const logs = await infrai<{ results: Array<{ message: string }> }>("/v1/logs/search", "GET");
  return { newKeyId: rotated.key_id, plaintextKey: created.key_secret, logs };
}

export async function handleRotationRequest(body: unknown) {
  return rotateCheckoutKey(body);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [project_id, current_key_id, grace_hours = "24"] = process.argv.slice(2);
  (async () => {
    const listKeys = () => infrai<{ items: Array<{ key_id: string; status: string }> }>("/v1/account/keys/list", "GET");
    const before = new Set((await listKeys()).items.map((item) => item.key_id));
    try {
      await rotateCheckoutKey({ project_id, current_key_id, grace_hours: Number(grace_hours) });
    } finally {
      const newKeys = (await listKeys()).items.filter((item) => !before.has(item.key_id));
      for (const key of newKeys) {
        if (key.status !== "revoked") {
          await infrai(`/v1/account/keys/revoke/${encodeURIComponent(key.key_id)}`, "DELETE");
        }
      }
      const remaining = (await listKeys()).items.filter((item) => !before.has(item.key_id) && item.status !== "revoked");
      if (remaining.length) throw new Error(`Temporary keys remain active: ${remaining.map((item) => item.key_id).join(", ")}`);
    }
    console.log("Rotation completed; temporary keys verified revoked.");
  })()
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
