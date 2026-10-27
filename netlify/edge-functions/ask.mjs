// Netlify Edge Function für KI-Fragen: streamt die Antwort, ohne an das 10-Sekunden-Limit normaler Functions zu stoßen.
import { handleAsk } from "../../core/ask.mjs";

export default req => handleAsk(req, {
  LAB_CODE: Netlify.env.get("LAB_CODE"), ALLOW_OPEN: Netlify.env.get("ALLOW_OPEN"), SESSION_SECRET: Netlify.env.get("SESSION_SECRET"),
  ANTHROPIC_API_KEY: Netlify.env.get("ANTHROPIC_API_KEY"), ANTHROPIC_MODEL: Netlify.env.get("ANTHROPIC_MODEL"), ANTHROPIC_MAX_TOKENS: Netlify.env.get("ANTHROPIC_MAX_TOKENS"), ANTHROPIC_BASE_URL: Netlify.env.get("ANTHROPIC_BASE_URL")
});

export const config = { path: "/api/ask" };
