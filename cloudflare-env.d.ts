declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    AI_CONFIG_ENCRYPTION_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
