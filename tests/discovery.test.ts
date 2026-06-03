import { describe, expect, it } from "vitest";
import {
  classifyDatabaseImage,
  envFromDockerConfig,
  parseDatabaseList,
  parseDockerInspectRecord,
  serviceHint,
  uniquePathCandidates
} from "../server/discovery";

describe("host discovery", () => {
  it("deduplicates path suggestions", () => {
    const candidates = uniquePathCandidates([
      { path: "C:\\Users\\hp\\Documents", label: "Documents", reason: "files" },
      { path: "C:\\Users\\hp\\Documents\\", label: "Documents copy", reason: "duplicate" },
      { path: "C:\\Users\\hp\\Pictures", label: "Pictures", reason: "media" }
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.label)).toEqual(["Documents", "Pictures"]);
  });

  it("explains database services in plain language", () => {
    expect(serviceHint("postgresql-x64-16")).toContain("PostgreSQL");
    expect(serviceHint("MariaDB")).toContain("MySQL/MariaDB");
  });

  it("classifies database container images", () => {
    expect(classifyDatabaseImage("postgres:16")).toBe("postgres");
    expect(classifyDatabaseImage("mariadb:11")).toBe("mariadb");
    expect(classifyDatabaseImage("mysql:8")).toBe("mysql");
    expect(classifyDatabaseImage("nginx:latest")).toBeUndefined();
  });

  it("parses docker inspect records into container suggestions", () => {
    const container = parseDockerInspectRecord({
      Id: "abc123",
      Name: "/nextcloud",
      Config: {
        Image: "nextcloud:latest",
        Labels: {
          "com.docker.compose.project": "nextcloud",
          "com.docker.compose.project.config_files": "/srv/nextcloud/docker-compose.yml"
        }
      },
      Mounts: [
        { Type: "bind", Source: "/srv/nextcloud/data", Destination: "/var/www/html/data" }
      ],
      State: { Status: "running" }
    });

    expect(container?.name).toBe("nextcloud");
    expect(container?.composeFile).toBe("/srv/nextcloud/docker-compose.yml");
    expect(container?.suggestedPaths).toEqual(["/srv/nextcloud/data"]);
  });

  it("reads docker env and database lists", () => {
    expect(envFromDockerConfig(["POSTGRES_USER=app", "POSTGRES_DB=shop"])).toEqual({
      POSTGRES_USER: "app",
      POSTGRES_DB: "shop"
    });
    expect(parseDatabaseList("postgres\nshop\n template1 ")).toEqual(["postgres", "shop"]);
  });
});
