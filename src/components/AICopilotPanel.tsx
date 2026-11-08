import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Flame,
  TrendingUp,
  AlertTriangle,
  Send,
  Copy,
  Check,
  Mic,
  Zap,
  ChevronRight,
  RefreshCw,
  Radio,
} from "lucide-react";
import {
  Lead,
  Product,
  BusinessProfile,
  AICloseStrategyResponse,
} from "../types";

interface AICopilotPanelProps {
  lead: Lead;
  products: Product[];
  businessProfile: BusinessProfile;
  onApplyResponseToChat: (text: string) => void;
  onSimulateIncomingCustomerMessage: (buyerType: string) => Promise<void>;
  isSimulating: boolean;
}

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  lead,
  products,
  businessProfile,
  onApplyResponseToChat,
  onSimulateIncomingCustomerMessage,
  isSimulating,
}) => {
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<AICloseStrategyResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"primary" | "consultative" | "urgency" | "voice">("primary");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [buyerType, setBuyerType] = useState("price_haggler");

  // Fetch advice when lead changes or when user triggers
  const fetchAdvice = async (technique?: string) => {
    setLoading(true);
    try {
      const product = products.find((p) => p.id === lead.interestProductId) || products[0];

      const res = await fetch("/api/ai/advisor-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: lead.name,
          channel: lead.channel,
          businessProfile,
          productContext: product,
          conversationHistory: lead.conversationHistory.slice(-6),
          specificTechnique: technique,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setStrategy(data.data);
      }
    } catch (err) {
      console.error("Error fetching AI advice:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvice();
  }, [lead.id]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="w-full lg:w-96 bg-white border border-slate-200/80 rounded-3xl flex flex-col h-[calc(100vh-108px)] overflow-y-auto shadow-sm">
      {/* Copilot Header */}
      <div className="p-3.5 border-b border-slate-100 bg-white sticky top-0 z-10 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5 font-display">
                Asesor AI de Cierre
                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded border border-indigo-200/60">
                  Gemini
                </span>
              </h2>
              <p className="text-[10px] text-slate-500 font-medium">Estrategia y neuro-ventas en tiempo real</p>
            </div>
          </div>

          <button
            onClick={() => fetchAdvice()}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Recalcular análisis"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>

        {/* Intent & Temperature Gauge */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
              <span>Prob. Cierre</span>
              <TrendingUp className="w-3 h-3 text-indigo-600" />
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-base font-black text-slate-900 font-display">
                {strategy?.intentScore || lead.intentScore}%
              </span>
              <span className="text-[10px] text-slate-500">score</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (strategy?.intentScore || lead.intentScore) > 75
                    ? "bg-emerald-500"
                    : (strategy?.intentScore || lead.intentScore) > 50
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${strategy?.intentScore || lead.intentScore}%` }}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-between shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
              <span>Temperatura</span>
              <Flame className="w-3 h-3 text-amber-500" />
            </div>
            <div className="mt-1">
              {(strategy?.buyerTemperature || lead.urgency) === "hot" ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  🔥 Caliente
                </span>
              ) : (strategy?.buyerTemperature || lead.urgency) === "warm" ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                  ⚡ Tibio
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-md">
                  ❄️ Frío
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-1 truncate">
              {strategy?.psychologicalTrigger || "Anclaje de valor"}
            </p>
          </div>
        </div>
      </div>

      {/* Detected Objections */}
      <div className="p-3.5 border-b border-slate-100 space-y-2 bg-slate-50/50">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Objeciones Detectadas
          </span>
          <span className="text-[10px] text-slate-500 font-medium">análisis</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {strategy?.detectedObjections && strategy.detectedObjections.length > 0 ? (
            strategy.detectedObjections.map((obj, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-800 flex items-center gap-1 font-medium"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {obj}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500 italic">
              {lead.detectedObjection || "Evaluando disponibilidad y detalles del servicio."}
            </span>
          )}
        </div>
      </div>

      {/* 1-Click Closing Tactics Selector */}
      <div className="p-3.5 border-b border-slate-100 space-y-2">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 font-display">
          <Zap className="w-3.5 h-3.5 text-indigo-600" />
          Técnicas de Cierre con 1 Clic
        </span>

        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button
            onClick={() => fetchAdvice("Cierre de Doble Alternativa (ej: ¿te va mejor hoy o mañana?)")}
            className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 text-left text-slate-700 hover:text-indigo-800 transition-all font-medium flex items-center justify-between shadow-2xs"
          >
            <span>🎯 Doble Opción</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>

          <button
            onClick={() => fetchAdvice("Manejo de Objeción de Precio con Anclaje de Retorno de Inversión")}
            className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 text-left text-slate-700 hover:text-indigo-800 transition-all font-medium flex items-center justify-between shadow-2xs"
          >
            <span>💰 Manejo Precio</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>

          <button
            onClick={() => fetchAdvice("Cierre por Urgencia y Escasez de Cupos")}
            className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 text-left text-slate-700 hover:text-indigo-800 transition-all font-medium flex items-center justify-between shadow-2xs"
          >
            <span>⏳ Urgencia</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>

          <button
            onClick={() => fetchAdvice("Inversión de Riesgo con Garantía de Satisfacción 100%")}
            className="p-2 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-200 text-left text-slate-700 hover:text-indigo-800 transition-all font-medium flex items-center justify-between shadow-2xs"
          >
            <span>🛡️ Garantía 100%</span>
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Generated Recommendation & Scripts Tabs */}
      <div className="p-3.5 flex-1 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 font-display">
            Respuesta Sugerida por el Asesor
          </span>
          {strategy?.recommendedTechnique && (
            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200">
              {strategy.recommendedTechnique}
            </span>
          )}
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px]">
          <button
            onClick={() => setActiveTab("primary")}
            className={`flex-1 py-1 rounded-lg font-bold transition-all ${
              activeTab === "primary"
                ? "bg-white text-indigo-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Principal ⭐
          </button>
          <button
            onClick={() => setActiveTab("consultative")}
            className={`flex-1 py-1 rounded-lg font-bold transition-all ${
              activeTab === "consultative"
                ? "bg-white text-indigo-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Consultiva
          </button>
          <button
            onClick={() => setActiveTab("urgency")}
            className={`flex-1 py-1 rounded-lg font-bold transition-all ${
              activeTab === "urgency"
                ? "bg-white text-indigo-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Urgencia
          </button>
          <button
            onClick={() => setActiveTab("voice")}
            className={`flex-1 py-1 rounded-lg font-bold transition-all flex items-center justify-center gap-0.5 ${
              activeTab === "voice"
                ? "bg-white text-indigo-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>Audio</span>
          </button>
        </div>

        {/* Response Box */}
        {loading ? (
          <div className="p-8 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-200">
            <Sparkles className="w-6 h-6 mx-auto text-indigo-600 animate-spin" />
            <p className="text-xs text-slate-600 font-medium">Analizando contexto de venta con Gemini...</p>
          </div>
        ) : (
          <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200 space-y-3 shadow-2xs">
            <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
              {activeTab === "primary" && (strategy?.primaryResponse || "Generando respuesta...")}
              {activeTab === "consultative" && (strategy?.alternativeConsultative || "Generando variante consultiva...")}
              {activeTab === "urgency" && (strategy?.alternativeUrgency || "Generando variante de urgencia...")}
              {activeTab === "voice" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-purple-700 font-bold">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Guión sugerido para nota de voz:</span>
                  </div>
                  <p className="italic text-slate-700">
                    "{strategy?.voiceNoteScript || "Hola, te grabo este audio rápido..."}"
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons on generated copy */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 gap-2">
              <button
                onClick={() => {
                  const textToCopy =
                    activeTab === "primary"
                      ? strategy?.primaryResponse
                      : activeTab === "consultative"
                      ? strategy?.alternativeConsultative
                      : activeTab === "urgency"
                      ? strategy?.alternativeUrgency
                      : strategy?.voiceNoteScript;
                  handleCopy(textToCopy || "", activeTab);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors shadow-2xs"
              >
                {copiedKey === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copiar</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  const textToApply =
                    activeTab === "primary"
                      ? strategy?.primaryResponse
                      : activeTab === "consultative"
                      ? strategy?.alternativeConsultative
                      : activeTab === "urgency"
                      ? strategy?.alternativeUrgency
                      : strategy?.voiceNoteScript;
                  if (textToApply) onApplyResponseToChat(textToApply);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xs transition-all active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Pegar en Chat</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live Client Persona Simulator (Testing & Practice Ground) */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-100 space-y-2 mt-auto">
        <div className="flex items-center justify-between text-xs font-bold text-slate-900 font-display">
          <span className="flex items-center gap-1.5 text-indigo-600">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Simulador de Prospectos Meta
          </span>
          <span className="text-[10px] text-slate-500 font-medium">Test en vivo</span>
        </div>

        <p className="text-[11px] text-slate-500">
          Simula que este prospecto envía un mensaje para probar tus tácticas de respuesta.
        </p>

        <div className="flex items-center gap-2">
          <select
            value={buyerType}
            onChange={(e) => setBuyerType(e.target.value)}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
          >
            <option value="price_haggler">💰 Pide descuento o precio</option>
            <option value="skeptic">🛡️ Escéptico (pide pruebas)</option>
            <option value="busy_executive">⚡ Ejecutivo (quiere link directo)</option>
            <option value="ready_buyer">🎯 Listo para pagar ya</option>
            <option value="comparison_shopper">🔍 Comparando alternativas</option>
          </select>

          <button
            onClick={() => onSimulateIncomingCustomerMessage(buyerType)}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1 whitespace-nowrap active:scale-95"
          >
            {isSimulating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Simular</span>
          </button>
        </div>
      </div>
    </div>
  );
};

