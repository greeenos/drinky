// Web Push with no dependencies: VAPID auth (RFC 8292) and aes128gcm payload
// encryption (RFC 8291), all on node:crypto.
import crypto from "node:crypto";
import fs from "node:fs";

const b64u = (buf) => Buffer.from(buf).toString("base64url");

// Server key pair, generated once and kept next to the state file.
export function loadVapid(file) {
  let jwk;
  try {
    jwk = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    const { privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    jwk = privateKey.export({ format: "jwk" });
    fs.writeFileSync(file, JSON.stringify(jwk), { mode: 0o600 });
  }
  const raw = [Buffer.from([4]), Buffer.from(jwk.x, "base64url")];
  raw.push(Buffer.from(jwk.y, "base64url"));
  return {
    key: crypto.createPrivateKey({ key: jwk, format: "jwk" }),
    publicKey: b64u(Buffer.concat(raw)),
  };
}

// Encrypt `payload` for one subscription (p256dh/auth are base64url).
export function encrypt(payload, p256dh, auth, salt = crypto.randomBytes(16)) {
  const uaPublic = Buffer.from(p256dh, "base64url");
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const hkdf = (ikm, salt, info, len) =>
    Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

  const ikm = hkdf(
    ecdh.computeSecret(uaPublic),
    Buffer.from(auth, "base64url"),
    Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]),
    32,
  );
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const record = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(21);
  salt.copy(header);
  header.writeUInt32BE(4096, 16); // record size
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, record]);
}

// Send one push; returns the push service's HTTP status.
export async function sendPush(vapid, sub, payload) {
  const enc = (o) => b64u(JSON.stringify(o));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({
    aud: new URL(sub.endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: "https://github.com/greeenos/drinky",
  })}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), {
    key: vapid.key,
    dsaEncoding: "ieee-p1363",
  });
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "600",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${vapid.publicKey}`,
    },
    body: encrypt(payload, sub.keys.p256dh, sub.keys.auth),
    signal: AbortSignal.timeout(10_000),
  });
  return res.status;
}
