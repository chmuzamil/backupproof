import crypto from "node:crypto";
import type { RecoveryStatePayload } from "./store";

const magic = Buffer.from("BPKIT1");
const saltBytes = 16;
const ivBytes = 12;
const tagBytes = 16;

function key(passphrase: string, salt: Buffer) {
  if (passphrase.length < 12) throw new Error("Recovery kit passphrase must be at least 12 characters.");
  return crypto.scryptSync(passphrase, salt, 32);
}

export function createRecoveryKit(payload: RecoveryStatePayload, passphrase: string) {
  const salt = crypto.randomBytes(saltBytes);
  const iv = crypto.randomBytes(ivBytes);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(passphrase, salt), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), encrypted]);
}

export function openRecoveryKit(kit: Buffer, passphrase: string): RecoveryStatePayload {
  const minimum = magic.length + saltBytes + ivBytes + tagBytes + 1;
  if (kit.length < minimum || !kit.subarray(0, magic.length).equals(magic)) {
    throw new Error("This is not a supported BackupProof recovery kit.");
  }
  let offset = magic.length;
  const salt = kit.subarray(offset, offset += saltBytes);
  const iv = kit.subarray(offset, offset += ivBytes);
  const tag = kit.subarray(offset, offset += tagBytes);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(kit.subarray(offset)), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as RecoveryStatePayload;
  } catch {
    throw new Error("Recovery kit passphrase is incorrect or the kit is damaged.");
  }
}
