import type { z } from "zod";
import type { repositoryInputSchema } from "../shared/schemas";
import { assertExternalEngine } from "./engineAvailability";
import { consumeGoogleDriveConnection } from "./googleDrive";
import type { Store } from "./store";

type RepositoryInput = z.infer<typeof repositoryInputSchema>;

export async function createRepositoryFromInput(store: Store, input: RepositoryInput) {
  if (input.engine === "restic" || input.engine === "kopia") {
    if (!input.password) throw new Error("Repository password is required for Restic and Kopia vaults");
    await assertExternalEngine(input.engine);
  }
  if ((input.type === "s3" || input.type === "b2") && !input.credentials) {
    throw new Error("Cloud vault credentials are required for S3 and B2");
  }

  const passwordSecretId = input.password ? await store.putSecret(input.password) : undefined;
  const googleCredentials = consumeGoogleDriveConnection(input.googleConnectionId);
  if (input.type === "google-drive" && !googleCredentials) {
    throw new Error("Connect Google Drive before creating this storage location.");
  }
  const credentialSecretId = googleCredentials
    ? await store.putSecret(googleCredentials)
    : input.credentials
      ? await store.putSecret(input.credentials)
      : undefined;

  return store.upsertRepository({
    name: input.name,
    engine: input.engine,
    type: input.type,
    location: input.location,
    passwordSecretId,
    credentialSecretId,
    objectLock: input.objectLock,
    bandwidthLimitKbps: input.bandwidthLimitKbps
  });
}
