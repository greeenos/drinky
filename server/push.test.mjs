// node --test server/push.test.mjs
// Decrypts as the browser would (RFC 8291, receiver side) to check encrypt().
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { encrypt } from "./push.mjs";

test("a browser can decrypt the push payload", () => {
  const ua = crypto.createECDH("prime256v1");
  const uaPublic = ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const body = encrypt(
    '{"title":"Take a sip"}',
    uaPublic.toString("base64url"),
    auth.toString("base64url"),
  );

  const salt = body.subarray(0, 16);
  assert.equal(body.readUInt32BE(16), 4096);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);

  const hkdf = (ikm, s, info, len) =>
    Buffer.from(crypto.hkdfSync("sha256", ikm, s, info, len));
  const ikm = hkdf(
    ua.computeSecret(asPublic),
    auth,
    Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]),
    32,
  );
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(record.subarray(-16));
  const plain = Buffer.concat([
    decipher.update(record.subarray(0, -16)),
    decipher.final(),
  ]);

  assert.equal(plain.at(-1), 2, "last-record delimiter");
  assert.equal(plain.subarray(0, -1).toString(), '{"title":"Take a sip"}');
});
