import "dotenv/config";
import http from "http";
import express from "express";
import path from "path";
import fs from "fs";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { crmRouter } from "./src/routes/crm.routes.ts";
import { socialRouter } from "./src/routes/social.routes.ts";
import { webhookRouter } from "./src/routes/webhook.routes.ts";
import { SocialSchedulerService } from "./src/social/services/social-scheduler.service.ts";
import { seedCrmDatabase } from "./src/services/seed.service.ts";
import {
  getFullCrmState,
  addCrmMessage,
  updateDealStage,
  createNewLeadRecord,
  updateWorkspaceSettings,
} from "./src/db/crm-service.ts";
import { FacebookSyncService } from "./src/services/facebook-sync.service.ts";
import { automationsEnabled, dataFile, initDataDirs, uploadsDir } from "./src/config/paths.ts";
import { authMiddleware, authRouter } from "./src/auth/app-auth.ts";

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Behind a hosting proxy (HTTPS terminated upstream): needed for secure cookies & client IPs
app.set("trust proxy", 1);

// Create DATA_DIR / UPLOADS_DIR on first boot (copies bundled data into an empty volume)
initDataDirs();

process.on("unhandledRejection", (reason) => {
  console.warn("[Global Warning] Unhandled rejection suppressed:", reason);
});
process.on("uncaughtException", (err) => {
  console.warn("[Global Warning] Uncaught exception suppressed:", err?.message || err);
});

// CORS: only the CRM itself, the Chrome extension and the pages it runs on may call the API.
// Requests without an Origin header (Meta webhooks, server-to-server, curl) are unaffected.
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/,
  /^chrome-extension:\/\/[a-p]{32}$/,
  /^https:\/\/web\.whatsapp\.com$/,
  /^https:\/\/(www|business)\.facebook\.com$/,
  /^https:\/\/www\.messenger\.com$/,
  ...(process.env.CORS_EXTRA_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)),
];
const isAllowedOrigin = (origin: string, host?: string) => {
  try {
    if (host && new URL(origin).host === host) return true; // same-origin (e.g. opened via LAN IP)
  } catch {
    return false;
  }
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin, req.headers.host)) {
      // Reads are already protected by the browser (no CORS header). Writes must be blocked
      // here, because CORS alone does not stop "simple" cross-site POSTs.
      if (req.method === "GET" || req.method === "HEAD") return next();
      return res.status(403).json({ success: false, error: "Origen no permitido" });
    }
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-workspace-id");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(origin ? 204 : 200);
  }
  next();
});

// Capture raw body buffer for Meta Webhook HMAC-SHA256 signature verification & allow local image uploads
app.use(
  express.json({
    limit: "50mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Access control: login (APP_PASSWORD) for the CRM API and photos; Meta webhooks stay public.
app.use("/api/auth", authRouter);
app.use(authMiddleware);

// Mount Social and Webhook API Routers
app.use("/api/social", socialRouter);
app.use("/api", webhookRouter);

// Serve locally saved equipment images
app.use("/equipos", express.static(uploadsDir()));

// Local equipment photo upload endpoint
app.post("/api/upload/equipment", (req, res) => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      return res.status(400).json({ success: false, error: "Falta filename o base64Data" });
    }
    const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const targetDir = uploadsDir();
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    fs.writeFileSync(path.join(targetDir, safeName), buffer);

    const publicUrl = `/equipos/${safeName}`;
    res.json({ success: true, url: publicUrl, filename: safeName });
  } catch (err: any) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Local products persistence
app.get("/api/crm/products", (req, res) => {
  try {
    const prodPath = dataFile("local-products.json");
    if (fs.existsSync(prodPath)) {
      const data = JSON.parse(fs.readFileSync(prodPath, "utf-8"));
      return res.json({ success: true, data });
    }
    res.json({ success: true, data: [] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/crm/products", (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: "products debe ser una lista" });
    }
    const prodPath = dataFile("local-products.json");
    fs.writeFileSync(prodPath, JSON.stringify(products, null, 2), "utf-8");
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==========================================
// AUTOMATION SUITE (TEMPLATES, DRIPS, CHATBOT, BROADCAST)
// ==========================================
app.get("/api/automations/data", async (_req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const data = AutomationService.getData();
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/automations/templates", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const saved = AutomationService.saveTemplate(req.body);
    res.json({ success: true, data: saved });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete("/api/automations/templates/:id", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const deleted = AutomationService.deleteTemplate(req.params.id);
    res.json({ success: deleted });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/automations/templates/preview", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const { content, vars } = req.body;
    const preview = AutomationService.interpolateTemplate(content || "", vars || {});
    res.json({ success: true, data: preview });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/automations/drips/enroll", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const { leadId, dripId } = req.body || {};
    const result = AutomationService.enrollLeadInDrip(leadId, dripId);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post("/api/automations/drips/run-now", async (_req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const result = await AutomationService.processDueDrips();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/automations/chatbot", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const updated = AutomationService.updateChatbot(req.body);
    res.json({ success: true, data: updated });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Broadcast to Messenger leads that are inside Meta's 24h window (sent in background)
app.post("/api/automations/broadcast/start", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const created = AutomationService.startBroadcast(req.body || {});
    res.json({
      success: true,
      data: created,
      count: created.eligibleCount,
      skippedOutsideWindow: created.skippedOutsideWindow,
    });
  } catch (e: any) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

app.get("/api/automations/broadcast/:id", async (req, res) => {
  try {
    const { AutomationService } = await import("./src/services/automation.service.ts");
    const broadcast = AutomationService.getBroadcast(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, error: "Difusión no encontrada" });
    res.json({ success: true, data: broadcast });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mount the modular CRM, Social, and Webhook REST API Routers
app.use("/api", crmRouter);
app.use("/api/social", socialRouter);
app.use("/api/webhooks", webhookRouter);

// CRM Database REST Endpoints
app.get("/api/crm/state", async (req, res) => {
  try {
    const data = await getFullCrmState();
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Failed to load CRM state:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to load CRM data" });
  }
});

// Endpoint to trigger instant Meta Messenger synchronization
app.post("/api/crm/messenger/sync", async (_req, res) => {
  try {
    const { FacebookSyncService } = await import("./src/services/facebook-sync.service.ts");
    const result = await FacebookSyncService.syncAllConversations();
    const leads = FacebookSyncService.loadSavedLeads();
    res.json({ success: true, count: result.count, totalMessages: result.totalMessages, leads });
  } catch (err: any) {
    console.error("Failed to sync Messenger conversations:", err);
    res.status(500).json({ success: false, error: err.message || "Error al sincronizar chats" });
  }
});

// Endpoint to get all synced Messenger leads directly
app.get("/api/crm/messenger/leads", async (_req, res) => {
  try {
    const { FacebookSyncService } = await import("./src/services/facebook-sync.service.ts");
    let leads = FacebookSyncService.loadSavedLeads();
    if (leads.length === 0) {
      await FacebookSyncService.syncAllConversations();
      leads = FacebookSyncService.loadSavedLeads();
    }
    res.json({ success: true, count: leads.length, data: leads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto-Responder for Facebook Messenger endpoints
app.get("/api/crm/auto-responder/status", async (_req, res) => {
  try {
    const { FacebookAutoResponderService } = await import("./src/services/facebook-auto-responder.service.ts");
    res.json({ success: true, data: FacebookAutoResponderService.getConfig() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/crm/auto-responder/toggle", async (req, res) => {
  try {
    const { FacebookAutoResponderService } = await import("./src/services/facebook-auto-responder.service.ts");
    const current = FacebookAutoResponderService.getConfig();
    const updated = FacebookAutoResponderService.updateConfig({
      enabled: req.body.enabled !== undefined ? !!req.body.enabled : !current.enabled,
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Human takeover: silence (or re-enable) the bot for one conversation
app.post("/api/crm/auto-responder/pause", async (req, res) => {
  try {
    const { leadId, paused, reason } = req.body || {};
    if (!leadId) return res.status(400).json({ success: false, error: "leadId es obligatorio" });
    const { FacebookAutoResponderService } = await import("./src/services/facebook-auto-responder.service.ts");
    if (paused === false) FacebookAutoResponderService.resumeLead(leadId);
    else FacebookAutoResponderService.pauseLead(leadId, reason || "Pausado manualmente");
    res.json({ success: true, paused: FacebookAutoResponderService.isLeadPaused(leadId) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/crm/auto-responder/run-now", async (_req, res) => {
  try {
    const { FacebookAutoResponderService } = await import("./src/services/facebook-auto-responder.service.ts");
    const result = await FacebookAutoResponderService.processUnrepliedConversations();
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/crm/messages", async (req, res) => {
  try {
    const { leadId, message } = req.body;
    if (!leadId || !message) {
      return res.status(400).json({ success: false, error: "Missing leadId or message payload" });
    }
    const saved: any = await addCrmMessage(leadId, message);
    if (message.sender === "agent") {
      // A human advisor answered: hand the conversation over and keep the bot quiet.
      const { FacebookAutoResponderService } = await import("./src/services/facebook-auto-responder.service.ts");
      FacebookAutoResponderService.pauseLead(leadId, "Respuesta manual del asesor");
    }
    if (saved?.deliveryStatus === 'failed') {
      return res.json({
        success: false,
        warning: saved.deliveryError,
        data: saved,
      });
    }
    res.json({ success: true, data: saved });
  } catch (error: any) {
    console.error("Failed to save CRM message:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to save message" });
  }
});

app.patch("/api/crm/deals/stage", async (req, res) => {
  try {
    const { leadId, newStage } = req.body;
    if (!leadId || !newStage) {
      return res.status(400).json({ success: false, error: "Missing leadId or newStage" });
    }
    const result = await updateDealStage(leadId, newStage);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Failed to update deal stage:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to update deal stage" });
  }
});

app.post("/api/crm/leads", async (req, res) => {
  try {
    const result = await createNewLeadRecord(req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Failed to create new lead:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to create lead" });
  }
});

// API: Auto Follow-Up (Seguimiento Automático - Module 10)
app.get("/api/crm/auto-followup", async (req, res) => {
  try {
    const crmState = await getFullCrmState();
    const leads = crmState.leads || [];
    
    // Filter leads that are in "quote_sent" or "closing" and might need follow-up
    const followUpLeads = leads.filter((l: any) => 
      l.stage === 'quote_sent' || l.stage === 'tibio' || l.stage === 'closing'
    );

    // Map to the campaign payload structure
    const numbers = followUpLeads
      .map((l: any) => l.handleOrPhone)
      .filter((phone: string) => phone && phone.length > 8);

    res.json({
      success: true,
      data: {
        count: numbers.length,
        numbers: numbers,
        recommendedMessage: "¡Hola! Seguimos teniendo disponibilidad 😊 ¿Deseas que te ayude a concretar tu pedido?"
      }
    });
  } catch (error: any) {
    console.error("Failed to fetch auto follow-up leads:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to fetch follow-up leads" });
  }
});

app.put("/api/crm/workspace", async (req, res) => {
  try {
    const updated = await updateWorkspaceSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Failed to update workspace:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to update workspace" });
  }
});

// Initialize Groq Client (Ultra-fast Llama 3.3 70B)
let groqClient: OpenAI | null = null;
function getGroqClient(): OpenAI | null {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqClient && groqKey && groqKey.startsWith("gsk_")) {
    groqClient = new OpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }
  return groqClient;
}

// Initialize OpenAI / ChatGPT Client safely
let openaiClient: OpenAI | null = null;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && OPENAI_KEY && OPENAI_KEY.startsWith("sk-") && !OPENAI_KEY.includes("sk-1234a")) {
    openaiClient = new OpenAI({
      apiKey: OPENAI_KEY,
    });
  }
  return openaiClient;
}

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!ai && geminiKey && geminiKey.startsWith("AIzaSy")) {
    ai = new GoogleGenAI({
      apiKey: geminiKey,
    });
  }
  return ai;
}

// Safe JSON parser to strip markdown wrappers if present
function safeParseJson<T = any>(rawText: string, fallback: T): T {
  try {
    if (!rawText) return fallback;
    const cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("JSON parse error, using fallback:", e);
    return fallback;
  }
}

// Robust Multi-AI generator: First attempts Groq (Llama 3.3 70B), then Gemini, then OpenAI, then contextual fallback
async function generateAIText(prompt: string, isJson: boolean = false): Promise<string> {
  // 1. Try Groq (Ultra fast high-intelligence free models)
  const groq = getGroqClient();
  if (groq) {
    const groqModels = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
    for (const model of groqModels) {
      try {
        const response = await groq.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content: "Eres el Asesor Comercial y Estratega de Cierres de Ventas de APM Inox (equipos gastronómicos e industriales en acero inoxidable en Quito, Ecuador). Sitio web oficial y catálogo: https://amecocinas.com/. Taller en Cotocollao, Quito (frente al Club de Leones). REGLA OBLIGATORIA EN TODAS LAS RESPUESTAS: En el 100% de los chats y respuestas, SIEMPRE debes invitar al cliente a visitar nuestra página web oficial https://amecocinas.com/ para ver fotos y el catálogo completo. Especializado en venta consultiva (Metodología SPIN y Neuroventas): NUNCA des el precio seco sin primero averiguar la necesidad del cliente (tipo de negocio, uso), anclar el valor del acero inoxidable de grado alimenticio y la garantía de fábrica, y cerrar buscando una visita al taller en Cotocollao o pidiendo su WhatsApp para fotos. REGLA ESTRICTA DE PRECIO: Si no sabes el precio exacto de un modelo o medida especial, indica al cliente que se comunique al WhatsApp o llamada al 09920350548 para darle la cotización de fábrica de inmediato. You must return JSON if requested.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.65,
          response_format: isJson ? { type: "json_object" } : undefined,
        });

        const text = response.choices[0]?.message?.content;
        if (text) {
          return text;
        }
      } catch (groqErr: any) {
        console.warn(`[AI Provider] Groq model ${model} error, trying next:`, groqErr?.message || groqErr);
      }
    }
  }

  // 2. Try Gemini if configured with a real key
  const gemini = getGeminiClient();
  if (gemini) {
    const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash"];
    for (const model of modelsToTry) {
      try {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: isJson ? { responseMimeType: "application/json" } : undefined,
        });

        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        console.warn(`Gemini generation with model ${model} failed:`, err?.message || err);
      }
    }
  }

  // 3. Try OpenAI if a real valid API key is present
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Eres el Asesor Comercial y Estratega de Cierres de Ventas de APM Inox (equipos gastronómicos e industriales en acero inoxidable en Quito, Ecuador). Especializado en venta consultiva (Metodología SPIN y Neuroventas): NUNCA des el precio seco sin primero averiguar la necesidad del cliente (tipo de negocio, uso), anclar el valor del acero inoxidable de grado alimenticio y la garantía de fábrica, y cerrar buscando una visita al taller en Cotocollao o pidiendo su WhatsApp para fotos. You must return JSON if requested.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.65,
        response_format: isJson ? { type: "json_object" } : undefined,
      });

      const text = response.choices[0]?.message?.content;
      if (text) {
        return text;
      }
    } catch (openAiErr: any) {
      console.warn("OpenAI API call failed:", openAiErr?.message || openAiErr);
    }
  }

  throw new Error("All AI providers temporarily unavailable");
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    appName: "MetaCloser CRM",
    aiEngine: "GPT-4o-mini & Gemini 2.5 Flash",
    openaiConfigured: !!(OPENAI_KEY && OPENAI_KEY.startsWith("sk-") && !OPENAI_KEY.includes("sk-1234a")),
    geminiConfigured: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
  });
});

// Dynamic time-aware greeting for distinguished, polite customer service (Ecuador timezone)
function getFormalTimeGreeting(): { timeGreeting: string; period: "días" | "tardes" | "noches" } {
  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" }));
    const h = now.getHours();
    if (h >= 5 && h < 12) return { timeGreeting: "Buenos días", period: "días" };
    if (h >= 12 && h < 19) return { timeGreeting: "Buenas tardes", period: "tardes" };
    return { timeGreeting: "Buenas noches", period: "noches" };
  } catch {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return { timeGreeting: "Buenos días", period: "días" };
    if (h >= 12 && h < 19) return { timeGreeting: "Buenas tardes", period: "tardes" };
    return { timeGreeting: "Buenas noches", period: "noches" };
  }
}

function buildRefinedGreeting(name?: string): string {
  const { timeGreeting } = getFormalTimeGreeting();
  const raw = (name || "").trim();
  const isGeneric = !raw || /^(cliente(\s*\d+)?|prospecto(\s*\d+)?|lead(\s*\d+)?|usuario|amigo\/a)$/i.test(raw);
  const cleanName = isGeneric ? "" : raw.split(/\s+/)[0];

  if (cleanName) {
    return `${timeGreeting}, estimado/a ${cleanName}. Mucho gusto en saludarle.`;
  }
  return `${timeGreeting}, estimado/a. Mucho gusto en saludarle.`;
}

// Helper for dynamic contextual sales response for APM Inox (Consultative Closer - Distinguished Gente Fina)
function generateContextualSalesFallback(
  leadName: string = "",
  channel: string = "Messenger",
  businessProfile: any,
  product: any,
  conversationHistory: any[] = [],
  specificTechnique?: string
) {
  const lastCustomerMsg = [...conversationHistory]
    .reverse()
    .find((m) => m.sender === "customer")?.content || "";
  const lastCustomerLower = lastCustomerMsg.toLowerCase();

  const rawLead = (leadName || "").trim();
  const isGeneric = !rawLead || /^(cliente(\s*\d+)?|prospecto(\s*\d+)?|lead(\s*\d+)?|usuario|amigo\/a)$/i.test(rawLead);
  const cleanFirstName = isGeneric ? "" : rawLead.split(/\s+/)[0];
  const greeting = buildRefinedGreeting(cleanFirstName);

  const prodName = (product?.name || "").trim();
  const prodLower = prodName.toLowerCase();

  let intentScore = 85;
  let buyerTemperature: "hot" | "warm" | "cold" = "hot";
  let detectedObjections: string[] = [];
  let psychologicalTrigger = "Garantía de fábrica directa y durabilidad del acero inoxidable grado alimenticio";
  let recommendedTechnique = specificTechnique || "Venta Consultiva SPIN con Doble Alternativa de Cierre";

  let primaryResponse = "";
  let alternativeConsultative = "";
  let alternativeUrgency = "";
  let voiceNoteScript = "";
  let suggestedSellerReplies: string[] = [
    "¿Para qué tipo de negocio o preparación requiere el equipo?",
    "¿Desea visitarnos en Cotocollao (frente al Club de Leones) para apreciarlo en persona?",
    "Para una cotización exacta o medidas especiales, con gusto le atendemos al 09920350548.",
    "¿La busca de 2 quemadores ($195–$200) o de 3 quemadores ($295)?",
    "¿A qué ciudad o sector requiere el envío?",
  ];

  // 1. Ubicación / Dónde están
  if (lastCustomerLower.includes("donde") || lastCustomerLower.includes("ubicad") || lastCustomerLower.includes("sector") || lastCustomerLower.includes("quito") || lastCustomerLower.includes("direccion")) {
    detectedObjections.push("Validación de legitimidad física y ubicación del taller");
    psychologicalTrigger = "Local físico real en Quito Norte para inspeccionar calidad antes de pagar";
    intentScore = 90;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} De parte de APM Inox, con todo respeto y agrado le informamos que nuestro taller y sala de exhibición se encuentra ubicado en *Quito Norte, sector Cotocollao, justo frente al Club de Leones* 📍.\n\nLe atendemos cordialmente de lunes a sábado para que pueda apreciar personalmente la calidad de nuestros acabados en acero inoxidable quirúrgico. ¿Qué equipo puntual está requiriendo para su respetable negocio? Quedo a su entera y grata disposición, hasta luego.`;
    alternativeConsultative = `${greeting} Con todo agrado le esperamos en nuestro taller en Cotocollao, frente al Club de Leones en Quito Norte. ¿Le gustaría visitarnos el día de hoy para brindarle una atención personalizada?`;
    alternativeUrgency = `${greeting} Nos encontramos en Cotocollao frente al Club de Leones en Quito Norte. Disponemos de unidades listas para entrega inmediata. ¿En qué horario le resultaría más cómodo pasar?`;
    voiceNoteScript = `${greeting} Un muy cordial saludo de APM Inox. Le esperamos en Cotocollao, Quito Norte, justo frente al Club de Leones. Con todo gusto le recibimos para que aprecie la calidad de nuestro acero inoxidable.`;
  }
  // 2. Materiales / Calidad
  else if (lastCustomerLower.includes("material") || lastCustomerLower.includes("acero") || lastCustomerLower.includes("calidad") || lastCustomerLower.includes("chapa") || lastCustomerLower.includes("garantia")) {
    detectedObjections.push("Duda sobre durabilidad, oxidación y tipo de material");
    psychologicalTrigger = "Acero inoxidable de grado alimenticio 100% que no se pica ni oxida con el tiempo";
    intentScore = 92;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con total solvencia y cuidado le confirmo que fabricamos *100% en acero inoxidable de grado alimenticio quirúrgico T-304*, un material noble de alta resistencia a la corrosión, calor y grasas 🛡️.\n\nAsimismo, cada uno de nuestros equipos cuenta con *garantía formal y directa de fábrica*. ¿Para qué tipo de preparación o negocio requiere su equipo? Quedo muy atento a su gentil respuesta.`;
    alternativeConsultative = `${greeting} La distinción de nuestro acero inoxidable radica en que cumple rigurosas normas sanitarias para alimentos y asegura largos años de trabajo continuo. ¿Desea que le comparta la ficha técnica al detalle?`;
    alternativeUrgency = `${greeting} Como fabricantes directos, le garantizamos acero inoxidable genuino y acabados sanitarios de primer nivel. ¿Le agradaría coordinar una visita a nuestro taller en Cotocollao?`;
    voiceNoteScript = `${greeting} Le comento con total seguridad que fabricamos exclusivamente en acero inoxidable de grado alimenticio. Son equipos de alta durabilidad. Quedo a su entera disposición.`;
  }
  // 3. Envíos / Provincias
  else if (lastCustomerLower.includes("envio") || lastCustomerLower.includes("entrega") || lastCustomerLower.includes("domicilio") || lastCustomerLower.includes("provincia") || lastCustomerLower.includes("guayaquil") || lastCustomerLower.includes("cuenca") || lastCustomerLower.includes("ambato")) {
    detectedObjections.push("Logística, seguridad del despacho y costo de transporte");
    psychologicalTrigger = "Envíos 100% seguros y respaldados a cualquier provincia de Ecuador";
    intentScore = 94;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con mucho gusto le confirmamos que realizamos entregas cuidadosas en todo Quito y *envíos 100% seguros y garantizados a todas las provincias del país* mediante transporte de carga de nuestra entera confianza 🚚.\n\nEl equipo viaja debidamente embalado y protegido. ¿A qué digna ciudad o cantón requiere que le coticemos el despacho? También puede comunicarse a nuestro número directo *09920350548*. Hasta luego, quedo atento.`;
    alternativeConsultative = `${greeting} Despachamos a nivel nacional con la mayor seriedad y cuidado. ¿En qué ciudad se encuentra usted para coordinar los detalles de entrega?`;
    alternativeUrgency = `${greeting} El día de hoy disponemos de despachos programados interprovinciales. Con el mayor de los gustos podemos incluir su equipo. Puede escribirnos al 09920350548.`;
    voiceNoteScript = `${greeting} Le confirmo que realizamos envíos debidamente asegurados a todo el territorio nacional. ¿En qué ciudad se encuentra para cotizarle con exactitud? Quedo a su disposición.`;
  }
  // 4. Góndolas especiales y estanterías
  else if (
    prodLower.includes("gondola") ||
    prodLower.includes("góndola") ||
    prodLower.includes("estanter") ||
    lastCustomerLower.includes("gondola") ||
    lastCustomerLower.includes("góndola") ||
    lastCustomerLower.includes("estanter")
  ) {
    detectedObjections.push("Capacidad de carga y medidas para minimarkets / bodegas");
    psychologicalTrigger = "Góndolas reforzadas en acero inoxidable quirúrgico para exhibición profesional de alto peso";
    intentScore = 93;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con el mayor agrado le confirmamos que disponemos de *Góndolas especiales en acero inoxidable* para entrega inmediata en taller o despacho seguro.\n\nSon elaboradas en *acero inoxidable quirúrgico de alta resistencia*, con bandejas reforzadas con omegas para soportar gran peso y acabados sanitarios impecables, ideales para minimarkets, bodegas o exhibición distinguida 🛡️.\n\nAl ser fabricantes directos, le cotizamos con el mejor valor de taller según las dimensiones que requiera su espacio. Con mucho gusto puede comunicarse al *09920350548* o indicarnos su número. ¿En qué medidas las busca? Quedo a sus muy gratas órdenes, hasta luego.`;
    alternativeConsultative = `${greeting} Nuestras góndolas en acero inoxidable brindan elegancia, solidez y pulcritud para la exhibición de su mercadería. ¿Para qué tipo de establecimiento las está buscando?`;
    alternativeUrgency = `${greeting} Contamos con módulos de góndolas listos para entrega inmediata el día de hoy en nuestro taller de Cotocollao. Con gusto le atendemos al 09920350548.`;
    voiceNoteScript = `${greeting} Le comento que las góndolas en acero inoxidable las tenemos disponibles para entrega inmediata con alta capacidad de carga. Quedo muy atento para asesorarle con las medidas.`;
  }
  // 5. Cocinas industriales de 2 o 3 quemadores
  else if (
    prodLower.includes("cocina") ||
    prodLower.includes("quemad") ||
    lastCustomerLower.includes("2 quemad") ||
    lastCustomerLower.includes("dos quemad") ||
    lastCustomerLower.includes("3 quemad") ||
    lastCustomerLower.includes("tres quemad") ||
    lastCustomerLower.includes("cocina")
  ) {
    detectedObjections.push("Comparación de modelos y evaluación de presupuesto");
    psychologicalTrigger = "Fabricante directo sin intermediarios: mejor relación calidad-precio";
    intentScore = 88;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con sumo gusto y consideración le confirmamos disponibilidad. Nuestras cocinas industriales son fabricadas en *acero inoxidable reforzado con quemadores macizos de hierro fundido de alta potencia*:\n\n🔥 *Cocina de 2 quemadores:* $195 - $200\n🔥 *Cocina de 3 quemadores:* $295\n\nAmbas opciones cuentan con garantía formal directa de fábrica. Para orientarle con la mayor precisión: ¿es para restaurante, negocio de comida o proyecto particular? Puede apreciarlas en nuestro taller de Cotocollao (frente al Club de Leones) o con gusto le compartimos video demostrativo al *09920350548*. Hasta luego, que tenga un excelente día.`;
    alternativeConsultative = `${greeting} Disponemos de la cocina de 2 quemadores en $200 y la de 3 en $295, elaboradas en acero inoxidable pesado para trabajo continuo. ¿Qué dimensiones de recipientes o menaje acostumbra a utilizar?`;
    alternativeUrgency = `${greeting} Contamos con unidades disponibles para entrega inmediata de 2 y 3 quemadores con precio directo de taller. Si confirma hoy le incluimos la entrega en Quito. ¿A qué dirección le gustaría recibirla?`;
    voiceNoteScript = `${greeting} Con mucho agrado le comento que disponemos de cocinas industriales de 2 y 3 quemadores en acero inoxidable con quemadores de hierro fundido y garantía de fábrica. Quedo muy atento a su gentil respuesta.`;
  }
  // 6. Asadores en acero inoxidable con tapa
  else if (
    prodLower.includes("asador") ||
    prodLower.includes("parrilla") ||
    lastCustomerLower.includes("asador") ||
    lastCustomerLower.includes("parrilla") ||
    lastCustomerLower.includes("horno") ||
    lastCustomerLower.includes("tapa")
  ) {
    detectedObjections.push("Interés en equipos específicos de cocción y asados");
    psychologicalTrigger = "Acabado en acero inoxidable con tapa abatible para cocción uniforme y fácil limpieza";
    intentScore = 90;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con el mayor agrado le confirmamos que disponemos de *Asadores en acero inoxidable con tapa abatible* para entrega inmediata ($150 - $160).\n\nSu tapa abatible tipo ahumador conserva los jugos y mantiene la temperatura de manera uniforme, además de ser sumamente higiénicos y no oxidarse con los años 🔥.\n\n¿Lo busca para su distinguido negocio comercial o para uso en quinta y hogar? Con todo agrado le compartimos detalles o le recibimos en nuestro taller en Cotocollao (frente al Club de Leones). Quedo a su disposición, hasta luego.`;
    alternativeConsultative = `${greeting} Nuestros asadores en acero inoxidable destacan por su durabilidad y fácil mantenimiento. ¿Qué dimensiones de parrilla tiene en consideración?`;
    alternativeUrgency = `${greeting} Disponemos de unidades listas con precio directo de taller a $150. ¿Le gustaría que le reservemos una para que la aprecie hoy en Cotocollao?`;
    voiceNoteScript = `${greeting} Los asadores con tapa en acero inoxidable son de excelente calidad y conservan el calor a la perfección. Con gusto le asesoramos al 09920350548.`;
  }
  // 7. Lavabos de 1 y 2 pozos, pozos a medida
  else if (
    prodLower.includes("lavabo") ||
    prodLower.includes("pozo") ||
    prodLower.includes("fregader") ||
    lastCustomerLower.includes("lavabo") ||
    lastCustomerLower.includes("pozo") ||
    lastCustomerLower.includes("poceta") ||
    lastCustomerLower.includes("fregader")
  ) {
    detectedObjections.push("Medidas y disponibilidad de pozos sanitarios");
    psychologicalTrigger = "Acero inoxidable sanitario grado alimenticio con entrega inmediata";
    intentScore = 91;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con todo gusto le confirmo que disponemos de *lavabos en acero inoxidable de 1 y 2 pozos, y pozos a medida* para entrega inmediata (individuales o en conjunto para equipar su establecimiento).\n\nSon confeccionados en acero inoxidable sanitario T-304 con pozos profundos anti-salpicaduras y acabados de fácil asepsia 🛡️.\n\nPara remitirle fotografías de los modelos y cotización precisa según las medidas de su espacio, le invitamos cordialmente a comunicarse a nuestro WhatsApp o llamada al *09920350548*. ¿En qué dimensiones lo requiere? Quedo muy atento a su grata respuesta, hasta luego.`;
    alternativeConsultative = `${greeting} Los lavabos de 1 y 2 pozos son en acero inoxidable quirúrgico sanitario, listos para entrega inmediata. ¿Para qué tipo de espacio o negocio lo requiere?`;
    alternativeUrgency = `${greeting} Disponemos de lavabos listos para retiro inmediato en Cotocollao o despacho hoy mismo. Con gusto le atendemos al 09920350548.`;
    voiceNoteScript = `${greeting} Le confirmo que disponemos de lavabos y pozos en acero inoxidable para entrega inmediata. Con todo agrado le cotizamos al 09920350548.`;
  }
  // 8. Mesas de trabajo
  else if (
    prodLower.includes("mesa") ||
    prodLower.includes("mesón") ||
    prodLower.includes("meson") ||
    lastCustomerLower.includes("mesa") ||
    lastCustomerLower.includes("mesón") ||
    lastCustomerLower.includes("meson") ||
    lastCustomerLower.includes("recipiente")
  ) {
    detectedObjections.push("Dimensiones y resistencia para trabajo rudo");
    psychologicalTrigger = "Superficie sanitaria en acero inoxidable resistente a cortes con entrega inmediata";
    intentScore = 90;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con sumo agrado le informamos que disponemos de *mesas de trabajo en acero inoxidable de 1.50 m ($150), de 2.00 m y mesas con poza/lavaplatos incorporado* para entrega inmediata.\n\nCuentan con tableros reforzados con omegas inferiores y regatones regulables para asegurar trabajo continuo y máxima higiene sanitaria.\n\nPara compartirle fotografías de taller y especificaciones, le invito cordialmente a comunicarse a nuestro WhatsApp o llamada al *09920350548*. ¿Qué medida se ajusta mejor a su espacio? Quedo a su disposición, hasta luego.`;
    alternativeConsultative = `${greeting} Disponemos de mesas lisas de 150 cm, 200 cm y con poza integrada para entrega inmediata. ¿A qué ciudad requiere la entrega para coordinar con el mayor cuidado?`;
    alternativeUrgency = `${greeting} Contamos con mesas de 150 y 200 cm listas para entrega hoy en nuestro taller de Cotocollao. Con gusto coordinamos al 09920350548.`;
    voiceNoteScript = `${greeting} En mesas de acero inoxidable disponemos de 1.50m, 2.00m y con recipiente para entrega inmediata. Con todo agrado le brindamos precios de taller al 09920350548.`;
  }
  // 9. Freidoras industriales
  else if (
    prodLower.includes("freidor") ||
    lastCustomerLower.includes("freidor") ||
    lastCustomerLower.includes("canastill")
  ) {
    detectedObjections.push("Rendimiento térmico y capacidad de aceite");
    psychologicalTrigger = "Freidora pesada de alta recuperación térmica para frituras crujientes sin pérdida de temperatura";
    intentScore = 92;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} Con el mayor placer le confirmo que disponemos de *freidoras industriales en acero inoxidable* (modelo de 2 canastas / 20 litros a $450 y equipos de 4 pozos con 8 canastillas) disponibles para entrega inmediata.\n\nPoseen tinas de acero inoxidable de gran robustez, quemadores de rápida recuperación térmica y canastillas niqueladas reforzadas.\n\nPara facilitarle ficha técnica y detalles, con todo respeto le invito a comunicarse a nuestro WhatsApp o llamada al *09920350548*. ¿Para qué tipo de frituras la requiere? Quedo muy atento a su gentil respuesta, hasta luego.`;
    alternativeConsultative = `${greeting} Nuestras freidoras industriales optimizan el consumo de gas y mantienen el aceite a temperatura ideal para un despacho continuo. ¿Qué volumen de alimentos prepara habitualmente?`;
    alternativeUrgency = `${greeting} Disponemos de freidoras para entrega inmediata el día de hoy en Cotocollao. Con agrado le apartamos su unidad al 09920350548.`;
    voiceNoteScript = `${greeting} Le confirmo que contamos con freidoras industriales en acero inoxidable listas para entrega inmediata con garantía directa. Quedo a su grata disposición.`;
  }
  // 10. Producto específico identificado por el anuncio
  else if (prodName && prodName.length >= 3) {
    detectedObjections.push("Detalles de especificaciones y disponibilidad del producto publicado");
    psychologicalTrigger = "Fabricante directo de taller en Quito Norte con acero inoxidable T-304 de alta durabilidad";
    intentScore = 91;
    buyerTemperature = "hot";

    primaryResponse = `${greeting} De parte de APM Inox, con todo agrado y consideración le confirmo que el equipo *${prodName}* lo tenemos disponible para entrega inmediata.\n\nLo fabricamos *100% en acero inoxidable quirúrgico de grado alimenticio T-304* en nuestro taller de Quito Norte (Cotocollao, frente al Club de Leones), garantizando acabados sanitarios impecables y respaldo formal de fábrica 🛡️.\n\nPara brindarle la cotización exacta de taller y enviarle fotografías al detalle acordes a su requerimiento, con el mayor de los gustos puede comunicarse al *09920350548* o compartirnos su número telefónico. ¿Para qué ciudad o sector requiere el equipo? Quedo a su entera y grata disposición, hasta luego.`;
    alternativeConsultative = `${greeting} Con todo gusto le asesoramos respecto a *${prodName}*. Como fabricantes directos, le garantizamos la más alta distinción en acero inoxidable. ¿Para qué tipo de proyecto lo requiere?`;
    alternativeUrgency = `${greeting} Contamos con unidades de *${prodName}* listas para entrega inmediata hoy mismo en nuestro taller frente al Club de Leones. Con agrado le esperamos o atendemos al 09920350548.`;
    voiceNoteScript = `${greeting} Le confirmo que disponemos de *${prodName}* para entrega inmediata en acero inoxidable garantizado. Con gusto le asesoramos al 09920350548.`;
  }
  // 11. Consulta de precio genérica
  else if (lastCustomerLower.includes("precio") || lastCustomerLower.includes("cuanto") || lastCustomerLower.includes("valor") || lastCustomerLower.includes("cuesta") || lastCustomerLower.includes("vale")) {
    detectedObjections.push("Preocupación por el costo antes de conocer la calidad");
    psychologicalTrigger = "Anclaje de valor: calidad de acero inoxidable de por vida vs equipos baratos descartables";
    intentScore = 85;
    buyerTemperature = "warm";

    primaryResponse = `${greeting} Con mucho gusto y respeto le facilito los valores directos de fábrica. Para orientarle con la opción que con mayor precisión se ajuste a su proyecto: ¿busca cocina de 2 o 3 quemadores, asador, góndolas, mesas de trabajo u otro equipo? 🍳\n\nTodos nuestros equipos son *elaborados en acero inoxidable de grado alimenticio* con garantía formal de 1 año. Permítame conocer su requerimiento para compartirle opciones con medidas y fotografías. También puede comunicarse con nuestro taller al *09920350548*. Hasta luego, quedo muy atento a su amable respuesta.`;
    alternativeConsultative = `${greeting} Al ser fabricantes directos en Quito Norte, le ofrecemos los mejores valores en acero inoxidable sin intermediarios. ¿Para qué tipo de negocio o local está equipando su espacio?`;
    alternativeUrgency = `${greeting} Contamos con promociones especiales de taller esta semana con precios directos desde $150 en asadores y $195 en cocinas industriales. ¿Qué equipo puntual necesita cotizar?`;
    voiceNoteScript = `${greeting} Con todo gusto le asisto con los precios de fábrica. Para orientarle con total precisión en medidas y potencia, ¿qué equipo busca para su negocio? Quedo a sus órdenes.`;
  }
  // 12. General / Saludo
  else {
    primaryResponse = `${greeting} Un muy distinguido y cordial saludo desde *APM Inox* en Quito Norte. Fabricamos equipos gastronómicos y comerciales 100% en acero inoxidable quirúrgico garantizado (góndolas, cocinas de 2 y 3 quemadores, asadores con tapa, mesas de trabajo y estanterías) 🛡️.\n\n¿En qué equipo para su apreciable proyecto o local le podemos brindar asesoría el día de hoy? Con el mayor agrado puede escribirnos o llamarnos al *09920350548* para una atención directa de fábrica. Quedo a su grata disposición, hasta luego.`;
    alternativeConsultative = `${greeting} Es un placer saludarle. ¿Se encuentra iniciando un proyecto gastronómico o requiere renovar algún equipo en su establecimiento? Puede comunicarse con nosotros al 09920350548.`;
    alternativeUrgency = `${greeting} Le extendemos una cordial invitación a visitarnos en nuestro taller en Cotocollao (frente al Club de Leones) o comunicarse al 09920350548 para remitirle nuestro catálogo con valores de taller.`;
    voiceNoteScript = `${greeting} En APM Inox somos fabricantes directos de equipos de acero inoxidable en Quito. Con todo respeto y agrado quedo a sus órdenes en el 09920350548 para atenderle.`;
  }

  const alreadyMentionedWebsite =
    Array.isArray(conversationHistory) &&
    conversationHistory.some((m: any) => {
      const text = (typeof m === "string" ? m : m?.content || "").toLowerCase();
      return text.includes("amecocinas.com") || text.includes("página web") || text.includes("pagina web");
    });

  if (!alreadyMentionedWebsite && primaryResponse && !primaryResponse.includes("amecocinas.com")) {
    primaryResponse += `\n\nCon todo agrado, le invito cordialmente a apreciar nuestro catálogo en línea: https://amecocinas.com/`;
  }

  return {
    intentScore,
    buyerTemperature,
    detectedObjections,
    psychologicalTrigger,
    recommendedTechnique,
    primaryResponse,
    alternativeConsultative,
    alternativeUrgency,
    voiceNoteScript,
    suggestedSellerReplies,
  };
}

// API: Live Chat Copilot and Auto-Advisor for APM Inox
app.post("/api/ai/live-chat", async (req, res) => {
  const {
    lead,
    businessProfile,
    products,
    product,
    conversationHistory,
    userMessage,
    mode, // "advisor_reply" | "customer_reply" | "copilot_reply"
  } = req.body;

  const rawLeadName = (lead?.name || "").trim();
  const isGenericLead = !rawLeadName || /^(cliente(\s*\d+)?|prospecto(\s*\d+)?|lead(\s*\d+)?|usuario|amigo\/a)$/i.test(rawLeadName);
  const cleanLeadName = isGenericLead ? "" : rawLeadName;
  const firstName = cleanLeadName ? cleanLeadName.split(/\s+/)[0] : "";
  const channel = lead?.channel || "Messenger";
  const targetedProduct = product?.name ? product : (products?.[0] || null);

  const rawPriceStr = targetedProduct?.price ? String(targetedProduct.price).trim() : "";
  const cleanPriceStr = rawPriceStr.toLowerCase().replace(/[^0-9a-z]/g, "");
  const numericPrice = parseFloat(rawPriceStr.replace(/[^0-9.]/g, ""));
  const isFakeOrPlaceholderPrice =
    !rawPriceStr ||
    ["1", "0", "gratis", "free", "123", "1234", "12345", "9999"].includes(cleanPriceStr) ||
    (!isNaN(numericPrice) && numericPrice <= 15);

  const { timeGreeting } = getFormalTimeGreeting();
  const expectedGreeting = firstName
    ? `${timeGreeting}, estimado/a ${firstName}. Mucho gusto en saludarle.`
    : `${timeGreeting}, estimado/a. Mucho gusto en saludarle.`;

  const alreadyMentionedWebsite =
    Array.isArray(conversationHistory) &&
    conversationHistory.some((m: any) => {
      const text = (typeof m === "string" ? m : m?.content || "").toLowerCase();
      return text.includes("amecocinas.com") || text.includes("página web") || text.includes("pagina web");
    });

  try {
    const prompt = `
ACTÚA COMO UN ASESOR COMERCIAL DE ALTA GAMA PARA "APM INOX" (GENTE FINA, SUMO RESPETO Y CAUTELA).

Tu función es atender y convertir conversaciones de clientes provenientes de:
- Facebook Marketplace
- Facebook Messenger
- Instagram
- WhatsApp
en ventas reales con el trato más distinguido, formal, respetuoso y cauteloso.

No eres un chatbot informal ni improvisado.
Eres un asesor comercial distinguido de APM Inox (fábrica de cocinas industriales y equipos de acero inoxidable en Quito, Ecuador).

==================================================
REGLAS ESTRICTAS DE TONO: GENTE FINA, RESPETO ABSOLUTO Y PRUDENCIA
1. ⚠️ ESTRICTAMENTE PROHIBIDO ABRIR CON "HOLA" O "¡HOLA!":
   - NUNCA comiences tu mensaje con "Hola", "¡Hola!", "Hola amigo/a" ni "Hola [nombre]".
   - Tu mensaje DEBE EMPEZAR OBLIGATORIAMENTE con el saludo educado según el horario actual:
     "${expectedGreeting}"

2. 🎩 TRATO EXCLUSIVO DE "USTED" (GENTE FINA):
   - Habla con máxima educación, cortesía y pulcritud ("como gente fina, hablando con todo respeto").
   - Trata SIEMPRE de "Usted", "le", "su" (PROHIBIDO TOTALMENTE tutear: no uses "te ayudo", "tu negocio", "mira", "pana", "mijo").
   - Utiliza expresiones corteses y distinguidas:
     * "De parte de APM Inox, con todo agrado y consideración le confirmo..."
     * "Es un verdadero placer atenderle..."
     * "Con mucho gusto le brindo la información técnica requerida..."
     * "Para su respetable negocio o proyecto..."

3. 🛡️ SER CAUTELOSO Y PRUDENTE CON LO QUE DICE:
   - Sé cauto, medido y preciso en cada afirmación.
   - Demuestra dominio técnico del acero inoxidable grado alimenticio T-304 y la garantía de fábrica, sin exageraciones ni promesas vacías.
   - Si el anuncio tiene un precio real válido mayor a $15, infórmalo con serenidad y respaldo de taller: "Con mucho gusto le confirmo que su valor directo de taller es de ${targetedProduct?.price || ""} en acero inoxidable con garantía de fábrica."
   - Si el anuncio tiene precio gancho ($1, $0, gratis o simbólico):
     * ¡PROHIBIDO decir que cuesta $1 o que es gratis!
     * ¡PROHIBIDO TOTALMENTE decir "el precio es referencial" o "valor referencial" (suena feo)!
     * Explica con suma cautela y distinción: "Como somos fabricantes directos, cada cotización se elabora con precisión de taller según las medidas y especificaciones exactas que requiera su respetable espacio. Con el mayor agrado le atendemos en llamada o WhatsApp al 09920350548 o puede facilitarnos su número para comunicarnos de inmediato."

4. 🤝 CIERRE Y DESPEDIDA DISTINGUIDA ("HASTA LUEGO / MUCHO GUSTO"):
   - Concluye siempre con una despedida fina y atenta:
     "Quedo a su entera y grata disposición. Hasta luego y que tenga un excelente resto del día."
     o "Quedo muy atento a su gentil respuesta. Mucho gusto y un cordial saludo."

==================================================
DATOS OFICIALES Y CATÁLOGO APM INOX (TIENDA WEB & TALLER):
Página web oficial y tienda en línea: https://amecocinas.com/
Taller físico en Quito: Calle 25 de Mayo 226, sector Cotocollao (frente al Club de Leones).
Teléfono de atención y cotizaciones: 09920350548
Horario de atención: Lunes a Sábado de 08:00 a 18:00
Material de fabricación: 100% Acero Inoxidable T-304 grado alimenticio quirúrgico.

1. PRECIOS CONFIRMADOS DE CATÁLOGO WEB Y FÁBRICA:
   - Estufa Industrial 4 Quemadores con Horno: $750 (acero inox T-304, quemadores macizos, horno amplio)
   - Freidora de Alto Rendimiento 2 Canastas: $450 (20 litros a gas, acero inox)
   - Mesa de Trabajo Acero Inoxidable 1.5m (150 cm): $150
   - Campana Extractora de Pared 2m: $600 (con filtros laberinto atrapagrasa lavables)
   - Horno de Convección Eléctrico Profesional: $1200 (4 charolas grandes)
   - Plancha a Gas Acero Cold Rolled 1m: $390 (quemadores alta potencia)
   - Cocina Industrial 2 Quemadores Inox: $195 - $200
   - Cocina Industrial 3 Quemadores Inox: $295
   - Asador en Acero Inoxidable con Tapa: $150 - $160

2. PRODUCTOS DE ENTREGA INMEDIATA (Individuales o en combo/grupo):
   - Góndolas especiales en acero inoxidable y estanterías reforzadas.
   - Cocinas industriales de 2, 3 y 4 quemadores con horno, y asadores con tapa.
   - Lavabos de 1 y 2 pozos, y pozos a medida.
   - Mesas de trabajo de 150 cm y 200 cm, y mesas con poza incorporada.
   - Freidoras industriales de 2 canastas (20L) y de 4 pozos con 8 canastillas.
   - Campanas de extracción industrial con filtros laberinto.
   - Self service de 2, 3 y 4 pozos.
   - Grill híbrido de 150 x 60 cm.
   - Muebles y estaciones de Bar en acero inoxidable.

⭐ REGLA DE LA PÁGINA WEB (MÁXIMO UNA VEZ POR CHAT):
${alreadyMentionedWebsite ? `
- ⚠️ AVISO: La página web https://amecocinas.com/ YA FUE MENCIONADA previamente en esta conversación.
- ¡ESTÁ ESTRICTAMENTE PROHIBIDO volver a incluir el enlace https://amecocinas.com/ o invitar a la página web en este mensaje! (Una sola vez por chat basta, no insistir innecesariamente).
` : `
- Si es el primer contacto o solicita catálogo, puede invitarle cortésmente una sola vez: "Con todo agrado, le invito cordialmente a apreciar más modelos en nuestra página web: https://amecocinas.com/".
- Recuerde: solo se comparte UNA sola vez en todo el chat.
`}

==================================================
CONTEXTO DEL CLIENTE Y DEL ANUNCIO
Nombre detectado del cliente: ${cleanLeadName ? `"${cleanLeadName}"` : "Estimado/a cliente"}
Canal: ${channel}
${targetedProduct ? `PRODUCTO ESPECÍFICO DEL CHAT / ANUNCIO: "${targetedProduct.name}" (Precio en publicación: ${targetedProduct.price || "No especificado"})` : "Producto no especificado aún"}
${isFakeOrPlaceholderPrice ? `
⚠️ ATENCIÓN SOBRE EL PRECIO DEL ANUNCIO:
El precio en la publicación es simbólico ("${rawPriceStr || 'No especificado'}").
- ¡BAJO NINGUNA CIRCUNSTANCIA diga que cuesta $1, $0 ni que es gratis!
- ¡PROHIBIDO decir "el precio es referencial"!
- Explique con cortesía y cautela que al ser fabricantes directos, cada equipo se cotiza con precisión de taller según las medidas y especificaciones requeridas para su establecimiento, e invítelo a contactar al 09920350548 o facilitarnos su número.
` : `
✅ PRECIO REAL CONFIRMADO: "${rawPriceStr}". Puede confirmar este precio de taller con orgullo y seguridad.`}
Historial conversación:
${JSON.stringify(conversationHistory?.slice(-5) || [], null, 2)}
Último mensaje recibido del cliente: "${userMessage}"

==================================================
RESPONDE ESTRICTAMENTE EN ESTE FORMATO JSON:
{
  "intencion": "solicita_precio|solicita_ubicacion|quiere_comprar|tiene_dudas|reclamo|curiosidad",
  "temperatura": "frio|tibio|caliente|cliente",
  "objecion_detectada": "tipo de objeción o null",
  "extraccion_datos": {
    "nombre": "nombre detectado o null",
    "ciudad": "ciudad detectada o null",
    "producto": "producto de interes o null"
  },
  "respuesta_generada": "Tu mensaje formal y distinguido para el cliente",
  "accion_crm": "crear_lead|actualizar_etapa|notificar_vendedor",
  "etapa_sugerida": "nuevo|contactado|interesado|cotizacion|venta"
}
`;

    const text = await generateAIText(prompt, true);
    // Clean markdown code blocks if present
    const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = safeParseJson(cleanText, null);
    
    if (!parsedData || !parsedData.respuesta_generada) {
      console.warn("AI parse failed. Raw text:", text);
      throw new Error("Invalid structure from AI engine");
    }

    // REGLA DEL NEGOCIO: Prohibir y limpiar cualquier frase de "precio referencial" que suene fea
    parsedData.respuesta_generada = parsedData.respuesta_generada
      .replace(/el valor publicado es solo referencial[;,.]?/gi, "como somos fabricantes directos,")
      .replace(/el precio publicado es solo referencial[;,.]?/gi, "como somos fabricantes directos,")
      .replace(/el valor es solo referencial[;,.]?/gi, "como somos fabricantes directos,")
      .replace(/el precio es solo referencial[;,.]?/gi, "como somos fabricantes directos,")
      .replace(/el valor publicado es referencial[;,.]?/gi, "como somos fabricantes directos,")
      .replace(/el precio publicado es referencial[;,.]?/gi, "como somos fabricantes directos,")
      .replace(/es solo referencial[;,.]?/gi, "se cotiza con precisión de taller según sus requerimientos,")
      .replace(/es referencial[;,.]?/gi, "se cotiza con precisión de taller según sus requerimientos,")
      .replace(/precio referencial/gi, "precio de taller según medidas")
      .replace(/valor referencial/gi, "valor de taller según medidas");

    // REGLA ESTRICTA "NO HOLA": Reemplazar cualquier "Hola" / "¡Hola" por el saludo distinguido
    parsedData.respuesta_generada = parsedData.respuesta_generada
      .replace(/^¡?hola\s*[!.,]?\s*(estimado\/a\s*[a-záéíóúñ]+[.,]?)?/i, "")
      .replace(/^¡?hola\s+[a-záéíóúñ]+[!.,]?\s*/i, "")
      .replace(/¡?hola\s+cliente(\s*\d+)?!?[,.]?/gi, "")
      .replace(/¡?hola\s+amigo\/a!?[,.]?/gi, "")
      .replace(/¡?hola[!.,]?\s*/gi, "")
      .replace(/\[nombre\]/gi, firstName || "")
      .trim();

    // Asegurar que inicie siempre con el saludo distinguido time-aware
    if (!parsedData.respuesta_generada.startsWith(timeGreeting)) {
      parsedData.respuesta_generada = `${expectedGreeting} ${parsedData.respuesta_generada}`.trim();
    }

    // Asegurar trato de usted y gente fina (convertir tuteo residual)
    parsedData.respuesta_generada = parsedData.respuesta_generada
      .replace(/\bte ayudamos\b/gi, "le ayudamos con todo gusto")
      .replace(/\bte ayudo\b/gi, "le ayudo con sumo agrado")
      .replace(/\bte confirmo\b/gi, "le confirmo")
      .replace(/\bte confirmamos\b/gi, "le confirmamos")
      .replace(/\bte asesoramos\b/gi, "le asesoramos con mucho gusto")
      .replace(/\bte enviamos\b/gi, "le enviamos")
      .replace(/\bte compartimos\b/gi, "le compartimos")
      .replace(/\bte cotizamos\b/gi, "le cotizamos")
      .replace(/\btu local\b/gi, "su respetable local")
      .replace(/\btu negocio\b/gi, "su negocio")
      .replace(/\btu proyecto\b/gi, "su proyecto")
      .replace(/\btu espacio\b/gi, "su espacio")
      .replace(/\btu ciudad\b/gi, "su ciudad")
      .replace(/\btu número\b/gi, "su número")
      .replace(/\btu whatsapp\b/gi, "su WhatsApp")
      .replace(/\bpuedes\b/gi, "puede")
      .replace(/\bte invito\b/gi, "le invito cordialmente")
      .replace(/\bte recibimos\b/gi, "le recibimos con todo agrado");

    // REGLA: Invitar a la página web MÁXIMO UNA VEZ por chat
    if (!alreadyMentionedWebsite) {
      if (!parsedData.respuesta_generada.includes("amecocinas.com")) {
        parsedData.respuesta_generada += "\n\nCon todo agrado, le invito cordialmente a apreciar nuestro catálogo en línea: https://amecocinas.com/";
      }
    } else {
      parsedData.respuesta_generada = parsedData.respuesta_generada
        .replace(/\n\n.*https:\/\/amecocinas\.com\/[^\n]*/gi, "")
        .replace(/También te invito a revisar nuestro catálogo completo.*https:\/\/amecocinas\.com\/?/gi, "")
        .replace(/También le invito a revisar nuestro catálogo completo.*https:\/\/amecocinas\.com\/?/gi, "")
        .replace(/También le invito a conocer todo nuestro catálogo.*https:\/\/amecocinas\.com\/?/gi, "")
        .replace(/También puedes ver nuestros modelos estándar en https:\/\/amecocinas\.com\/?/gi, "")
        .replace(/https:\/\/amecocinas\.com\/?/gi, "")
        .trim();
    }

    // Adaptamos al formato que espera el Frontend y la Extensión (replyText)
    const data = {
      ...parsedData,
      replyText: parsedData.respuesta_generada, // Bridge backward compatibility
      suggestedSellerReplies: [
        "¿Deseas que revisemos disponibilidad?",
        "¿Para qué ciudad necesitas el equipo?",
        "Paso a comunicarte con un asesor humano."
      ]
    };

    // TODO: Connect Action CRM to Drizzle DB (crear_lead, actualizar_etapa)

    res.json({ success: true, data });
  } catch (error: any) {
    console.warn("Using smart fallback for /api/ai/live-chat due to:", error?.message || error);
    const fallback = generateContextualSalesFallback(
      cleanLeadName,
      channel,
      businessProfile,
      targetedProduct,
      [...(conversationHistory || []), { sender: "customer", content: userMessage }]
    );

    res.json({
      success: true,
      data: {
        replyText: fallback.primaryResponse,
        suggestedSellerReplies: fallback.suggestedSellerReplies || [
          "¿Para qué tipo de negocio necesitas el equipo?",
          "¿Deseas visitarnos en Cotocollao frente al Club de Leones?",
          "¿A qué número de WhatsApp te comparto fotos y medidas?",
        ],
      },
    });
  }
});

// API: AI Sales & Closing Advisor Analysis + Copy Generator
app.post("/api/ai/advisor-strategy", async (req, res) => {
  const {
    leadName,
    channel,
    businessProfile,
    productContext,
    conversationHistory,
    specificTechnique,
  } = req.body;

  try {
    const prompt = `
IDENTIDAD DEL BOT
Eres un asistente y estratega comercial profesional de la empresa ${businessProfile?.name || "APM Inox"}.
Tu función principal es atender clientes provenientes de WhatsApp, Facebook Ads, Instagram y campañas digitales, y guiar al vendedor para cerrar la venta con alta conversión.

Tu objetivo NO es solamente responder preguntas, sino:
- Detectar clientes interesados.
- Obtener información importante.
- Guiar la conversación hacia una compra.
- Resolver dudas.
- Derivar al asesor humano cuando sea necesario.

Debes comunicarte de forma: Amable, Profesional, Cercana, Natural, Breve, Orientada a ventas.
Nunca debes sonar como un robot.

REGLAS GENERALES DE CONVERSACIÓN
1. Siempre saluda al cliente si es el primer contacto (ej: "Hola 👋 muchas gracias por escribirnos. Estoy aquí para ayudarte 😊").
2. Antes de entregar demasiada información, identifica qué necesita (Nombre, Ciudad, Producto, Necesidad principal).
3. Nunca envíes mensajes demasiado largos (usa párrafos cortos, emojis moderados, preguntas directas).
4. Nunca discutir con el cliente. Escucha, responde con beneficios y busca soluciones.

CLASIFICACIÓN DEL CLIENTE
- NUEVO: Cliente que recién escribe.
- INTERESADO: Pregunta precio, características, disponibilidad.
- CALIENTE: Pregunta formas de pago, envío, compra.
- CLIENTE: Confirmó pedido.
- PERDIDO: No responde después del seguimiento.

FLUJO DE ATENCIÓN
- ETAPA 1 (Primer Contacto): Saluda y pregunta "¿qué producto o servicio estás buscando?".
- ETAPA 2 (Identificar necesidad): Si pregunta precio, responde "Claro 😊 tenemos diferentes opciones disponibles. Para ayudarte mejor, ¿me indicas qué producto deseas y en qué ciudad te encuentras?".
- ETAPA 3 (Obtener datos): Solicita Nombre, Ciudad, Producto, Cantidad, Forma de pago.
- ETAPA 4 (Presentar oferta): Nunca solamente indicar precio. Incluir Beneficio principal, Promoción, Garantía, Facilidad de compra. Ejemplo: "Tenemos disponible la promoción de [PRODUCTO]. Incluye garantía y envío. El valor es de $[PRECIO]. ¿Deseas que revisemos disponibilidad para tu ciudad?".

MANEJO DE OBJECIONES
- "Está caro": "Entiendo 😊 muchas personas buscan comparar precios. La diferencia es que nuestro producto incluye garantía, respaldo y atención. También podemos revisar la mejor opción según tu presupuesto."
- "Lo voy a pensar": "Claro 😊 no hay problema. Para ayudarte mejor, ¿qué información necesitas revisar antes de tomar una decisión?"
- "No tengo dinero ahora": "Comprendo 😊. Podemos revisar las opciones disponibles para encontrar una alternativa que se ajuste mejor."

CIERRE DE VENTA
- Cuando el cliente demuestra intención ("quiero comprar", "envíame", "cómo pago"): "Excelente 😊 vamos a gestionar tu pedido. Por favor confírmame: 1. Nombre completo, 2. Ciudad, 3. Dirección, 4. Teléfono, 5. Forma de pago."

TRANSFERENCIA A HUMANO
- Enviar a asesor si solicita hablar con persona, reclamos, negociaciones especiales, o si está molesto: "Perfecto 😊 voy a comunicarte con uno de nuestros asesores para ayudarte personalmente."

REGLAS IMPORTANTES
- NUNCA inventar precios, disponibilidad o prometer cosas no confirmadas.
- Si no tienes información: "Permíteme verificar esa información para darte una respuesta correcta 😊".

OBJETIVO FINAL: Convertir conversaciones en ventas y avanzar la conversación hacia el siguiente paso.

Cliente: ${leadName || "Cliente"} (${channel || "Messenger"})
Historial:
${JSON.stringify(conversationHistory || [], null, 2)}

Devuelve EXCLUSIVAMENTE un JSON válido:
{
  "intentScore": 85,
  "buyerTemperature": "hot",
  "detectedObjections": ["Objeción detectada 1", "Objeción detectada 2"],
  "psychologicalTrigger": "Fabricante directo en Quito Norte con acero inoxidable genuino y garantía",
  "recommendedTechnique": "Venta Consultiva SPIN con Doble Alternativa",
  "primaryResponse": "Texto listo para enviar...",
  "alternativeConsultative": "Texto alternativo más consultivo...",
  "alternativeUrgency": "Texto alternativo con mayor urgencia de taller...",
  "voiceNoteScript": "Guión de audio de 20 segundos..."
}
`;

    const text = await generateAIText(prompt, true);
    const data = safeParseJson(text, null);
    if (!data) {
      throw new Error("Invalid JSON structure from AI Engine");
    }
    res.json({ success: true, data });
  } catch (error: any) {
    console.warn("Using smart contextual fallback for /api/ai/advisor-strategy due to:", error?.message || error);
    const fallbackData = generateContextualSalesFallback(
      leadName,
      channel,
      businessProfile,
      productContext,
      conversationHistory,
      specificTechnique
    );
    res.status(200).json({ success: true, data: fallbackData });
  }
});

// API: Generate Social Posts (Social Seller AI - Modules 2 & 5)
app.post("/api/ai/generate-post", async (req, res) => {
  const { product, category, price, features, images, city } = req.body;

  try {
    const prompt = `
Actúa como un experto en copywriting para redes sociales y Facebook Marketplace.
Quiero que generes 5 variaciones de publicaciones optimizadas para vender este producto.

DATOS DEL PRODUCTO:
Producto: ${product || "Producto General"}
Categoría: ${category || "General"}
Precio: ${price || "A consultar"}
Características: ${features ? features.join(", ") : "Varias"}
Ubicación/Ciudad: ${city || "Nacional"}

REGLAS DE GENERACIÓN:
1. Nunca crear el mismo texto exacto.
2. Cada variación debe tener un enfoque distinto:
   - Variante 1: Enfoque en Precio
   - Variante 2: Enfoque en Calidad
   - Variante 3: Enfoque en Promoción
   - Variante 4: Enfoque en Urgencia
   - Variante 5: Enfoque en Beneficio principal
3. Cada título debe ser corto, llamativo y optimizado para búsquedas.
4. La descripción debe incluir: Beneficios, Características, Generación de Confianza (ej: Nuevo, Garantía) y un Llamado a la Acción claro ("Escríbenos por WhatsApp para confirmar disponibilidad").
5. Usa emojis de forma atractiva pero no excesiva.

RESPONDE ESTRICTAMENTE EN ESTE FORMATO JSON:
{
  "variantes": [
    {
      "enfoque": "precio",
      "titulo": "Título optimizado...",
      "descripcion": "Cuerpo completo de la descripción aquí..."
    }
  ]
}
`;

    const text = await generateAIText(prompt, true);
    const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const data = safeParseJson(cleanText, null);
    
    if (!data || !data.variantes) {
      throw new Error("Invalid post generation JSON structure from AI Engine");
    }
    
    res.json({ success: true, data: data.variantes });
  } catch (error: any) {
    console.warn("Using fallback for /api/ai/generate-post due to:", error?.message || error);
    res.json({
      success: true,
      data: [
        {
          enfoque: "fallback",
          titulo: `${product || "Producto"} - Oferta en ${city || "tu ciudad"}`,
          descripcion: `🔥 Disponible ahora\n\n✅ Excelente calidad\n✅ Garantía incluida\n✅ Entrega inmediata\n\nEscríbenos para confirmar disponibilidad.`
        }
      ]
    });
  }
});

// API: Generate Meta Broadcast / Retargeting Campaigns
app.post("/api/ai/generate-campaign", async (req, res) => {
  const { campaignType, targetAudience, product, businessProfile } = req.body;

  try {
    const prompt = `
Genera 3 variantes de copys comerciales de alta conversión para campañas de mensajes en Meta (WhatsApp Broadcast, Instagram Direct DM, Messenger).
Tipo de Campaña: ${campaignType || "Reactivación de prospectos indecisos"}
Público Objetivo: ${targetAudience || "Leads que preguntaron precio en los últimos 7 días pero no compraron"}
Producto/Servicio: ${product?.name || "Oferta principal"} ($${product?.price || 199})
Negocio: ${businessProfile?.businessName || "Nuestra Empresa"}

Requisitos:
- Adaptados a la lectura rápida en móvil.
- Utiliza emojis estratégicos y formato *negrita*.
- Incluye gancho inicial irresistible, anclaje de valor, motivo de urgencia/escasez y llamado directo a la acción con link o palabra clave de respuesta.

Devuelve un JSON con:
{
  "campaignTitle": "Título de la campaña",
  "recommendedChannel": "whatsapp",
  "variants": [
    {
      "id": 1,
      "tone": "Urgencia & Oferta Flash 24h",
      "hook": "Gancho inicial",
      "message": "Mensaje completo...",
      "callToAction": "Responde 'QUIERO MI CUPO' para activarlo"
    },
    {
      "id": 2,
      "tone": "Valor & Caso de Éxito / Prueba Social",
      "hook": "Gancho inicial",
      "message": "Mensaje completo...",
      "callToAction": "Toca aquí para ver el testimonio completo"
    },
    {
      "id": 3,
      "tone": "Exclusividad & Cierre Directo VIP",
      "hook": "Gancho inicial",
      "message": "Mensaje completo...",
      "callToAction": "Haz clic aquí para reclamar el enlace directo"
    }
  ]
}
`;

    const text = await generateAIText(prompt, true);
    const data = safeParseJson(text, null);
    if (!data || !data.variants) {
      throw new Error("Invalid campaign JSON structure from AI Engine");
    }
    res.json({ success: true, data });
  } catch (error: any) {
    console.warn("Using smart fallback for /api/ai/generate-campaign due to:", error?.message || error);
    const prodName = product?.name || "nuestro programa estrella";
    const prodPrice = product?.price || 297;
    const currency = businessProfile?.defaultCurrency || "USD";

    res.json({
      success: true,
      data: {
        campaignTitle: `${campaignType || "Reactivación VIP"} - ${prodName}`,
        recommendedChannel: "whatsapp",
        variants: [
          {
            id: 1,
            tone: "⚡ Oferta Flash 24 Horas",
            hook: "🎁 Solo para las próximas 5 personas que respondan...",
            message: `¡Hola! Notamos que estuviste consultando por *${prodName}*. Para ayudarte a dar el paso hoy, te habilitamos una *bonificación exclusiva de $${Math.round(prodPrice * 0.2)} ${currency} OFF* válida solo por 24 horas ⏳.`,
            callToAction: "Responde 'PROMO' y te envío tu enlace directo con descuento",
          },
          {
            id: 2,
            tone: "🌟 Caso de Éxito & Prueba Social",
            hook: "📈 Cómo duplicaron sus resultados en menos de 30 días...",
            message: `¡Hola! Quería compartirte el caso reciente de uno de nuestros clientes con *${prodName}*. Aplicando exactamente la metodología que te mostramos, logró cerrar ventas récord en Meta 📲.`,
            callToAction: "Toca aquí para ver el desglose paso a paso",
          },
          {
            id: 3,
            tone: "💎 Cierre VIP Exclusivo 1 a 1",
            hook: "🔒 Acceso prioritario con garantía total...",
            message: `¡Hola! Abrimos únicamente 3 cupos para acompañamiento personalizado con *${prodName}* ($${prodPrice} ${currency}) con garantía de satisfacción del 100% 🛡️.`,
            callToAction: "Responde 'ACCESO' para reservar tu cupo antes de que se agoten",
          },
        ],
      },
    });
  }
});

// API: Customer Persona Simulator (Generates realistic incoming leads for testing sales skills)
app.post("/api/ai/simulate-customer-message", async (req, res) => {
  const { buyerType, product, conversationHistory } = req.body;

  try {
    const prompt = `
Simula el siguiente mensaje de un cliente real en WhatsApp o Instagram Direct que está interactuando con un negocio.
Tipo de Comprador / Arquetipo: ${buyerType || "indeciso por el precio"}
- "skeptic": Desconfiado, pide pruebas o garantías, ha tenido malas experiencias antes.
- "price_haggler": Le interesa pero pide descuento o dice que está caro.
- "busy_executive": Quiere todo rápido, no tiene tiempo para rodeos, pide resumen o link directo.
- "ready_buyer": Muy interesado, quiere saber métodos de pago y cuándo empieza.
- "comparison_shopper": Compara con otra marca o competencia.

Producto: ${product?.name || "Servicio Premium"} ($${product?.price || 150})
Historial previo: ${JSON.stringify(conversationHistory || [])}

Devuelve un JSON con:
{
  "messageText": "Texto realista como lo escribiría una persona real en WhatsApp/Instagram...",
  "detectedTone": "Interesado pero dudoso",
  "difficulty": "Medio"
}
`;

    const text = await generateAIText(prompt, true);
    const data = safeParseJson(text, null);
    if (!data || !data.messageText) {
      throw new Error("Invalid customer simulation JSON from Gemini");
    }
    res.json({ success: true, data });
  } catch (error) {
    const fallbacks: Record<string, string> = {
      price_haggler: "Me interesa bastante pero se me hace un poco elevado el precio... ¿tienen alguna promo o facilidades de pago si cerramos hoy?",
      skeptic: "¿Tienen alguna garantía por escrito o testimonios de clientes con casos parecidos al mío? Es que ya tuve una mala experiencia antes.",
      busy_executive: "Perfecto, me queda claro. Pásame directamente el enlace de pago con tarjeta y los pasos para empezar de inmediato.",
      ready_buyer: "¡Me encanta lo que incluye! ¿Aceptan transferencia bancaria o tarjeta de crédito en cuotas? Quiero arrancar ya.",
      comparison_shopper: "Estuve viendo otra opción que cuesta un poco menos. ¿Cuál sería la diferencia principal de ustedes frente a ellos?",
    };

    res.json({
      success: true,
      data: {
        messageText: fallbacks[buyerType] || "¿Aceptan pagos con tarjeta en cuotas o transferencia?",
        detectedTone: "Prospecto interactuando activamente",
        difficulty: "Medio",
      },
    });
  }
});

// Setup Vite development middleware or static production serving
async function startServer() {
  try {
    await seedCrmDatabase();
    console.log("CRM PostgreSQL database verified & seeded successfully.");
    if (automationsEnabled()) {
      SocialSchedulerService.startScheduler();
      console.log("Social Publisher Scheduler started.");
    }
  } catch (seedErr) {
    console.warn("CRM Database initial seed check:", seedErr);
  }

  // Messenger automation loop. Runs even if the PostgreSQL seed failed, since it only
  // depends on the local JSON state and the Graph API.
  // AUTOMATIONS_ENABLED=false turns off every automatic send/publish (useful when the
  // production server is running and you start the app on your PC too).
  if (!automationsEnabled()) {
    console.log("AUTOMATIONS_ENABLED=false: no auto-replies, drips or auto-publishing on this instance.");
  } else try {
    const { FacebookSyncService } = await import("./src/services/facebook-sync.service.ts");
    const { FacebookAutoResponderService } = await import("./src/services/facebook-auto-responder.service.ts");
    const { AutomationService } = await import("./src/services/automation.service.ts");

    AutomationService.recoverInterruptedBroadcasts();
    FacebookSyncService.syncAllConversations().catch(() => {});

    let tickRunning = false;
    setInterval(async () => {
      if (tickRunning) return; // never overlap ticks if one takes longer than 30s
      tickRunning = true;
      try {
        await FacebookSyncService.syncAllConversations().catch((e) =>
          console.warn("[Automation loop] Messenger sync failed:", e?.message || e)
        );
        await FacebookAutoResponderService.processUnrepliedConversations();
        await AutomationService.processDueDrips();
      } catch (e: any) {
        console.error("[Automation loop] Error:", e?.message || e);
      } finally {
        tickRunning = false;
      }
    }, 30000);
    console.log("Messenger auto-sync, Auto-Responder and Drip processor active (every 30s).");
  } catch (loopErr) {
    console.error("Could not start Messenger automation loop:", loopErr);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  \x1b[32m➜\x1b[0m  \x1b[1mLocal:\x1b[0m   \x1b[36mhttp://localhost:${PORT}/\x1b[0m`);
    console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mNetwork:\x1b[0m \x1b[36mhttp://127.0.0.1:${PORT}/\x1b[0m\n`);
  });

  // Local mode: a separate port that exposes ONLY the Meta webhooks, for the tunnel (see LOCAL.md).
  const webhookPort = Number(process.env.WEBHOOK_PORT);
  if (webhookPort) {
    const { startWebhookGateway } = await import("./src/meta/webhooks/webhook-gateway.ts");
    startWebhookGateway(webhookPort);
  }
}

startServer();
