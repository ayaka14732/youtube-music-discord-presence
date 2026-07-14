import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  discordClientId: z.string().regex(/^\d{17,20}$/),
});

export interface HostConfig {
  discordClientId: string;
  configPath: string;
}

export function defaultConfigPath(environment: NodeJS.ProcessEnv = process.env): string {
  const configHome = environment.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "youtube-music-discord-presence", "config.json");
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): HostConfig {
  const configPath = environment.YTMDP_CONFIG_PATH || defaultConfigPath(environment);
  const environmentClientId = environment.YTMDP_DISCORD_CLIENT_ID;
  if (environmentClientId) {
    const parsed = ConfigSchema.parse({ discordClientId: environmentClientId });
    return { ...parsed, configPath };
  }

  if (!existsSync(configPath)) {
    throw new Error(`Missing configuration: ${configPath}`);
  }

  const parsed = ConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")) as unknown);
  return { ...parsed, configPath };
}
