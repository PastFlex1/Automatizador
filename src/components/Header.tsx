import React from "react";
import {
  MessageSquare,
  Kanban,
  Package,
  Send,
  Sliders,
  Sparkles,
  Zap,
  DollarSign,
  TrendingUp,
  Flame,
  Bot,
  Plus,
  Search,
} from "lucide-react";
import { BusinessProfile, Lead } from "../types";

interface HeaderProps {
  currentTab: "inbox" | "pipeline" | "catalog" | "campaigns" | "content";
  setCurrentTab: (tab: "inbox" | "pipeline" | "catalog" | "campaigns" | "content") => void;
  businessProfile: BusinessProfile;
  setBusinessProfile: React.Dispatch<React.SetStateAction<BusinessProfile>>;
  leads: Lead[];
  onOpenSettings: () => void;
  onNewLeadClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  businessProfile,
  setBusinessProfile,
  leads,
  onOpenSettings,
  onNewLeadClick,
}) => {
  // Dynamic stats
  const totalClosedRevenue = leads
    .filter((l) => l.status === "won_closed")
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const hotLeadsCount = leads.filter(
    (l) => l.urgency === "hot" && l.status !== "won_closed" && l.status !== "lost"
  ).length;

  const totalWon = leads.filter((l) => l.status === "won_closed").length;
  const conversionRate = leads.length > 0 ? Math.round((totalWon / leads.length) * 100) : 0;
  const unreadTotal = leads.reduce((sum, l) => sum + (l.unreadCount || 0), 0);

  const toggleAutoPilot = () => {
    setBusinessProfile((prev) => ({
      ...prev,
      autoPilotMode: !prev.autoPilotMode,
    }));
  };

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 select-none">
      {/* Top Bar */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 text-xs">
        {/* Left: Brand Identity & Connected Meta channels */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center font-bold text-white shadow-sm shadow-indigo-200">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm flex items-center gap-2 font-display">
                {businessProfile.businessName}
                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
                  {businessProfile.niche}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">CRM Comercial & Asesor Inteligente Meta</p>
            </div>
          </div>

          {/* Meta Channels Status Badges */}
          <div className="hidden lg:flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium text-[11px]"
              title="WhatsApp Cloud API Conectado"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>WhatsApp Direct</span>
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-medium text-[11px]"
              title="Instagram Direct Conectado"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>Instagram DM</span>
            </div>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-medium text-[11px]"
              title="Messenger Conectado"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
              <span>Messenger</span>
            </div>
          </div>
        </div>

        {/* Right: Metrics & Autopilot Switch */}
        <div className="flex items-center gap-3">
          {/* Quick Metrics */}
          <div className="hidden sm:flex items-center gap-3.5 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-slate-500 text-[11px]">Ventas:</span>
              <span className="font-bold text-slate-900 text-xs">
                ${totalClosedRevenue.toLocaleString()} {businessProfile.defaultCurrency}
              </span>
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-slate-500 text-[11px]">Calientes:</span>
              <span className="font-bold text-slate-900 text-xs">{hotLeadsCount}</span>
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-slate-500 text-[11px]">Cierre:</span>
              <span className="font-bold text-slate-900 text-xs">{conversionRate}%</span>
            </div>
          </div>

          {/* Auto-Pilot Toggle */}
          <button
            onClick={toggleAutoPilot}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              businessProfile.autoPilotMode
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
            title="Activar/Desactivar asesoramiento y respuestas automáticas de cierre con IA"
          >
            <Bot className={`w-3.5 h-3.5 ${businessProfile.autoPilotMode ? "animate-pulse" : "text-slate-500"}`} />
            <span>
              {businessProfile.autoPilotMode ? "Copiloto AI: Activo" : "Copiloto AI: Manual"}
            </span>
          </button>

          {/* New Lead Button */}
          {onNewLeadClick && (
            <button
              onClick={onNewLeadClick}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nuevo Prospecto</span>
            </button>
          )}

          {/* Business Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors border border-slate-200/80"
            title="Ajustes de Negocio y Personalidad de Cierre"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Navigation Segmented Bar */}
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between py-1.5">
        <div className="bg-slate-100/90 p-1 rounded-xl flex items-center gap-1 border border-slate-200/70">
          <button
            id="tab-inbox"
            onClick={() => setCurrentTab("inbox")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              currentTab === "inbox"
                ? "bg-white text-slate-900 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-900 font-medium"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Bandeja & Asesoría Omnicanal</span>
            {unreadTotal > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] bg-rose-500 text-white font-bold rounded-full">
                {unreadTotal}
              </span>
            )}
          </button>

          <button
            id="tab-pipeline"
            onClick={() => setCurrentTab("pipeline")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              currentTab === "pipeline"
                ? "bg-white text-slate-900 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-900 font-medium"
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Embudo & Pipeline de Cierres</span>
          </button>

          <button
            id="tab-catalog"
            onClick={() => setCurrentTab("catalog")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              currentTab === "catalog"
                ? "bg-white text-slate-900 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-900 font-medium"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catálogo & Links de Pago</span>
          </button>

          <button
            id="tab-campaigns"
            onClick={() => setCurrentTab("campaigns")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              currentTab === "campaigns"
                ? "bg-white text-slate-900 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-900 font-medium"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Campañas & Retargeting Meta</span>
          </button>

          <button
            id="tab-content"
            onClick={() => setCurrentTab("content")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap ${
              currentTab === "content"
                ? "bg-white text-slate-900 font-bold shadow-sm"
                : "text-slate-600 hover:text-slate-900 font-medium"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Publicaciones & Redes Meta</span>
          </button>
        </div>

        {/* Tone indicator */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span>Tono del Asesor: <strong className="text-slate-800 font-medium capitalize">{businessProfile.advisorTone.replace('_', ' ')}</strong></span>
        </div>
      </div>
    </header>
  );
};


