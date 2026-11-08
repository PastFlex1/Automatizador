import React from "react";
import {
  ArrowRight,
  ArrowLeft,
  MessageCircle,
  Plus,
  Flame,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Lead, LeadStatus, BusinessProfile } from "../types";

interface PipelineKanbanProps {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onUpdateLeadStatus: (leadId: string, newStatus: LeadStatus) => void;
  businessProfile: BusinessProfile;
  onNewLeadClick: () => void;
}

const STAGES: { id: LeadStatus; title: string; badgeColor: string; bgHeader: string }[] = [
  { id: "new_lead", title: "1. Nuevo Lead", badgeColor: "bg-slate-100 text-slate-700", bgHeader: "bg-slate-50" },
  { id: "qualifying", title: "2. Calificación", badgeColor: "bg-blue-50 text-blue-700", bgHeader: "bg-blue-50/50" },
  { id: "advised", title: "3. Asesoría", badgeColor: "bg-indigo-50 text-indigo-700", bgHeader: "bg-indigo-50/50" },
  { id: "proposal_sent", title: "4. Propuesta", badgeColor: "bg-amber-50 text-amber-800", bgHeader: "bg-amber-50/50" },
  { id: "negotiating", title: "5. Negociación", badgeColor: "bg-orange-50 text-orange-800", bgHeader: "bg-orange-50/50" },
  { id: "ready_to_close", title: "6. Por Cerrar", badgeColor: "bg-emerald-50 text-emerald-800", bgHeader: "bg-emerald-50/50" },
  { id: "won_closed", title: "7. Venta Ganada ✨", badgeColor: "bg-emerald-600 text-white font-bold", bgHeader: "bg-emerald-50" },
];

export const PipelineKanban: React.FC<PipelineKanbanProps> = ({
  leads,
  onSelectLead,
  onUpdateLeadStatus,
  businessProfile,
  onNewLeadClick,
}) => {
  const totalPipelineValue = leads
    .filter((l) => l.status !== "won_closed" && l.status !== "lost")
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const totalWonValue = leads
    .filter((l) => l.status === "won_closed")
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const handleQuickWin = (leadId: string) => {
    onUpdateLeadStatus(leadId, "won_closed");
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10B981", "#6366F1", "#F59E0B", "#3B82F6"],
      });
    } catch (e) {}
  };

  const getNextStage = (current: LeadStatus): LeadStatus | null => {
    const idx = STAGES.findIndex((s) => s.id === current);
    if (idx >= 0 && idx < STAGES.length - 1) {
      return STAGES[idx + 1].id;
    }
    return null;
  };

  const getPrevStage = (current: LeadStatus): LeadStatus | null => {
    const idx = STAGES.findIndex((s) => s.id === current);
    if (idx > 0) {
      return STAGES[idx - 1].id;
    }
    return null;
  };

  return (
    <div className="flex-1 w-full h-full bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 md:p-6 shadow-sm border border-slate-200/80 flex flex-col overflow-hidden">
      {/* Top Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight font-display">
            Pipeline Comercial & Ventas
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Flujo visual de oportunidades desde primer contacto hasta el cierre y cobro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="bg-slate-50 border border-slate-200/80 px-2.5 sm:px-3.5 py-1.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs">
            <span className="text-slate-500 font-medium">Negociación:</span>{" "}
            <strong className="text-slate-900 font-bold font-display ml-1">
              ${totalPipelineValue.toLocaleString()} {businessProfile.defaultCurrency}
            </strong>
          </div>

          <div className="bg-emerald-50 border border-emerald-200/80 px-2.5 sm:px-3.5 py-1.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs">
            <span className="text-emerald-700 font-medium">Ganadas:</span>{" "}
            <strong className="text-emerald-800 font-bold font-display ml-1">
              ${totalWonValue.toLocaleString()} {businessProfile.defaultCurrency}
            </strong>
          </div>

          <button
            onClick={onNewLeadClick}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Nuevo Lead</span>
          </button>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-x-auto pt-3 sm:pt-4 flex gap-3 sm:gap-3.5 custom-scrollbar pb-2">
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.status === stage.id);
          const stageValue = stageLeads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

          return (
            <div
              key={stage.id}
              className="w-64 sm:w-72 flex-shrink-0 flex flex-col bg-slate-50/80 rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs"
            >
              {/* Column Header */}
              <div className={`p-3 border-b border-slate-200/80 ${stage.bgHeader} flex items-center justify-between`}>
                <div>
                  <span className={`text-[11px] font-bold ${stage.badgeColor} px-2.5 py-0.5 rounded-full inline-block`}>
                    {stage.title}
                  </span>
                  <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1">
                    <span>{stageLeads.length} leads</span>
                    <span>•</span>
                    <span className="text-slate-800 font-bold font-display">
                      ${stageValue.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 custom-scrollbar">
                {stageLeads.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs italic">
                    Sin prospectos aquí
                  </div>
                ) : (
                  stageLeads.map((lead) => {
                    const nextStage = getNextStage(lead.status);
                    const prevStage = getPrevStage(lead.status);

                    return (
                      <div
                        key={lead.id}
                        className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-2xs hover:border-indigo-300 hover:shadow-xs transition-all space-y-2"
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={lead.avatar}
                              alt={lead.name}
                              className="w-7 h-7 rounded-full object-cover border border-slate-200"
                            />
                            <div>
                              <div className="font-bold text-xs text-slate-900 truncate max-w-[130px] font-display">
                                {lead.name}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {lead.roleCompany || lead.handleOrPhone}
                              </div>
                            </div>
                          </div>

                          <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full uppercase">
                            {lead.channel}
                          </span>
                        </div>

                        {/* Last Message snippet */}
                        <p className="text-[11px] text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded-lg italic">
                          "{lead.lastMessage}"
                        </p>

                        {/* Value & Intent */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                          <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold">
                            <Flame className="w-3 h-3" />
                            <span>{lead.intentScore}% Intención</span>
                          </div>
                          <div className="font-bold text-slate-900 font-display text-xs">
                            ${lead.estimatedValue.toLocaleString()} {businessProfile.defaultCurrency}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <div className="flex items-center gap-1">
                            {prevStage && (
                              <button
                                onClick={() => onUpdateLeadStatus(lead.id, prevStage)}
                                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs transition-colors"
                                title="Etapa anterior"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}

                            {nextStage && (
                              <button
                                onClick={() => onUpdateLeadStatus(lead.id, nextStage)}
                                className="p-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 shadow-2xs"
                                title="Avanzar etapa"
                              >
                                <span>Avanzar</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {lead.status !== "won_closed" && (
                              <button
                                onClick={() => handleQuickWin(lead.id)}
                                className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs transition-colors"
                                title="Cerrar como ganado"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => onSelectLead(lead)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>Chat</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


