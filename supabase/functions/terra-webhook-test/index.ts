// Test-environment Terra webhook. Routes to shared handler with env="test"
// so it uses TERRA_*_TEST credentials & signing secret.
import { handleTerraWebhook } from "../terra-webhook/index.ts";

Deno.serve((req) => handleTerraWebhook(req, "test"));
