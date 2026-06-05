import { describe, expect, it } from "vitest";
import { consumeGoogleDriveConnection, startGoogleDriveOAuth } from "../server/googleDrive";
import { repositoryInputSchema } from "../shared/schemas";

describe("Google Drive vault", () => {
  it("creates an offline OAuth URL with the narrow Drive file scope", () => {
    const url = new URL(startGoogleDriveOAuth({
      clientId: "client.apps.googleusercontent.com",
      clientSecret: "secret",
      redirectUri: "http://localhost:8787/api/google-drive/oauth/callback"
    }));

    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("drive.file");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("accepts a connected Google Drive repository", () => {
    const repository = repositoryInputSchema.parse({
      name: "My Drive vault",
      type: "google-drive",
      engine: "frd",
      location: "BackupProof/My server",
      googleConnectionId: "one-time-connection"
    });
    expect(repository.type).toBe("google-drive");
    expect(repository.googleConnectionId).toBe("one-time-connection");
    expect(consumeGoogleDriveConnection("missing")).toBeUndefined();
  });
});
