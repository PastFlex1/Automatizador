import React, { useState, useEffect, useRef } from "react";
import {
  FileText, Clock, Bot, Megaphone, Plus, Trash2, Copy, Check, Play, Send, Sparkles, ShieldCheck, Clock3, AlertCircle, X, MessageSquare, Zap
} from "lucide-react";
import { Product, Lead, BusinessProfile } from "../../types";
import {
  ChatbotConfig, ChatbotRule, interpolateTemplate, matchChatbotRule, normalizeChatbotConfig, parseKeywords,
} from "../../services/automation-rules";

interface AutomationSuiteProps {
  products: Product[];
  leads: Lead[];
  businessProfile: BusinessProfile;
  onSendToChat?: (text: string) => void;
}

interface TemplateItem { id: string; title: string; category: string; channel: string; content: string; tags?: string[]; }
interface DripStep { day: number; trigger: string; title: string; message: string; }
interface DripCampaign { id: string; name: string; description: string; active: boolean; steps: DripStep[]; }
interface DripLogEntry { step: number; at: string; result: string; detail?: string; }
interface DripEnrollment { dripId: string; currentStep: number; enrolledAt: string; status: string; log?: DripLogEntry[]; }
interface BroadcastItem {
  id: string; title: string; targetAudience: string; sentCount: number; failedCount?: number; eligibleCount?: number;
  skippedOutsideWindow?: number; status: string; createdAt: string; delaySeconds: number; message: string; lastError?: string;
}

const DRIP_RESULT_LABELS: Record<string, string> = {
  sent: "✅ Enviado",
  failed: "❌ Falló",
  skipped_window: "⏸️ Ventana 24h cerrada",
  skipped_missed: "⏭️ Omitido (vencido)",
  skipped_channel: "✋ Enviar manualmente",
};

/** Reads a JSON API response and throws a readable error when it failed. */
async function readApi(res: Response): Promise<any> {
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON (e.g. 404 HTML) */ }
  if (!res.ok || !json?.success) throw new Error(json?.error || `Error del servidor (${res.status})`);
  return json;
}

export const AutomationSuite: React.FC<AutomationSuiteProps> = ({ products, leads, businessProfile }) => {
  const [activeTab, setActiveTab] = useState<"templates" | "drip" | "chatbot" | "broadcast">("templates");

  // Server data
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [dripCampaigns, setDripCampaigns] = useState<DripCampaign[]>([]);
  const [chatbot, setChatbot] = useState<ChatbotConfig>({ enabled: true, welcomeMessage: "", rules: [] });
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [assignedDrips, setAssignedDrips] = useState<Record<string, DripEnrollment>>({});

  // Template Tab State
  const [templateLeadId, setTemplateLeadId] = useState<string>("");
  const [copiedTplId, setCopiedTplId] = useState<string | null>(null);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTpl, setNewTpl] = useState({ title: "", category: "Cotización", channel: "whatsapp", content: "", tags: "Cocinas, Venta" });

  // Drip Tab State
  const [selectedLeadForDrip, setSelectedLeadForDrip] = useState<string>(leads[0]?.id || "");
  const [dripAssignedSuccess, setDripAssignedSuccess] = useState(false);

  // Chatbot State
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "bot"; text: string }>>([]);
  const [simInput, setSimInput] = useState("");
  const [isEditingBot, setIsEditingBot] = useState(false);
  const [editingRule, setEditingRule] = useState<ChatbotRule | null>(null);

  // Broadcast Tab State
  const [broadcastAudience, setBroadcastAudience] = useState("leads_pending");
  const [broadcastMessage, setBroadcastMessage] = useState(
    "🔥 ¡Oferta relámpago de fábrica en APM Inox! Esta semana tenemos la Cocina Industrial a precio directo con entrega inmediata."
  );
  const [broadcastDelay, setBroadcastDelay] = useState(12);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);

  // Keep the drip lead selector valid when leads arrive after the first render.
  useEffect(() => {
    if (!leads.some((l) => l.id === selectedLeadForDrip)) setSelectedLeadForDrip(leads[0]?.id || "");
  }, [leads]);

  const loadAutomations = async () => {
    try {
      const res = await fetch("/api/automations/data");
      const json = await res.json();
      if (json.success && json.data) {
        setTemplates(json.data.templates || []);
        setDripCampaigns(json.data.dripCampaigns || []);
        if (json.data.chatbot) {
          setChatbot(normalizeChatbotConfig(json.data.chatbot));
        } else {
          setChatbot({
            enabled: true,
            welcomeMessage: "¡Hola! Soy el asistente virtual. ¿En qué te puedo ayudar hoy?\n- Precios\n- Ubicación",
            rules: [
              { id: "1", name: "Ubicación", keywords: "direccion, ubicación", reply: "📍 Estamos en Quito Norte.", action: "send_message" },
              { id: "2", name: "Precios", keywords: "precio, costo", reply: "💰 Nuestros equipos van desde $150.", action: "recommend_product" },
              { id: "4", name: "Asesor Humano", keywords: "humano, asesor", reply: "👨‍💻 Te transferiré con un asesor.", action: "transfer_agent" }
            ]
          });
        }
        setBroadcasts(json.data.broadcasts || []);
        setAssignedDrips(json.data.assignedDrips || {});
      }
    } catch (e) {
      console.warn("Error loading automations data:", e);
    }
  };

  useEffect(() => { loadAutomations(); }, []);
  useEffect(() => { if (chatbot.welcomeMessage) setChatMessages([{ sender: "bot", text: chatbot.welcomeMessage }]); }, [chatbot.welcomeMessage]);

  const varsForLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return {};
    const product = products.find((p) => p.id === lead.interestProductId);
    return { cliente: lead.name?.split(" ")[0], equipo: product?.name, precio: product?.price };
  };

  const handleCopyTemplate = async (tpl: TemplateItem) => {
    const interpolated = interpolateTemplate(tpl.content, varsForLead(templateLeadId));
    try {
      await navigator.clipboard.writeText(interpolated);
      setCopiedTplId(tpl.id);
      setTimeout(() => setCopiedTplId(null), 2500);
    } catch {
      alert("No se pudo copiar al portapapeles. Revisa los permisos del navegador.");
    }
  };

  const handleSaveNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTpl.title || !newTpl.content) return;
    try {
      const payload = { ...newTpl, tags: newTpl.tags.split(",").map(t => t.trim()).filter(Boolean) };
      await readApi(await fetch("/api/automations/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setShowNewTemplateModal(false);
      setNewTpl({ title: "", category: "Cotización", channel: "whatsapp", content: "", tags: "Cocinas, Venta" });
      loadAutomations();
    } catch (err: any) {
      alert(`No se pudo crear la plantilla: ${err.message}`);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("¿Deseas eliminar esta plantilla?")) return;
    try {
      await readApi(await fetch(`/api/automations/templates/${id}`, { method: "DELETE" }));
      loadAutomations();
    } catch (err: any) {
      alert(`No se pudo eliminar la plantilla: ${err.message}`);
    }
  };

  const handleEnrollLeadInDrip = async () => {
    if (!selectedLeadForDrip) { alert("Selecciona un prospecto primero."); return; }
    if (!dripCampaigns[0]) { alert("No hay ninguna secuencia drip configurada."); return; }
    try {
      await readApi(await fetch("/api/automations/drips/enroll", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedLeadForDrip, dripId: dripCampaigns[0].id }),
      }));
      setDripAssignedSuccess(true);
      loadAutomations();
      setTimeout(() => setDripAssignedSuccess(false), 3000);
    } catch (err: any) {
      alert(`No se pudo iniciar la secuencia: ${err.message}`);
    }
  };

  const handleSaveBot = async () => {
    const emptyRule = chatbot.rules.find((r) => parseKeywords(r.keywords).length === 0);
    if (emptyRule) { alert(`La regla "${emptyRule.name}" no tiene palabras clave; nunca se activará.`); return; }
    try {
      const json = await readApi(await fetch("/api/automations/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chatbot) }));
      setChatbot(normalizeChatbotConfig(json.data));
      setIsEditingBot(false);
      setEditingRule(null);
    } catch (err: any) {
      alert(`No se pudo guardar el bot: ${err.message}`);
    }
  };

  const processBotMessage = (text: string) => {
    const matchedRule: ChatbotRule | null = matchChatbotRule(text, chatbot.rules);
    setTimeout(() => {
      if (matchedRule) {
        setChatMessages(prev => [...prev, { sender: "bot", text: matchedRule.reply }]);
        if (matchedRule.action === "transfer_agent") setTimeout(() => setChatMessages(prev => [...prev, { sender: "bot", text: "👨‍💻 Transfiriendo a un asesor..." }]), 800);
      } else {
        setChatMessages(prev => [...prev, { sender: "bot", text: "No entendí muy bien. ¿Puedes intentar con otras palabras?" }]);
      }
    }, 600);
  };

  const handleSimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simInput.trim()) return;
    setChatMessages((prev) => [...prev, { sender: "user", text: simInput }]);
    processBotMessage(simInput);
    setSimInput("");
  };

  const handleResetChatbotSim = () => setChatMessages([{ sender: "bot", text: chatbot.welcomeMessage }]);

  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);

  const handleStartBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    if (!confirm("Se enviará este mensaje por Messenger a los contactos que escribieron en las últimas 23 h. ¿Continuar?")) return;
    setIsBroadcasting(true); setBroadcastProgress(0); setActiveBroadcast(null);
    try {
      const json = await readApi(await fetch("/api/automations/broadcast/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Campaña ${new Date().toLocaleDateString()}`, targetAudience: broadcastAudience, delaySeconds: broadcastDelay, message: broadcastMessage }),
      }));
      let bc: BroadcastItem = json.data;
      setActiveBroadcast(bc);

      // Follow the real progress reported by the server.
      while (bc.status === "RUNNING" && !unmountedRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        bc = (await readApi(await fetch(`/api/automations/broadcast/${bc.id}`))).data;
        const done = bc.sentCount + (bc.failedCount || 0);
        setActiveBroadcast(bc);
        setBroadcastProgress(bc.eligibleCount ? Math.round((done / bc.eligibleCount) * 100) : 100);
      }
      if (unmountedRef.current) return;

      loadAutomations();
      const skipped = bc.skippedOutsideWindow ? `\n${bc.skippedOutsideWindow} contactos omitidos (más de 24 h sin escribir; Meta no permite enviarles).` : "";
      if (!bc.eligibleCount) {
        alert(`No se envió nada: ningún contacto de Messenger está dentro de la ventana de 24 h.${skipped}`);
      } else {
        alert(`Difusión terminada: ${bc.sentCount} enviados, ${bc.failedCount || 0} fallidos.${bc.lastError ? `\nÚltimo error: ${bc.lastError}` : ""}${skipped}`);
      }
    } catch (err: any) {
      alert(`Error en la difusión: ${err.message}`);
    } finally {
      if (!unmountedRef.current) {
        setIsBroadcasting(false);
        setTimeout(() => setBroadcastProgress(0), 2000);
      }
    }
  };

  const tabs = [
    { id: "templates", icon: FileText, label: "Plantillas Dinámicas" },
    { id: "drip", icon: Clock, label: "Drip Campaigns" },
    { id: "chatbot", icon: Bot, label: "Bot IA Calificador" },
    { id: "broadcast", icon: Megaphone, label: "Difusor Seguro" },
  ] as const;

  return (
    <div className="flex-1 aurora-bg text-slate-800 flex h-full overflow-hidden relative">
      {/* Decorative Orbs */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-[80px] opacity-40 animate-float" style={{ animationDelay: '1s' }}></div>
      <div className="absolute bottom-20 left-[20%] w-96 h-96 bg-cyan-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-float" style={{ animationDelay: '3s' }}></div>
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-pink-300 rounded-full mix-blend-multiply filter blur-[80px] opacity-30 animate-float" style={{ animationDelay: '5s' }}></div>

      {/* Unique Left Sidebar Nav */}
      <div className="w-[280px] m-6 mr-3 relative z-10 flex flex-col">
        <div className="glass-card rounded-[2rem] flex-1 p-6 flex flex-col shadow-xl shadow-slate-200/50 border border-white/80">
          <div className="mb-10 animate-fade-in-up">
            <div className="w-12 h-12 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-2xl shadow-lg flex items-center justify-center mb-4 animate-float">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">
              Nexus<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-cyan-500">Automations</span>
            </h2>
            <p className="text-xs text-slate-500 mt-2 font-medium">Plantillas, seguimiento y respuestas automáticas para Messenger y WhatsApp.</p>
          </div>

          <div className="space-y-3 flex-1">
            {tabs.map((t, idx) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all animate-fade-in-up hover:scale-[1.02] ${
                  activeTab === t.id
                    ? "bg-white text-purple-700 shadow-md border border-white/60"
                    : "text-slate-600 hover:bg-white/50 border border-transparent"
                }`}
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <t.icon className={`w-5 h-5 ${activeTab === t.id ? "text-purple-600" : "text-slate-400"}`} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-auto p-4 bg-purple-50 rounded-2xl border border-purple-100/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold text-purple-900">{chatbot.enabled ? "Bot activo" : "Bot desactivado"}</span>
            </div>
            <p className="text-[10px] text-purple-700 leading-relaxed">El servidor revisa Messenger cada 30 s: aplica las reglas del bot (o la IA) y envía los pasos drip pendientes.</p>
          </div>
        </div>
      </div>

      {/* Main Glass Canvas */}
      <div className="flex-1 my-6 mr-6 relative z-10 flex flex-col">
        <div className="glass-card rounded-[2rem] flex-1 overflow-y-auto p-8 shadow-2xl shadow-slate-200/40 border border-white/80 custom-scrollbar relative">
          
          {/* ========================================== */}
          {/* TAB 1: PLANTILLAS */}
          {/* ========================================== */}
          {activeTab === "templates" && (
            <div className="space-y-6 animate-fade-in-up h-full flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">Librería de Plantillas</h3>
                  <p className="text-sm text-slate-500 mt-1 font-medium">
                    Variables mágicas: <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold text-[11px]">&#123;cliente&#125;</code> <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold text-[11px]">&#123;equipo&#125;</code> <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold text-[11px]">&#123;precio&#125;</code> <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold text-[11px]">&#123;ubicacion&#125;</code> <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md font-bold text-[11px]">&#123;garantia&#125;</code>
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500">Personalizar para:</label>
                    <select value={templateLeadId} onChange={(e) => setTemplateLeadId(e.target.value)} className="bg-white border-2 border-slate-100 text-xs font-bold text-slate-800 rounded-xl px-3 py-1.5 focus:outline-none focus:border-purple-400">
                      <option value="">Sin prospecto (valores por defecto)</option>
                      {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setShowNewTemplateModal(true)}
                  className="glow-button bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-bold px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-purple-500/30 transition-transform hover:scale-105"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Plantilla
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-4">
                {templates.map((tpl, i) => (
                  <div key={tpl.id} className="bg-white/80 backdrop-blur-md border border-white hover:border-purple-200 hover:shadow-xl rounded-3xl p-5 flex flex-col transition-all group animate-fade-in-up relative overflow-hidden" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-500 opacity-50"></div>
                    <div className="relative z-10 flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-purple-600 px-3 py-1 rounded-full">
                          {tpl.category}
                        </span>
                        <button onClick={() => handleDeleteTemplate(tpl.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 bg-white shadow-sm p-1.5 rounded-full transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <h4 className="text-lg font-bold text-slate-900 mb-3">{tpl.title}</h4>
                      <p className="text-sm text-slate-600 line-clamp-4 whitespace-pre-line leading-relaxed">
                        {tpl.content}
                      </p>
                    </div>
                    <div className="pt-4 mt-4 relative z-10">
                      <button
                        onClick={() => handleCopyTemplate(tpl)}
                        className={`w-full text-sm font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
                          copiedTplId === tpl.id
                            ? "bg-emerald-50 text-emerald-600 border-2 border-emerald-200"
                            : "bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 border-2 border-transparent"
                        }`}
                      >
                        {copiedTplId === tpl.id ? <><Check className="w-4 h-4" /> ¡Copiada!</> : <><Copy className="w-4 h-4" /> Copiar con Datos mágicos</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 2: DRIP */}
          {/* ========================================== */}
          {activeTab === "drip" && (
            <div className="animate-fade-in-up max-w-4xl mx-auto w-full h-full flex flex-col">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full shadow-lg mb-4">
                  <Clock3 className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-3xl font-black text-slate-900">Secuencias Drip</h3>
                <p className="text-slate-500 mt-2 font-medium">Automatiza el seguimiento durante 7 días para prospectos fríos.</p>
                <p className="text-xs text-slate-400 mt-1 font-medium max-w-xl mx-auto">Envío automático por Messenger, Instagram o WhatsApp Business (API oficial), solo si el cliente escribió en las últimas 23 h (regla de Meta). Los chats de tu WhatsApp personal nunca reciben envíos automáticos. Si no, el paso queda marcado para que lo envíes a mano.</p>
              </div>

              <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-white shadow-xl shadow-slate-200/50 mb-8 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Seleccionar Prospecto para Iniciar Secuencia</label>
                  <select
                    value={selectedLeadForDrip}
                    onChange={(e) => setSelectedLeadForDrip(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-bold text-slate-800 rounded-2xl px-4 py-3 focus:outline-none focus:border-blue-400 focus:bg-white transition-all shadow-inner"
                  >
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.handleOrPhone})</option>)}
                  </select>
                </div>
                <button
                  onClick={handleEnrollLeadInDrip}
                  className="glow-button mt-6 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold px-8 py-3 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center gap-2 hover:scale-105 transition-transform"
                >
                  {dripAssignedSuccess ? <><Check className="w-5 h-5" /> ¡Iniciado!</> : <><Play className="w-5 h-5 fill-white" /> Ejecutar Drip</>}
                </button>
              </div>

              {Object.keys(assignedDrips).length > 0 && (
                <div className="bg-white/80 backdrop-blur-md rounded-3xl p-5 border border-white shadow-sm mb-8">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Prospectos en secuencia</h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                    {(Object.entries(assignedDrips) as Array<[string, DripEnrollment]>).map(([leadId, enr]) => {
                      const lead = leads.find((l) => l.id === leadId);
                      const total = dripCampaigns.find((d) => d.id === enr.dripId)?.steps.length || 0;
                      const last = enr.log?.[enr.log.length - 1];
                      return (
                        <div key={leadId} className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 rounded-2xl px-4 py-2.5 text-xs">
                          <span className="font-bold text-slate-800">{lead?.name || leadId}</span>
                          <span className="text-slate-500">
                            {enr.status === "active" ? `Paso ${Math.min(enr.currentStep, total)} de ${total}` : enr.status === "completed" ? "Completada" : enr.status}
                          </span>
                          {last && (
                            <span className="text-slate-600" title={last.detail}>
                              Paso {last.step}: {DRIP_RESULT_LABELS[last.result] || last.result}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="relative pl-8 pb-10 flex-1 overflow-y-auto custom-scrollbar pr-4">
                <div className="absolute left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-transparent rounded-full ml-[1.1rem]"></div>
                {dripCampaigns[0]?.steps.map((step, idx) => (
                  <div key={step.day} className="relative mb-8 animate-fade-in-up" style={{ animationDelay: `${idx * 150}ms` }}>
                    <div className="absolute -left-8 bg-white border-4 border-blue-400 w-10 h-10 rounded-full flex items-center justify-center font-black text-blue-600 shadow-md">
                      {step.day}
                    </div>
                    <div className="ml-8 bg-white/70 backdrop-blur-sm border border-white hover:shadow-xl rounded-3xl p-6 transition-all hover:-translate-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-3 py-1 rounded-full mb-3 inline-block">
                        {step.trigger}
                      </span>
                      <h4 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h4>
                      <p className="text-sm text-slate-600 bg-slate-50/80 p-4 rounded-2xl font-mono leading-relaxed">{step.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 3: CHATBOT */}
          {/* ========================================== */}
          {activeTab === "chatbot" && (
            <div className="flex gap-6 h-full animate-fade-in-up">
              {/* Rules Engine */}
              <div className="w-1/2 flex flex-col h-full bg-white/60 backdrop-blur-md rounded-[2rem] border border-white shadow-xl shadow-slate-200/50 p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                      Motor de Reglas <Bot className="w-6 h-6 text-purple-600" />
                    </h3>
                    <p className="text-sm text-slate-500 font-medium">IA de Respuestas Frecuentes</p>
                  </div>
                  {isEditingBot ? (
                    <button onClick={handleSaveBot} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-4 py-2 rounded-xl shadow-lg shadow-emerald-500/30">Guardar</button>
                  ) : (
                    <button onClick={() => setIsEditingBot(true)} className="bg-white border-2 border-slate-100 text-slate-700 font-bold px-4 py-2 rounded-xl hover:border-purple-200 hover:text-purple-700 transition-all shadow-sm">Editar</button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 pb-10">
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Saludo Inicial</label>
                    {isEditingBot ? (
                      <textarea value={chatbot.welcomeMessage} onChange={(e) => setChatbot({...chatbot, welcomeMessage: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-medium text-slate-800 rounded-2xl p-4 focus:outline-none focus:border-purple-400 min-h-[100px]" />
                    ) : (
                      <div className="text-sm text-slate-700 bg-slate-50 p-4 rounded-2xl whitespace-pre-line font-mono">{chatbot.welcomeMessage}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-6 mb-2">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Condicionales (If-Then)</h4>
                    {isEditingBot && <button onClick={() => setEditingRule({ id: Date.now().toString(), name: "Nueva", keywords: "", reply: "", action: "send_message" })} className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100">+ Agregar</button>}
                  </div>

                  {chatbot.rules?.map((rule) => (
                    <div key={rule.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm group hover:border-purple-200 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-slate-900 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div> {rule.name}</span>
                        {isEditingBot && (
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingRule(rule)} className="text-purple-600 bg-purple-50 p-1.5 rounded-lg hover:bg-purple-100"><Sparkles className="w-4 h-4"/></button>
                            <button onClick={() => setChatbot({...chatbot, rules: chatbot.rules.filter(r => r.id !== rule.id)})} className="text-red-500 bg-red-50 p-1.5 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50 px-3 py-1.5 rounded-xl inline-block mb-3">
                        <span className="text-[10px] font-bold text-slate-400 mr-2 uppercase tracking-wider">IF INCLUDES:</span>
                        <span className="text-xs text-purple-700 font-mono font-bold">{rule.keywords}</span>
                      </div>
                      <p className="text-sm text-slate-600 pl-3 border-l-4 border-purple-200 leading-relaxed font-mono bg-white">{rule.reply}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulator Phone Frame */}
              <div className="w-1/2 flex items-center justify-center p-4">
                 <div className="w-full max-w-sm h-full max-h-[700px] bg-slate-900 rounded-[3rem] p-3 shadow-2xl relative border-8 border-slate-800 flex flex-col">
                    <div className="absolute top-0 inset-x-0 h-6 flex justify-center">
                      <div className="w-1/3 h-5 bg-slate-800 rounded-b-xl"></div>
                    </div>
                    <div className="bg-slate-800 rounded-t-3xl pt-8 pb-3 px-4 text-center mt-2">
                       <div className="w-10 h-10 bg-gradient-to-tr from-emerald-400 to-cyan-400 rounded-full mx-auto flex items-center justify-center text-white font-bold text-sm shadow-lg mb-1">IA</div>
                       <h4 className="text-white font-bold text-sm">Bot Asistente</h4>
                       <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">En línea</p>
                    </div>
                    
                    <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#0d1418] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {chatMessages.map((m, idx) => (
                        <div key={idx} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-line shadow-sm ${
                            m.sender === "user" ? "bg-[#005c4b] text-white rounded-br-sm" : "bg-[#202c33] text-slate-100 rounded-bl-sm"
                          }`}>
                            {m.text}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-[#1f2c34] p-3 rounded-b-3xl">
                      <form onSubmit={handleSimSubmit} className="flex gap-2 bg-[#2a3942] rounded-full p-1 pl-4">
                        <input type="text" value={simInput} onChange={(e) => setSimInput(e.target.value)} placeholder="Mensaje..." className="flex-1 bg-transparent text-sm text-white focus:outline-none" />
                        <button type="submit" disabled={!simInput.trim()} className="bg-emerald-600 text-white p-2 rounded-full"><Send className="w-4 h-4 ml-0.5" /></button>
                      </form>
                      <button onClick={handleResetChatbotSim} className="w-full text-center mt-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-white">Reiniciar Simulación</button>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 4: BROADCAST */}
          {/* ========================================== */}
          {activeTab === "broadcast" && (
            <div className="animate-fade-in-up max-w-3xl mx-auto h-full flex flex-col justify-center">
              <div className="bg-white/80 backdrop-blur-xl border border-white rounded-[3rem] p-10 shadow-2xl shadow-slate-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-tr from-rose-500 to-orange-400 rounded-3xl shadow-lg flex items-center justify-center animate-float">
                    <Megaphone className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900">Blast Seguro</h3>
                    <p className="text-slate-500 font-medium mt-1">Difusión por Messenger a contactos que escribieron en las últimas 23 h (regla de 24 h de Meta).</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-black text-slate-700 block mb-2 uppercase tracking-widest">1. Selección de Audiencia</label>
                    <select value={broadcastAudience} onChange={(e) => setBroadcastAudience(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 text-slate-900 font-bold rounded-2xl p-4 focus:outline-none focus:border-rose-400 hover:border-slate-200 transition-all cursor-pointer">
                      <option value="leads_pending">Prospectos activos de Messenger (sin cerrados ni perdidos)</option>
                      <option value="all_leads">Todos los contactos de Messenger</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-black text-slate-700 block mb-2 uppercase tracking-widest">2. Mensaje Comercial</label>
                    <textarea rows={4} value={broadcastMessage} onChange={(e) => setBroadcastMessage(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 text-slate-800 font-mono rounded-2xl p-4 focus:outline-none focus:border-rose-400 transition-all resize-none" />
                  </div>

                  <div className="bg-rose-50/50 border-2 border-rose-100 p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex-1">
                      <h5 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-1">
                        <ShieldCheck className="w-5 h-5 text-emerald-500" /> Intervalo de Seguridad
                      </h5>
                      <p className="text-xs text-slate-500 font-medium">Pausa entre mensajes:<span className="font-bold text-rose-600">{broadcastDelay}s</span></p>
                    </div>
                    <input type="range" min={5} max={30} value={broadcastDelay} onChange={(e) => setBroadcastDelay(parseInt(e.target.value, 10))} className="w-48 accent-rose-500 cursor-ew-resize" />
                  </div>

                  {isBroadcasting && (
                    <div className="space-y-2 pt-2 animate-fade-in-up">
                      <div className="flex justify-between text-xs font-black text-slate-500 uppercase tracking-widest">
                        <span className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div> {activeBroadcast ? `Enviados ${activeBroadcast.sentCount}/${activeBroadcast.eligibleCount ?? 0}${activeBroadcast.failedCount ? ` · ${activeBroadcast.failedCount} fallidos` : ""}` : "Preparando..."}</span>
                        <span className="text-rose-600">{broadcastProgress}%</span>
                      </div>
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all duration-300" style={{ width: `${broadcastProgress}%` }}></div>
                      </div>
                    </div>
                  )}

                  <button onClick={handleStartBroadcast} disabled={isBroadcasting} className="w-full glow-button bg-slate-900 hover:bg-slate-800 text-white font-black text-sm py-4 rounded-2xl shadow-xl shadow-slate-900/20 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex justify-center items-center gap-3">
                    {isBroadcasting ? "Procesando Cola..." : <><Send className="w-5 h-5" /> Iniciar Blast Seguro</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal Overlay for Chatbot */}
      {editingRule && isEditingBot && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-up">
           <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl border border-white/50">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-slate-900">Editar Regla IA</h3>
                <button onClick={() => setEditingRule(null)} className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Nombre Identificador</label>
                  <input type="text" value={editingRule.name} onChange={e => setEditingRule({...editingRule, name: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-bold text-slate-900 rounded-2xl p-3.5 focus:border-purple-400 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Activadores (Keywords)</label>
                  <input type="text" value={editingRule.keywords} onChange={e => setEditingRule({...editingRule, keywords: e.target.value})} className="w-full bg-purple-50 border-2 border-purple-100 text-sm font-mono font-bold text-purple-700 rounded-2xl p-3.5 focus:border-purple-400 focus:outline-none" />
                  <p className="text-[10px] font-bold text-slate-400 mt-1.5 pl-2">Separar por comas. El bot ignora acentos y mayúsculas.</p>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Respuesta del Bot</label>
                  <textarea value={editingRule.reply} onChange={e => setEditingRule({...editingRule, reply: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-mono text-slate-800 rounded-2xl p-3.5 min-h-[100px] focus:border-purple-400 focus:outline-none" />
                </div>
              </div>
              <button 
                onClick={() => {
                  const isNew = !chatbot.rules.find(r => r.id === editingRule.id);
                  setChatbot({...chatbot, rules: isNew ? [...chatbot.rules, editingRule] : chatbot.rules.map(r => r.id === editingRule.id ? editingRule : r)});
                  setEditingRule(null);
                }} 
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black text-sm py-4 rounded-2xl mt-8 shadow-lg shadow-purple-500/30 transition-transform hover:-translate-y-1"
              >
                Guardar Regla
              </button>
           </div>
        </div>
      )}

      {/* New Template Modal */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-up">
          <div className="bg-white rounded-[2rem] w-full max-w-xl p-8 shadow-2xl border border-white/50">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-900">Nueva Plantilla</h3>
              <button onClick={() => setShowNewTemplateModal(false)} className="text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={handleSaveNewTemplate} className="space-y-5">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Título de Referencia</label>
                <input type="text" required value={newTpl.title} onChange={(e) => setNewTpl({ ...newTpl, title: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-bold text-slate-900 rounded-2xl p-3.5 focus:border-blue-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Etiqueta Categórica</label>
                  <select value={newTpl.category} onChange={(e) => setNewTpl({ ...newTpl, category: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-bold text-slate-900 rounded-2xl p-3.5 focus:border-blue-400 focus:outline-none">
                    <option value="Cotización">Cotización</option><option value="Objeciones">Objeciones</option><option value="Ubicación">Ubicación</option><option value="Cierre">Cierre</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Tags</label>
                  <input type="text" value={newTpl.tags} onChange={(e) => setNewTpl({ ...newTpl, tags: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-bold text-slate-900 rounded-2xl p-3.5 focus:border-blue-400 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Contenido Inteligente</label>
                <textarea rows={5} required value={newTpl.content} onChange={(e) => setNewTpl({ ...newTpl, content: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 text-sm font-mono text-slate-800 rounded-2xl p-4 focus:border-blue-400 focus:outline-none" />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-sm py-4 rounded-2xl mt-4 shadow-lg shadow-blue-500/30 transition-transform hover:-translate-y-1">
                Crear Plantilla
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
