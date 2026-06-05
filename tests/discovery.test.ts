import { describe, expect, it } from "vitest";
import {
  classifyCmsImage,
  classifyDatabaseImage,
  cmsDatabaseFromEnv,
  cmsPathsFromMounts,
  envFromDockerConfig,
  parseDatabaseList,
  parseDockerInspectRecord,
  parseWordPressConfig,
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

  it("recognizes common CMS container images", () => {
    expect(classifyCmsImage("wordpress:php8.2")).toBe("wordpress");
    expect(classifyCmsImage("drupal:10")).toBe("drupal");
    expect(classifyCmsImage("joomla:latest")).toBe("joomla");
    expect(classifyCmsImage("ghost:5")).toBe("ghost");
    expect(classifyCmsImage("nextcloud:apache")).toBe("nextcloud");
    expect(classifyCmsImage("nginx:latest")).toBeUndefined();
  });

  it("maps CMS container mounts to whole-site backup paths", () => {
    const paths = cmsPathsFromMounts("wordpress", [
      { type: "bind", source: "/srv/wordpress", destination: "/var/www/html" }
    ]);

    expect(paths.rootPath).toBe("/srv/wordpress");
    expect(paths.contentPath).toBe("/srv/wordpress/wp-content");
    expect(paths.configPath).toBe("/srv/wordpress/wp-config.php");
    expect(paths.backupPaths).toEqual(["/srv/wordpress"]);
  });

  it("reads safe WordPress database details without returning the password", () => {
    const parsed = parseWordPressConfig(`
      define('DB_NAME', 'shop');
      define('DB_USER', 'shop_user');
      define('DB_PASSWORD', 'secret');
      define('DB_HOST', 'db:3307');
    `);

    expect(parsed).toMatchObject({
      engine: "mysql",
      host: "db",
      port: 3307,
      database: "shop",
      username: "shop_user",
      passwordAvailable: true
    });
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("builds CMS database settings from Docker env", () => {
    expect(cmsDatabaseFromEnv("wordpress", {
      WORDPRESS_DB_HOST: "db:3306",
      WORDPRESS_DB_NAME: "blog",
      WORDPRESS_DB_USER: "wp",
      WORDPRESS_DB_PASSWORD: "hidden"
    })).toMatchObject({
      engine: "mysql",
      host: "db",
      port: 3306,
      database: "blog",
      username: "wp",
      passwordAvailable: true
    });
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
