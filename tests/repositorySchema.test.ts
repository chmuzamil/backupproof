import { describe, expect, it } from "vitest";
import { repositoryInputSchema } from "../shared/schemas";

describe("repository schema", () => {
  it("accepts SFTP vault configuration", () => {
    expect(repositoryInputSchema.parse({
      name: "Remote vault",
      type: "sftp",
      location: "/backups/friendly-restore",
      credentials: {
        host: "backup.local",
        port: "22",
        username: "backup",
        password: "secret"
      }
    })).toMatchObject({
      name: "Remote vault",
      type: "sftp",
      location: "/backups/friendly-restore"
    });
  });
});
