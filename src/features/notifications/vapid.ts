import crypto from "node:crypto";
import { isExpiredPushStatus } from "./logic";

function base64UrlEncode(buf: Buffer | string): string {
  const raw = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return raw
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padded =
    str.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (str.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function createVapidJwt(params: {
  audience: string;
  subject: string;
  publicKeyBase64Url: string;
  privateKeyBase64Url: string;
  expirationSeconds?: number;
}): string {
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.expirationSeconds ?? 12 * 3600);
  const claims = base64UrlEncode(
    JSON.stringify({ aud: params.audience, exp, sub: params.subject })
  );
  const unsigned = `${header}.${claims}`;

  // Convert raw 65-byte uncompressed public key + 32-byte private scalar into JWK for ES256 signing
  const pubBytes = base64UrlDecode(params.publicKeyBase64Url);
  const x = base64UrlEncode(pubBytes.subarray(1, 33));
  const y = base64UrlEncode(pubBytes.subarray(33, 65));

  const keyObj = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x,
      y,
      d: params.privateKeyBase64Url,
    },
    format: "jwk",
  });

  const sig = crypto.sign("sha256", Buffer.from(unsigned, "utf8"), {
    key: keyObj,
    dsaEncoding: "ieee-p1363",
  });

  return `${unsigned}.${base64UrlEncode(sig)}`;
}

/**
 * Encrypts a Web Push payload according to RFC 8291 (`aes128gcm` content coding)
 * and RFC 8188 record framing using ephemeral P-256 ECDH and HKDF-SHA-256.
 */
export function encryptWebPushPayload(params: {
  payload: Record<string, unknown>;
  p256dh: string;
  auth: string;
  salt?: Buffer;
}): Buffer {
  const uaPublicKey = base64UrlDecode(params.p256dh);
  if (uaPublicKey.length !== 65 || uaPublicKey[0] !== 0x04) {
    throw new Error("Invalid subscriber p256dh public key.");
  }

  const authSecret = base64UrlDecode(params.auth);
  if (authSecret.length !== 16) {
    throw new Error("Invalid subscriber auth secret.");
  }

  const salt = params.salt ?? crypto.randomBytes(16);
  if (salt.length !== 16) {
    throw new Error("Encryption salt must be 16 bytes.");
  }

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublicKey = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublicKey);

  // RFC 8291 Section 3.3: IKM = HKDF-Extract(auth_secret, ecdh_secret) -> Expand("WebPush: info\0" || ua_pub || as_pub)
  const authInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublicKey,
    asPublicKey,
  ]);
  const ikm = Buffer.from(
    crypto.hkdfSync("sha256", ecdhSecret, authSecret, authInfo, 32)
  );

  // RFC 8291 / 8188: derive 16-byte CEK and 12-byte nonce
  const cek = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0", "utf8"),
      16
    )
  );
  const nonce = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: nonce\0", "utf8"),
      12
    )
  );

  const plaintext = Buffer.from(JSON.stringify(params.payload), "utf8");
  const paddedPlaintext = Buffer.concat([plaintext, Buffer.from([0x02])]);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(paddedPlaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // RFC 8188 Header: salt (16B) || rs (4B big-endian) || idlen (1B) || keyid (65B)
  const rsBuffer = Buffer.alloc(4);
  rsBuffer.writeUInt32BE(4096, 0);
  const header = Buffer.concat([
    salt,
    rsBuffer,
    Buffer.from([asPublicKey.length]),
    asPublicKey,
  ]);

  return Buffer.concat([header, ciphertext, authTag]);
}

export async function dispatchVapidPushNotification(params: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: { title: string; body: string; url: string };
}): Promise<{
  ok: boolean;
  statusCode?: number;
  expired?: boolean;
  error?: string;
}> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@famora.app";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      error: "VAPID keys are not configured on the server.",
    };
  }

  if (!params.p256dh || !params.auth) {
    return {
      ok: false,
      error: "Missing subscriber Web Push encryption keys (p256dh/auth).",
    };
  }

  try {
    const endpointUrl = new URL(params.endpoint);
    const jwt = createVapidJwt({
      audience: endpointUrl.origin,
      subject,
      publicKeyBase64Url: publicKey,
      privateKeyBase64Url: privateKey,
    });

    const encryptedBody = encryptWebPushPayload({
      payload: params.payload,
      p256dh: params.p256dh,
      auth: params.auth,
    });

    const response = await fetch(params.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Authorization: `vapid t=${jwt}, k=${publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(encryptedBody.length),
      },
      body: new Uint8Array(encryptedBody),
    });

    if (response.ok) {
      return { ok: true, statusCode: response.status };
    }

    return {
      ok: false,
      statusCode: response.status,
      expired: isExpiredPushStatus(response.status),
      error: `Push service responded with HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Push dispatch error.",
    };
  }
}
