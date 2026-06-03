import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function deriveKey(password: string) {
  return crypto.scryptSync(password, "frd-vault-v1", 32);
}

export function encryptChunk(password: string, data: Buffer) {
  const key = deriveKey(password);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptChunk(password: string, payload: Buffer) {
  const key = deriveKey(password);
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function sha256Buffer(data: Buffer) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export async function sha256File(filePath: string) {
  const fs = await import("node:fs");
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
