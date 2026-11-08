import React, { useState } from "react";
import {
  ArrowUpRight,
  Check,
  X,
  FileText,
  Send,
  Download,
  Sparkles,
  Bot,
  CreditCard,
  Copy,
  ShieldCheck,
  CheckCircle2,
  Package,
  Layers,
  Flame,
} from "lucide-react";
import { Lead, Product, BusinessProfile, AICloseStrategyResponse } from "../types";

interface RightBentoPanelProps {
  lead: Lead;
  products: Product[];
  businessProfile: BusinessProfile;
  onSendMessage: (text: string, type?: any, metaData?: any) => void;
  onOpenPaymentModal: () => void;
  aiStrategy: AICloseStrategyResponse | null;
  isLoadingAi: boolean;
  onGenerateAiStrategy: (technique?: string) => void;
}

export const RightBentoPanel: React.FC<RightBentoPanelProps> = ({
  lead,
  products,
  businessProfile,
  onSendMessage,
  onOpenPaymentModal,
  aiStrategy,
  isLoadingAi,
  onGenerateAiStrategy,
}) => {
  const [negotiationStage, setNegotiationStage] = useState<"negotiation" | "close">("negotiation");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentProduct =
    products.find((p) => p.id === lead.interestProductId) || products[0];

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSendAiText = (text: string) => {
    onSendMessage(text, "text");
  };

  return (
    <aside className="w-full lg:w-[320px] xl:w-[360px] 2xl:w-[400px] h-full overflow-y-auto custom-scrollbar flex flex-col gap-3.5 flex-shrink-0 pr-1 pb-2">
      {/* 1. Card 1: Lead Deal & Product Card */}
      <div className="bg-white text-slate-800 rounded-3xl p-5 flex flex-col justify-between shadow-sm border border-slate-200/80 relative overflow-hidden">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                <span>Producto de Interés</span>
              </div>
              <h3 className="font-bold text-sm leading-snug text-slate-900 mt-1 max-w-[200px] font-display">
                {currentProduct?.name || "Servicio / Producto Principal"}
              </h3>
            </div>
            <div className="w-7 h-7 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Deal Value Pill */}
          <div className="mt-3.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Valor Estimado de la Oportunidad
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-display mt-0.5">
              ${(lead.estimatedValue || currentProduct?.price || 0).toLocaleString()}{" "}
              <span className="text-xs font-bold text-slate-500">{businessProfile.defaultCurrency}</span>
            </div>
          </div>
        </div>

        {/* Qualification Checklist */}
        <div className="space-y-1.5 mt-3.5 pt-3 border-t border-slate-100 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Contacto verificado por {lead.channel.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Propuesta comercial preliminar enviada</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <span className="text-amber-500 font-bold">⚡</span>
            <span className="truncate">{lead.detectedObjection || "Pendiente de formalizar medio de pago"}</span>
          </div>
        </div>
      </div>

      {/* 2. Card 2: AI Advisor & Closing Strategy */}
      <div className="bg-white text-slate-800 rounded-3xl p-5 flex flex-col justify-between shadow-sm border border-slate-200/80 relative overflow-hidden flex-1 min-h-[340px]">
        <div>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider flex items-center gap-1">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
                <span>Asesor Comercial AI</span>
              </div>
              <h3 className="font-bold text-sm leading-tight text-slate-900 mt-0.5 font-display">
                Estrategia de Cierre
              </h3>
            </div>

            <button
              onClick={() => onGenerateAiStrategy()}
              disabled={isLoadingAi}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-60"
            >
              <Sparkles className="w-3 h-3 fill-white" />
              <span>{isLoadingAi ? "Generando..." : "Generar AI"}</span>
            </button>
          </div>

          {/* Quick Payment Link Box */}
          <div
            onClick={onOpenPaymentModal}
            className="flex items-center justify-between bg-indigo-50/60 hover:bg-indigo-50 p-2.5 rounded-2xl mt-3 cursor-pointer transition-all border border-indigo-100"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>Generar Checkout de Pago Directo</span>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
          </div>

          {/* Key Selling Points / Objection Handling Summary */}
          <div className="mt-3.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Puntos Fuertes para el Cierre
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 font-medium">
              <div className="flex items-center gap-2">
                <span className="text-indigo-600 font-bold">✓</span>
                <span>Garantía de satisfacción y soporte dedicado</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-indigo-600 font-bold">✓</span>
                <span>Métodos de pago flexibles y cuotas</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Quick Response Callout (if generated) */}
        {aiStrategy && (
          <div className="bg-slate-50 border border-indigo-200/80 p-3 rounded-2xl mt-3 text-xs space-y-2">
            <div className="flex items-center justify-between text-[10px] text-indigo-700 font-bold uppercase tracking-wider">
              <span>{aiStrategy.recommendedTechnique}</span>
              <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                {aiStrategy.intentScore}% Éxito
              </span>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed italic">
              "{aiStrategy.primaryResponse}"
            </p>
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60">
              <button
                onClick={() => handleCopy(aiStrategy.primaryResponse, "ai-resp")}
                className="p-1 text-slate-400 hover:text-slate-700"
                title="Copiar"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleSendAiText(aiStrategy.primaryResponse)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all"
              >
                <Send className="w-2.5 h-2.5" />
                <span>Enviar al Chat</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Action Button */}
        <div className="mt-3 pt-2">
          <button
            onClick={() => onSendMessage(`¡Hola! Tengo lista tu propuesta especial con un valor preferencial de $${(lead.estimatedValue || currentProduct?.price || 0).toLocaleString()} ${businessProfile.defaultCurrency}. ¿Te gustaría que formalicemos hoy?`, "text")}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-full text-xs font-bold flex items-center justify-between shadow-sm transition-all"
          >
            <span className="flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-slate-300" />
              <span>Enviar Propuesta Rápida</span>
            </span>
            <Check className="w-3.5 h-3.5 text-indigo-400" />
          </button>
        </div>
      </div>
    </aside>
  );
};


