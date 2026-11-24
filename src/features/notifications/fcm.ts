import crypto from "node:crypto";

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FcmDispatchResult {
  ok: boolean;
  statusCode?: number;
  unregistered?: boolean;
  unconfigured?: boolean;
  error?: string;
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

export function loadFcmServiceAccount(): FcmServiceAccount | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawJson) as Partial<FcmServiceAccount>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getFcmAccessToken(account: FcmServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = base64UrlEncode(signer.sign(account.private_key));
  const assertion = `${unsigned}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`OAuth token exchange failed (${tokenRes.status}).`);
  }

  const data = (await tokenRes.json()) as { access_token: string; expires_in?: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedAccessToken.token;
}

export function isUnregisteredFcmError(statusCode: number, bodyText: string): boolean {
  if (statusCode === 404 || statusCode === 410) return true;
  return (
    bodyText.includes("UNREGISTERED") ||
    bodyText.includes("Requested entity was not found") ||
    bodyText.includes("NotRegistered")
  );
}

/**
 * Server-only Firebase Cloud Messaging HTTP v1 dispatcher.
 * Never exposes service account credentials to client bundles.
 */
export async function dispatchFcmPushNotification(params: {
  fcmToken: string;
  title: string;
  body: string;
  deepLink: string;
  channelId?: "senvamily_family" | "senvamily_updates";
  data?: Record<string, string>;
}): Promise<FcmDispatchResult> {
  const account = loadFcmServiceAccount();
  if (!account) {
    return {
      ok: false,
      unconfigured: true,
      error: "Firebase FCM server credentials are not configured.",
    };
  }

  try {
    const accessToken = await getFcmAccessToken(account);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      account.project_id
    )}/messages:send`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: params.fcmToken,
          notification: {
            title: params.title,
            body: params.body,
          },
          data: {
            url: params.deepLink,
            ...(params.data ?? {}),
          },
          android: {
            priority: "high",
            notification: {
              channel_id: params.channelId ?? "senvamily_family",
              click_action: "FCM_PLUGIN_ACTIVITY",
            },
          },
        },
      }),
    });

    if (res.ok) {
      return { ok: true, statusCode: res.status };
    }

    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      statusCode: res.status,
      unregistered: isUnregisteredFcmError(res.status, errText),
      error: `FCM HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "FCM dispatch failed.",
    };
  }
}
