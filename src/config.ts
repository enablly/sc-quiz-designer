export interface AppConfig {
  port: number;
  adminToken: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  hubspotPortalId: string;
  hubspotFormGuid: string;
  hubspotRegion: string;
  geminiApiKey: string;
  geminiModel: string;
  googleCloudProject: string;
  useMemoryStore: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const portRaw = Number(env.PORT || "8080");
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 8080;
  const googleCloudProject = (env.GOOGLE_CLOUD_PROJECT || "").trim();
  const forceMemory = env.USE_MEMORY_STORE === "1" || env.USE_MEMORY_STORE === "true";

  return {
    port,
    adminToken: (env.ADMIN_TOKEN || "").trim(),
    turnstileSiteKey: (env.TURNSTILE_SITE_KEY || "").trim(),
    turnstileSecretKey: (env.TURNSTILE_SECRET_KEY || "").trim(),
    hubspotPortalId: (env.HUBSPOT_PORTAL_ID || "").trim(),
    hubspotFormGuid: (env.HUBSPOT_FORM_GUID || "").trim(),
    hubspotRegion: (env.HUBSPOT_REGION || "us").trim().toLowerCase(),
    geminiApiKey: (env.GEMINI_API_KEY || "").trim(),
    geminiModel: (env.GEMINI_MODEL || "gemini-2.5-flash-lite").trim(),
    googleCloudProject,
    useMemoryStore: forceMemory || (!googleCloudProject && !env.FIRESTORE_EMULATOR_HOST),
  };
}
