import { handleTerraWebhook } from "../_shared/terraWebhookHandler.ts";

Deno.serve((req) => handleTerraWebhook(req, "test"));
