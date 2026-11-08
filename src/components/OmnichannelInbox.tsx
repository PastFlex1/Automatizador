import React, { useState } from "react";
import {
  Search,
  Filter,
  Flame,
  MessageCircle,
  Plus,
  TrendingUp,
  Tag,
  CheckCircle,
  Clock,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Lead, MetaChannel, LeadStatus } from "../types";
import { formatConversationTime } from "../utils/date-formatter";

interface OmnichannelInboxProps {
  leads: Lead[];
  selectedLead: Lead | null;
  onSelectLead: (lead: Lead) => void;
  onNewLeadClick: () => void;
  currency: string;
  onSyncMessenger?: () => Promise<void>;
  isSyncingMessenger?: boolean;
}

export const OmnichannelInbox: React.FC<OmnichannelInboxProps> = ({
  leads,
  selectedLead,
  onSelectLead,
  onNewLeadClick,
  currency,
  onSyncMessenger,
  isSyncingMessenger,
}) => {

  const [channelFilter, setChannelFilter] = useState<"all" | MetaChannel>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "hot" | "warm" | "won_closed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLeads = leads.filter((lead) => {
    // Channel filter
    if (channelFilter !== "all" && lead.channel !== channelFilter && !(channelFilter === "messenger" && lead.channel === ("facebook" as any))) return false;

    // Urgency / Status filter
    if (urgencyFilter === "hot" && (lead.urgency !== "hot" || lead.status === "won_closed")) return false;
    if (urgencyFilter === "warm" && lead.urgency !== "warm") return false;
    if (urgencyFilter === "won_closed" && lead.status !== "won_closed") return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = lead.name.toLowerCase().includes(q);
      const matchHandle = lead.handleOrPhone.toLowerCase().includes(q);
      const matchTags = lead.tags.some((t) => t.toLowerCase().includes(q));
      const matchMsg = lead.lastMessage.toLowerCase().includes(q);
      if (!matchName && !matchHandle && !matchTags && !matchMsg) return false;
    }

    return true;
  });

  const getChannelBadge = (channel: MetaChannel) => {
    switch (channel) {
      case "whatsapp":
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            WhatsApp
          </span>
        );
      case "instagram":
        return (
          <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 text-[10px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
            Instagram DM
          </span>
        );
      case "messenger":
        return (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Messenger
          </span>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case "ready_to_close":
        return (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400" />
            Listo para Cierre
          </span>
        );
      case "negotiating":
        return (
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium">
            En Negociación
          </span>
        );
      case "proposal_sent":
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-medium">
            Propuesta Enviada
          </span>
        );
      case "advised":
        return (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-medium">
            En Asesoramiento
          </span>
        );
      case "won_closed":
        return (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Venta Pagada 💰
          </span>
        );
      case "new_lead":
        return (
          <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-medium">
            Lead Nuevo
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
            {status}
          </span>
        );
    }
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-[calc(100vh-108px)]">
      {/* Top Header & New Lead Button */}
      <div className="p-3.5 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-slate-200 text-sm">Bandeja Meta</h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
              {filteredLeads.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onSyncMessenger && (
              <button
                onClick={() => onSyncMessenger()}
                disabled={isSyncingMessenger}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                title="Sincronizar conversaciones reales de Facebook Messenger e Instagram"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMessenger ? "animate-spin text-blue-400" : "text-blue-300"}`} />
                <span className="hidden sm:inline">{isSyncingMessenger ? "Sincronizando..." : "Sincronizar"}</span>
              </button>
            )}

            <button
              onClick={onNewLeadClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all"
              title="Crear o simular nuevo prospecto en Meta"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Lead</span>
            </button>
          </div>
        </div>


        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, Facebook ID o mensaje..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Channel Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
          <button
            onClick={() => setChannelFilter("all")}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              channelFilter === "all"
                ? "bg-slate-700 text-white font-semibold"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
            }`}
          >
            Todos ({leads.length})
          </button>
          <button
            onClick={() => setChannelFilter("messenger")}
            className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all ${
              channelFilter === "messenger"
                ? "bg-blue-600 text-white font-semibold"
                : "bg-blue-950/30 text-blue-400 hover:bg-blue-900/40"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Facebook Messenger
          </button>
        </div>

        {/* Urgency / Status Filters */}
        <div className="flex items-center gap-1 text-[11px] pt-1 border-t border-slate-800/60">
          <span className="text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3" />
            Filtro:
          </span>
          <button
            onClick={() => setUrgencyFilter("all")}
            className={`px-2 py-0.5 rounded ${
              urgencyFilter === "all" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setUrgencyFilter("hot")}
            className={`px-2 py-0.5 rounded flex items-center gap-1 ${
              urgencyFilter === "hot"
                ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                : "text-slate-400 hover:text-amber-300"
            }`}
          >
            🔥 Calientes
          </button>
          <button
            onClick={() => setUrgencyFilter("won_closed")}
            className={`px-2 py-0.5 rounded flex items-center gap-1 ${
              urgencyFilter === "won_closed"
                ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40"
                : "text-slate-400 hover:text-emerald-300"
            }`}
          >
            💰 Cerrados
          </button>
        </div>
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {filteredLeads.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-xs">No se encontraron prospectos con estos filtros.</p>
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const isSelected = selectedLead?.id === lead.id;

            return (
              <div
                key={lead.id}
                id={`lead-item-${lead.id}`}
                onClick={() => onSelectLead(lead)}
                className={`p-3.5 cursor-pointer transition-all relative ${
                  isSelected
                    ? "bg-slate-800/90 border-l-4 border-l-emerald-500"
                    : "hover:bg-slate-800/40"
                }`}
              >
                {/* Header info */}
                <div className="flex items-start gap-3">
                  <div className="relative flex-shrink-0">
                    <img
                      src={lead.avatar}
                      alt={lead.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-700"
                    />
                    <div className="absolute -bottom-1 -right-1">
                      {lead.channel === "whatsapp" && (
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-white font-bold shadow">
                          W
                        </div>
                      )}
                      {lead.channel === "instagram" && (
                        <div className="w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[9px] text-white font-bold shadow">
                          IG
                        </div>
                      )}
                      {lead.channel === "messenger" && (
                        <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold shadow">
                          M
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-semibold text-slate-100 text-xs truncate">
                        {lead.name}
                      </h3>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        {formatConversationTime(lead.lastActivity)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate mb-1">
                      <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800/60 px-1.5 py-0.2 rounded font-medium">
                        {lead.pageName || "APM inox 1"}
                      </span>
                      <span>•</span>
                      <span className="text-slate-400 font-mono text-[10px]">{lead.handleOrPhone}</span>
                    </div>

                    {/* Last message snippet */}
                    <p className="text-xs text-slate-300 line-clamp-1 mb-2">
                      {lead.lastMessage}
                    </p>

                    {/* Metadata bar */}
                    <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-slate-800/50">
                      {getStatusBadge(lead.status)}

                      <div className="flex items-center gap-2">
                        {/* Intent Score */}
                        <div
                          className="flex items-center gap-1 text-[10px] font-semibold text-slate-300"
                          title="Score de Intención de Compra"
                        >
                          <TrendingUp className="w-3 h-3 text-indigo-400" />
                          <span>{lead.intentScore}%</span>
                        </div>

                        {/* Estimated Deal Value */}
                        <div className="font-bold text-xs text-emerald-400">
                          ${lead.estimatedValue} {currency}
                        </div>
                      </div>
                    </div>

                    {/* Tags preview */}
                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {lead.tags.slice(0, 2).map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800"
                          >
                            {t}
                          </span>
                        ))}
                        {lead.tags.length > 2 && (
                          <span className="text-[9px] text-slate-500 font-medium">
                            +{lead.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Unread badge */}
                {lead.unreadCount > 0 && (
                  <span className="absolute top-3.5 right-3 w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
