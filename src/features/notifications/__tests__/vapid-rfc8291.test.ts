import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchVapidPushNotification,
  encryptWebPushPayload,
} from "../vapid";

function b64u(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decryptRfc8291Body(params: {
  encryptedBody: Buffer;
  subscriberEcdh: crypto.ECDH;
  authSecret: Buffer;
}): string {
  const salt = params.encryptedBody.subarray(0, 16);
  const rs = params.encryptedBody.readUInt32BE(16);
  expect(rs).toBe(4096);
  const idlen = params.encryptedBody[20];
  expect(idlen).toBe(65);
  const asPublicKey = params.encryptedBody.subarray(21, 21 + idlen);
  const payloadWithTag = params.encryptedBody.subarray(21 + idlen);
  const ciphertext = payloadWithTag.subarray(0, payloadWithTag.length - 16);
  const authTag = payloadWithTag.subarray(payloadWithTag.length - 16);

  const uaPublicKey = params.subscriberEcdh.getPublicKey();
  const ecdhSecret = params.subscriberEcdh.computeSecret(asPublicKey);

  const authInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublicKey,
    asPublicKey,
  ]);
  const ikm = Buffer.from(
    crypto.hkdfSync("sha256", ecdhSecret, params.authSecret, authInfo, 32)
  );
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

  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  // Strip trailing RFC 8188 0x02 delimiter
  expect(decrypted[decrypted.length - 1]).toBe(0x02);
  return decrypted.subarray(0, decrypted.length - 1).toString("utf8");
}

describe("Web Push RFC 8291 (aes128gcm) Compliance", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    const vapidPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = vapidPair.privateKey.export({ format: "jwk" });
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(jwk.d!, "base64url"));
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = b64u(ecdh.getPublicKey());
    process.env.VAPID_PRIVATE_KEY = jwk.d!;
    process.env.VAPID_SUBJECT = "mailto:test@famora.app";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("encrypts payloads using RFC 8291 aes128gcm and round-trip decrypts cleanly", () => {
    const subscriber = crypto.createECDH("prime256v1");
    subscriber.generateKeys();
    const authSecret = crypto.randomBytes(16);

    const payload = {
      title: "Household Bill Reminder",
      body: "Electricity bill due tomorrow",
      url: "/f/fam-1/budgets",
    };

    const encrypted = encryptWebPushPayload({
      payload,
      p256dh: b64u(subscriber.getPublicKey()),
      auth: b64u(authSecret),
    });

    // Must not contain plaintext JSON anywhere in the encrypted body
    expect(encrypted.toString("utf8")).not.toContain("Household Bill Reminder");

    const decryptedJson = decryptRfc8291Body({
      encryptedBody: encrypted,
      subscriberEcdh: subscriber,
      authSecret,
    });
    expect(JSON.parse(decryptedJson)).toEqual(payload);
  });

  it("sends required RFC 8291 & VAPID headers on successful delivery (201)", async () => {
    const subscriber = crypto.createECDH("prime256v1");
    subscriber.generateKeys();
    const authSecret = crypto.randomBytes(16);

    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await dispatchVapidPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
      p256dh: b64u(subscriber.getPublicKey()),
      auth: b64u(authSecret),
      payload: { title: "Famora", body: "New update", url: "/f/fam-1" },
    });

    expect(res).toEqual({ ok: true, statusCode: 201 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers.TTL).toBe("86400");
    expect(headers.Authorization).toMatch(/^vapid t=[^,]+, k=/);
    expect(init.body).toBeInstanceOf(Uint8Array);
  });

  it("never falls back to unencrypted JSON when encryption keys are missing or invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const missingRes = await dispatchVapidPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
      p256dh: "",
      auth: "",
      payload: { title: "Famora", body: "Update", url: "/" },
    });

    expect(missingRes.ok).toBe(false);
    expect(missingRes.error).toContain("Missing");
    expect(fetchMock).not.toHaveBeenCalled();

    const invalidRes = await dispatchVapidPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/test-sub",
      p256dh: "invalid-key",
      auth: "short",
      payload: { title: "Famora", body: "Update", url: "/" },
    });
    expect(invalidRes.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags expired subscriptions (404/410) and surfaces delivery failures (500)", async () => {
    const subscriber = crypto.createECDH("prime256v1");
    subscriber.generateKeys();
    const authSecret = crypto.randomBytes(16);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 410 }))
    );
    const goneRes = await dispatchVapidPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/expired",
      p256dh: b64u(subscriber.getPublicKey()),
      auth: b64u(authSecret),
      payload: { title: "Famora", body: "Update", url: "/" },
    });
    expect(goneRes).toEqual({
      ok: false,
      statusCode: 410,
      expired: true,
      error: "Push service responded with HTTP 410",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 }))
    );
    const failRes = await dispatchVapidPushNotification({
      endpoint: "https://fcm.googleapis.com/fcm/send/err",
      p256dh: b64u(subscriber.getPublicKey()),
      auth: b64u(authSecret),
      payload: { title: "Famora", body: "Update", url: "/" },
    });
    expect(failRes).toEqual({
      ok: false,
      statusCode: 500,
      expired: false,
      error: "Push service responded with HTTP 500",
    });
  });
});
