import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "../server/loadEnv";

describe("loadEnvFile", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backupproof-env-"));
  const envPath = path.join(tempDir, ".env");

  afterEach(() => {
    delete process.env.FRD_TEST_LOAD_ENV;
    delete process.env.FRD_TEST_QUOTED;
  });

  it("loads unset variables from .env", () => {
    fs.writeFileSync(envPath, "FRD_TEST_LOAD_ENV=enabled\n# comment\nFRD_TEST_QUOTED=\"quoted value\"\n");
    expect(loadEnvFile(".env", tempDir)).toBe(true);
    expect(process.env.FRD_TEST_LOAD_ENV).toBe("enabled");
    expect(process.env.FRD_TEST_QUOTED).toBe("quoted value");
  });

  it("does not override existing environment variables", () => {
    process.env.FRD_TEST_LOAD_ENV = "existing";
    fs.writeFileSync(envPath, "FRD_TEST_LOAD_ENV=from-file\n");
    loadEnvFile(".env", tempDir);
    expect(process.env.FRD_TEST_LOAD_ENV).toBe("existing");
  });

  it("fills empty environment variables from .env", () => {
    process.env.FRD_TEST_LOAD_ENV = "";
    fs.writeFileSync(envPath, "FRD_TEST_LOAD_ENV=from-file\n");
    loadEnvFile(".env", tempDir);
    expect(process.env.FRD_TEST_LOAD_ENV).toBe("from-file");
  });
});
