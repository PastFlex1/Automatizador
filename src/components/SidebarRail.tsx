import React, { useState } from "react";
import {
  MessageSquare,
  Kanban,
  Package,
  Send,
  Plus,
  Sliders,
  ChevronDown,
  ArrowUpRight,
  ShieldCheck,
  Flame,
  Search,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Users,
  Bell,
  MessageCircle,
  Instagram,
  Phone,
  Sparkles,
  Share2,
  RefreshCw,
  Bot,
} from "lucide-react";
import { Lead, BusinessProfile } from "../types";

interface SidebarRailProps {
  currentTab: "inbox" | "pipeline" | "catalog" | "campaigns" | "content" | "social-seller";
  setCurrentTab: (tab: "inbox" | "pipeline" | "catalog" | "campaigns" | "content" | "social-seller") => void;
  leads: Lead[];
  selectedLeadId: string;
  onSelectLead: (lead: Lead) => void;
  onOpenSettings: () => void;
  onNewLeadClick: () => void;
  businessProfile: BusinessProfile;
  onSyncMessenger?: () => Promise<void>;
  isSyncingMessenger?: boolean;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({
  currentTab,
  setCurrentTab,
  leads,
  selectedLeadId,
  onSelectLead,
  onOpenSettings,
  onNewLeadClick,
  businessProfile,
  onSyncMessenger,
  isSyncingMessenger,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<"all" | "messenger" | "hot" | "won" | "whatsapp">("all");

  const totalPipelineValue = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
  const hotCount = leads.filter((l) => l.urgency === "hot").length;
  const wonCount = leads.filter((l) => l.status === "won_closed").length;

  const filteredLeads = leads.filter((lead) => {
    const matchSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.handleOrPhone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.notes && lead.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchSearch) return false;

    if (filterCategory === "messenger") return lead.channel === "messenger" || lead.channel === ("facebook" as any);
    if (filterCategory === "hot") return lead.urgency === "hot";
    if (filterCategory === "won") return lead.status === "won_closed";
    if (filterCategory === "whatsapp") return lead.channel === "whatsapp";

    return true;
  });


  const isInbox = currentTab === "inbox";

  return (
    <aside className={`${isInbox ? "w-full lg:w-[360px] xl:w-[400px] 2xl:w-[440px] flex-row" : "w-14 flex-col"} h-full bg-white text-slate-800 flex flex-shrink-0 select-none border-r border-slate-200/80 overflow-hidden`}>
      {/* 1. Slim Left Navigation Rail */}
      <div className="w-14 flex flex-col items-center justify-between py-3 border-r border-slate-100 bg-slate-50/50 h-full flex-shrink-0">
        {/* Top Logo */}
        <div className="flex flex-col items-center gap-4">
          <div
            onClick={() => setCurrentTab("inbox")}
            title="MetaCloser CRM"
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-200 cursor-pointer hover:scale-105 transition-transform"
          >
            <MessageSquare className="w-5 h-5" />
          </div>

          {/* Navigation Icons */}
          <nav className="flex flex-col items-center gap-2">
            <button
              onClick={() => setCurrentTab("inbox")}
              title="Bandeja de Cierre"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentTab === "inbox"
                  ? "bg-indigo-50 text-indigo-600 font-bold shadow-sm border border-indigo-100"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <MessageSquare className="w-5 h-5" />
            </button>

            <button
              onClick={() => setCurrentTab("pipeline")}
              title="Embudo de Ventas"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentTab === "pipeline"
                  ? "bg-indigo-50 text-indigo-600 font-bold shadow-sm border border-indigo-100"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <Kanban className="w-5 h-5" />
            </button>

            <button
              onClick={() => setCurrentTab("catalog")}
              title="Catálogo & Enlaces"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentTab === "catalog"
                  ? "bg-indigo-50 text-indigo-600 font-bold shadow-sm border border-indigo-100"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <Package className="w-5 h-5" />
            </button>

            <button
              onClick={() => setCurrentTab("campaigns")}
              title="WhatsApp & Automatizaciones"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentTab === "campaigns"
                  ? "bg-violet-50 text-violet-600 font-bold shadow-sm border border-violet-100"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <Send className="w-5 h-5" />
            </button>

            <button
              onClick={() => setCurrentTab("content")}
              title="Social (Meta Publisher)"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                currentTab === "content"
                  ? "bg-indigo-50 text-indigo-600 font-bold shadow-sm border border-indigo-100"
                  : "text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <Sparkles className="w-5 h-5" />
            </button>

            <button
              onClick={() => setCurrentTab("social-seller")}
              title="Social Seller AI (Marketplace & Omnicanal)"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                currentTab === "social-seller"
                  ? "bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-white font-bold shadow-md shadow-indigo-300 scale-105"
                  : "text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
              }`}
            >
              <Bot className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white shadow-xs"></span>
            </button>

            <button
              onClick={onNewLeadClick}
              title="Nuevo Prospecto"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-indigo-600 bg-white hover:bg-indigo-50 transition-all border border-indigo-100 mt-2 shadow-sm shadow-indigo-100"
            >
              <Plus className="w-5 h-5" />
            </button>
          </nav>
        </div>

        {/* Bottom Profile & Settings */}
        <div className="flex flex-col items-center gap-2.5">
          <button
            onClick={onOpenSettings}
            title="Ajustes"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all"
          >
            <Sliders className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 ring-2 ring-slate-100"
          >
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </div>

      {/* 2. Main Lead List Column - only shown in inbox tab */}
      {isInbox && (
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Header Area */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-3 px-1 font-display">Chats</h2>
          {/* Eliminated delicate metrics for cleaner chat list look */}

          {/* Search Bar with Sync Button */}
          <div className="flex items-center gap-1.5 mb-3 bg-slate-100 rounded-lg p-1.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Busca un chat o contacto"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent pl-8 pr-3 py-1 text-sm text-slate-800 placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
            {onSyncMessenger && (
              <button
                onClick={() => onSyncMessenger()}
                disabled={isSyncingMessenger}
                title="Sincronizar"
                className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-all flex-shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingMessenger ? "animate-spin text-indigo-600" : ""}`} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-[11px]">
            <button
              onClick={() => setFilterCategory("all")}
              className={`px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap border ${
                filterCategory === "all"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterCategory("hot")}
              className={`px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap border ${
                filterCategory === "hot"
                  ? "bg-amber-50 text-amber-700 border-amber-200 shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              🔥 Calientes
            </button>
            <button
              onClick={() => setFilterCategory("messenger")}
              className={`px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap border ${
                filterCategory === "messenger"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Messenger
            </button>
            <button
              onClick={() => setFilterCategory("whatsapp")}
              className={`px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap border flex items-center gap-1 ${
                filterCategory === "whatsapp"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                  : "bg-white text-slate-500 border-slate-200 hover:bg-emerald-50"
              }`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              WhatsApp
            </button>
          </div>
        </div>


        {/* Leads Scrollable List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
          {filteredLeads.map((lead) => {
            const isSelected = lead.id === selectedLeadId;

            return (
              <div
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className={`cursor-pointer transition-all flex items-center pl-3 ${
                  isSelected
                    ? "bg-[#f0f2f5]"
                    : "bg-white hover:bg-[#f5f6f6]"
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0 py-3 pr-3">
                  <img
                    src={lead.avatar}
                    alt={lead.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  {lead.unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center absolute -bottom-0.5 -right-0.5 text-[10px] font-bold border-2 border-white shadow-sm shadow-indigo-200">
                      {lead.unreadCount}
                    </span>
                  )}
                </div>

                {/* Content & border */}
                <div className="flex-1 py-3 pr-4 border-b border-slate-100 flex flex-col justify-center min-w-0 h-full">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-[15px] text-slate-900 truncate pr-2">
                      {lead.name}
                    </span>
                    <span className={`text-[12px] flex-shrink-0 ${lead.unreadCount > 0 ? "text-[#25D366] font-bold" : "text-slate-400"}`}>
                      {lead.lastActivity}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] text-slate-500 truncate flex-1 flex items-center gap-1">
                      {lead.status === "won_closed" && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />}
                      <span className="truncate">{lead.lastMessage || "Conversación iniciada"}</span>
                    </div>
                    {lead.urgency === "hot" && lead.status !== "won_closed" && (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-500" title="Alta urgencia"></span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </aside>
  );
};


