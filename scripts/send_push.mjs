#!/usr/bin/env node
/* Send one notification to the reader's phone through the Web Push protocol.
   No dependencies. Secrets come from the environment and are never stored in this repository.

   Usage, with the keys in a private folder that holds vapid.json and subscription.json:
     node scripts/send_push.mjs --keys /path/to/keys --title "Headline" --body "Asia market" --url "#/2026-11-24/slug"

   Or with the keys in the environment:
     PUSH_SUBSCRIPTION='{"endpoint":"...","keys":{"p256dh":"...","auth":"..."}}' \
     VAPID_PUBLIC='...' VAPID_PRIVATE_JWK='{"kty":"EC",...}' node scripts/send_push.mjs --title "Headline"

   vapid.json is { "publicKey": "...", "privateJwk": { ... } }. subscription.json is the setup code from the app.

   Set NODE_USE_ENV_PROXY=1 when the network goes through a proxy.
   Exits 0 when the push service accepts the message, 1 otherwise. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s).replace(/=+$/, ""), "base64url");

function hkdf(salt, ikm, info, length) {
  return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, length));
}

// RFC 8291 (message encryption for Web Push) with the aes128gcm content coding of RFC 8188.
export function encrypt(subscription, payload) {
  const uaPublic = fromB64u(subscription.keys.p256dh);
  const authSecret = fromB64u(subscription.keys.auth);
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

// The reverse, used only by the self-test below.
export function decrypt(clientEcdh, authSecret, message) {
  const salt = message.subarray(0, 16);
  const idLen = message.readUInt8(20);
  const asPublic = message.subarray(21, 21 + idLen);
  const data = message.subarray(21 + idLen);
  const shared = clientEcdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientEcdh.getPublicKey(), asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString();
}

// RFC 8292: a short-lived token that proves the sender is the one the phone subscribed to.
function vapidHeader(endpoint, publicKey, privateJwk, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: privateJwk, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + claims), { key, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + head + "." + claims + "." + b64u(sig) + ", k=" + publicKey;
}

export async function send(subscription, vapid, message, { ttl = 6 * 3600, urgency = "normal" } = {}) {
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
      Authorization: vapidHeader(subscription.endpoint, vapid.publicKey, vapid.privateJwk, vapid.subject)
    },
    body: encrypt(subscription, JSON.stringify(message))
  });
  return { status: res.status, text: await res.text() };
}

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const client = crypto.createECDH("prime256v1");
    client.generateKeys();
    const auth = crypto.randomBytes(16);
    const sub = { endpoint: "https://example.invalid/x", keys: { p256dh: b64u(client.getPublicKey()), auth: b64u(auth) } };
    const text = JSON.stringify({ title: "Tōkaidō", body: "round trip" });
    const ok = decrypt(client, auth, encrypt(sub, text)) === text;
    console.log(ok ? "self-test passed" : "self-test FAILED");
    process.exit(ok ? 0 : 1);
  }
  const title = arg("title");
  if (!title) {
    console.error("usage: send_push.mjs [--keys <folder>] --title <text> [--body <text>] [--url <#/date/id>]");
    process.exit(1);
  }
  let subscription;
  let vapid;
  const keys = arg("keys");
  if (keys) {
    const read = (name) => JSON.parse(fs.readFileSync(path.join(keys, name), "utf8"));
    try {
      subscription = read("subscription.json");
      vapid = read("vapid.json");
    } catch (err) {
      console.error("could not read vapid.json and subscription.json in " + keys + ": " + err.code);
      process.exit(1);
    }
  } else {
    const need = ["PUSH_SUBSCRIPTION", "VAPID_PUBLIC", "VAPID_PRIVATE_JWK"].filter((k) => !process.env[k]);
    if (need.length) {
      console.error("missing environment: " + need.join(", ") + " (or pass --keys <folder>)");
      process.exit(1);
    }
    subscription = JSON.parse(process.env.PUSH_SUBSCRIPTION);
    vapid = { publicKey: process.env.VAPID_PUBLIC, privateJwk: JSON.parse(process.env.VAPID_PRIVATE_JWK) };
  }
  vapid.subject = vapid.subject || process.env.VAPID_SUBJECT || "https://lamerx93.github.io/daily-briefing/";
  const out = await send(subscription, vapid, { title, body: arg("body") || "", url: arg("url") || "#/" });
  const ok = out.status >= 200 && out.status < 300;
  console.log((ok ? "sent" : "NOT sent") + ": " + out.status + " " + out.text.slice(0, 200));
  if (out.status === 404 || out.status === 410) console.log("The phone's subscription has expired. The reader must turn notifications on again in the app and share the new setup code.");
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1].endsWith("send_push.mjs")) main();
