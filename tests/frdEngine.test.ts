import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptChunk, decryptChunk, sha256Buffer } from "../server/engines/frd/chunkCrypto";
import { buildManifest, diffManifest } from "../server/engines/frd/manifest";

describe("FRD chunk crypto", () => {
  it("encrypts and decrypts chunks with vault password", () => {
    const plain = Buffer.from("secret backup data");
    const encrypted = encryptChunk("vault-password-123", plain);
    expect(encrypted.equals(plain)).toBe(false);
    expect(decryptChunk("vault-password-123", encrypted).toString()).toBe("secret backup data");
  });

  it("hashes buffers consistently", () => {
    expect(sha256Buffer(Buffer.from("abc"))).toHaveLength(64);
  });
});

describe("FRD manifest", () => {
  it("stores root-relative paths in manifests", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-manifest-root-"));
    const source = path.join(root, "var", "www");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "index.html"), "hello");

    const entries = await buildManifest([source], () => undefined);
    expect(entries.some((entry) => entry.path.endsWith("var/www/index.html") || entry.path.endsWith("var\\www\\index.html"))).toBe(true);
  });

  it("detects changed files incrementally", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "frd-manifest-"));
    const source = path.join(root, "data");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "a.txt"), "version-one");

    const first = await buildManifest([source], () => undefined);
    await fs.writeFile(path.join(source, "a.txt"), "version-two");
    const second = await buildManifest([source], () => undefined);
    const changed = diffManifest(first, second);

    expect(first).toHaveLength(1);
    expect(changed).toHaveLength(1);
    expect(changed[0].sha256).not.toBe(first[0].sha256);
  });
});
