import { getEngineAdapter } from "./engines";
import { encryptSecret } from "./crypto";
import { peekGoogleDriveConnection } from "./googleDrive";
import type { Repository } from "../shared/types";
import type { z } from "zod";
import type { repositoryInputSchema } from "../shared/schemas";

type RepositoryInput = z.infer<typeof repositoryInputSchema>;

function resolveCredentialSecret(input: RepositoryInput) {
  if (input.type === "google-drive") {
    const credentials = peekGoogleDriveConnection(input.googleConnectionId);
    if (!credentials) throw new Error("Connect Google Drive before testing this storage.");
    return encryptSecret(credentials);
  }
  if (input.credentials) return encryptSecret(input.credentials);
  return undefined;
}

export async function testRepositoryConnection(input: RepositoryInput) {
  const repository: Repository = {
    id: "test",
    name: input.name,
    engine: input.engine,
    type: input.type,
    location: input.location,
    objectLock: input.objectLock,
    bandwidthLimitKbps: input.bandwidthLimitKbps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const adapter = getEngineAdapter(repository.engine);
  const logs: string[] = [];
  await adapter.check(repository, (line) => logs.push(line), {
    passwordSecret: input.password ? encryptSecret(input.password) : undefined,
    credentialSecret: resolveCredentialSecret(input)
  });

  return {
    ok: true,
    message: logs.at(-1) ?? "Storage connection looks good.",
    logs
  };
}
