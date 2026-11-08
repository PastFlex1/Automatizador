import React, { useState, useRef, useEffect } from "react";
import {
  Phone,
  MessageCircle,
  MessageSquare,
  Mail,
  Calendar,
  Plus,
  Check,
  Paperclip,
  Image as ImageIcon,
  Send,
  ArrowUpRight,
  Sparkles,
  CreditCard,
  CheckCircle2,
  Lock,
  ChevronRight,
  Bot,
  Flame,
  FileText,
  User,
  ArrowLeft,
  Search,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Lead, Message, Product, BusinessProfile } from "../types";
import { formatMessageTime } from "../utils/date-formatter";

interface CenterDealViewProps {
  lead: Lead;
  onSendMessage: (text: string, type?: Message["type"], metaData?: any) => void;
  onOpenPaymentModal: () => void;
  onOpenProductModal: () => void;
  onMarkWon?: () => void;
  products: Product[];
  businessProfile: BusinessProfile;
  onBackToList?: () => void;
}

export const CenterDealView: React.FC<CenterDealViewProps> = ({
  lead,
  onSendMessage,
  onOpenPaymentModal,
  onOpenProductModal,
  onMarkWon,
  products,
  businessProfile,
  onBackToList,
}) => {
  const [inputText, setInputText] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"Conversación" | "Actividad" | "Propuesta" | "Notas">("Conversación");
  const [isTyping, setIsTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState<string>("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [chatRoleMode, setChatRoleMode] = useState<"advisor" | "client_sim">("advisor");
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([
    "¿Dónde están ubicados exactamente en Quito?",
    "¿Qué materiales usan y qué garantía tienen los equipos?",
    "¿Qué precio tiene la cocina de 2 o 3 quemadores?",
    "¿Hacen envíos a provincias o puedo verla en el taller?",
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [lead.conversationHistory, isTyping]);

  // Request clean intelligent response from ChatGPT
  const triggerAiResponse = async (userMsgText: string, currentMode: "advisor" | "client_sim") => {
    setIsTyping(true);
    setTypingStatus(
      currentMode === "advisor"
        ? "IA Asesora está respondiendo..."
        : `${lead.name.split(" ")[0]} está escribiendo...`
    );

    try {
      const res = await fetch("/api/ai/live-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead,
          businessProfile,
          products,
          conversationHistory: lead.conversationHistory,
          userMessage: userMsgText,
          mode: currentMode === "advisor" ? "advisor_reply" : "customer_reply",
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const { replyText, suggestedSellerReplies } = json.data;
        setTimeout(() => {
          if (currentMode === "advisor") {
            onSendMessage(replyText, "text", undefined, "ai_autopilot");
          } else {
            onSendMessage(replyText, "text", undefined, "customer");
          }
          setIsTyping(false);
          setTypingStatus("");
          if (suggestedSellerReplies && suggestedSellerReplies.length > 0) {
            setDynamicSuggestions(suggestedSellerReplies);
          }
        }, 900);
      } else {
        setIsTyping(false);
        setTypingStatus("");
      }
    } catch (err) {
      console.error("ChatGPT live reply error:", err);
      setIsTyping(false);
      setTypingStatus("");
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTyping) return;
    const sentText = inputText.trim();
    onSendMessage(sentText, "text", undefined, "agent");
    setInputText("");
  };

  const handleQuickQuestionClick = (question: string) => {
    setInputText(question);
  };

  // Generate sales closing copy from ChatGPT directly into the input box
  const handleDraftWithChatGpt = async () => {
    setIsGeneratingAi(true);
    try {
      const typedQuery = inputText.trim();
      const lastCustMsg = typedQuery
        || [...lead.conversationHistory].reverse().find((m) => m.sender === "customer")?.content
        || lead.lastMessage
        || "Hola, me interesa información y precios.";

      const res = await fetch("/api/ai/live-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead,
          businessProfile,
          products,
          conversationHistory: lead.conversationHistory,
          userMessage: lastCustMsg,
          mode: "copilot_reply",
        }),
      });

      const json = await res.json();
      if (json.success && json.data?.replyText) {
        setInputText(json.data.replyText);
        if (json.data.suggestedSellerReplies && json.data.suggestedSellerReplies.length > 0) {
          setDynamicSuggestions(json.data.suggestedSellerReplies);
        }
      }
    } catch (err) {
      console.error("Error drafting with AI:", err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleTriggerWonConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10B981", "#6366F1", "#F59E0B", "#3B82F6", "#EC4899"],
    });
    if (onMarkWon) {
      onMarkWon();
    } else {
      onSendMessage("🎉 ¡Venta cerrada con éxito! Pago procesado y confirmado.", "text");
    }
  };

  const handleApplyQuickReply = (text: string) => {
    setInputText(text);
  };

  const stagesList = [
    { key: "new_lead", label: "Nuevo" },
    { key: "qualifying", label: "Calificación" },
    { key: "advised", label: "Asesorado" },
    { key: "proposal_sent", label: "Propuesta" },
    { key: "negotiating", label: "Negociación" },
    { key: "won_closed", label: "Ganado ✨" },
  ];

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden w-full bg-white relative">
      {/* 1. Top Lead Profile Header */}
      <div className="bg-white/90 backdrop-blur px-4 py-3 flex items-center justify-between shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] z-10 border-b border-slate-100">
        {onBackToList && (
          <button
            onClick={onBackToList}
            className="lg:hidden mb-2.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
            <span>← Volver a la lista de prospectos</span>
          </button>
        )}

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 cursor-pointer">
              <img
                src={lead.avatar}
                alt={lead.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-[15px] font-semibold text-slate-900 leading-tight">
                {lead.name}
              </h1>
              <p className="text-[12px] text-slate-500">
                {lead.roleCompany || "Cliente"} • {lead.handleOrPhone || lead.pageName}
              </p>
            </div>
          </div>

          {/* Right Action Icons (WhatsApp Style Header) */}
          <div className="flex items-center gap-4 text-slate-500">
            <button onClick={() => onSendMessage("📞 Llamando...", "text")} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
              <Phone className="w-4 h-4" />
            </button>
            <button onClick={() => setIsGeneratingAi(true)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
              <Search className="w-4 h-4" />
            </button>
            <button onClick={onOpenPaymentModal} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors" title="Cobrar">
              <CreditCard className="w-4 h-4" />
            </button>
          </div>
        </div>



      {/* 2. Middle: Detected Objection Banner if present */}
      {lead.detectedObjection && (
        <div className="my-2 bg-amber-50/80 border border-amber-200/80 rounded-2xl p-2.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <div>
              <span className="font-bold">Objeción detectada: </span>
              <span className="text-amber-800">{lead.detectedObjection}</span>
            </div>
          </div>
          <button
            onClick={() => onOpenPaymentModal()}
            className="text-[11px] font-bold text-amber-900 underline hover:text-amber-700"
          >
            Generar solución de pago
          </button>
        </div>
      )}

      {/* 3. Bottom Chat & Messaging Feed */}
      <div className="flex-1 flex flex-col overflow-hidden chat-bg relative">
        
        {/* Deal Info Floating Chip (Instead of big header) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/90 backdrop-blur text-slate-700 px-4 py-1.5 rounded-full text-[11px] font-medium shadow-sm border border-slate-200/50">
          <span className="flex items-center gap-1.5">{lead.status === 'won_closed' ? <span className="w-2 h-2 rounded-full bg-emerald-500"></span> : lead.urgency === 'hot' ? <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> : <span className="w-2 h-2 rounded-full bg-indigo-500"></span>} {lead.status === 'won_closed' ? 'Ganado' : lead.urgency === 'hot' ? 'Caliente' : 'En progreso'}</span>
          <span className="text-slate-300">•</span>
          <span className="font-bold text-slate-800">${(lead.estimatedValue || 0).toLocaleString()}</span>
          {lead.status !== 'won_closed' && (
            <button onClick={handleTriggerWonConfetti} className="ml-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors">
              Cerrar Venta
            </button>
          )}
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 custom-scrollbar pb-10 pt-12">
          {lead.conversationHistory.map((msg) => {
            const isAgent = msg.sender === "agent" || msg.sender === "ai_autopilot";

            if (!isAgent) {
              // Customer messages (White left bubble)
              return (
                <div key={msg.id} className="flex flex-col items-start w-full">
                  <div className="relative max-w-[85%] bg-white px-3.5 py-2.5 text-[14.5px] rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 text-slate-800 leading-snug">
                    {msg.content}
                    <span className="text-[10px] text-slate-400 float-right mt-2.5 ml-3 font-medium">
                      {formatMessageTime(msg.createdAt || msg.timestamp)}
                    </span>
                  </div>
                </div>
              );
            }

            // Agent / AI Messages (Green right bubble)
            return (
              <div key={msg.id} className="flex flex-col items-end w-full">
                {msg.type === "payment_link" ? (
                  <div className="relative max-w-[85%] bg-gradient-to-br from-indigo-600 to-violet-600 p-3.5 rounded-2xl rounded-tr-sm shadow-md shadow-indigo-200/50 text-white text-[14.5px]">
                    <div className="font-bold flex items-center gap-1.5 mb-1.5 text-indigo-50">
                      <CreditCard className="w-4 h-4" />
                      <span>Enlace de Pago Seguro</span>
                    </div>
                    <p className="text-[13px] text-indigo-50 leading-relaxed mb-3">{msg.content}</p>
                    <a
                      href={msg.metaData?.paymentUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-center py-2.5 bg-white text-indigo-700 font-bold rounded-xl shadow-sm hover:bg-indigo-50 transition-colors text-sm"
                    >
                      Pagar ${(msg.metaData?.amount || lead.estimatedValue).toLocaleString()} {businessProfile.defaultCurrency}
                    </a>
                    <span className="text-[10px] text-indigo-200 float-right mt-1.5 flex items-center font-medium">
                      {formatMessageTime(msg.createdAt || msg.timestamp)} <CheckCircle2 className="w-3.5 h-3.5 inline ml-1 text-indigo-200" />
                    </span>
                  </div>
                ) : (
                  <div className="relative max-w-[85%] bg-gradient-to-br from-indigo-600 to-violet-600 px-3.5 py-2.5 text-[14.5px] rounded-2xl rounded-tr-sm shadow-md shadow-indigo-200/50 text-white leading-snug whitespace-pre-wrap">
                    {msg.content}
                    <span className="text-[10px] text-indigo-200 float-right mt-2.5 ml-3 flex items-center font-medium">
                      {formatMessageTime(msg.createdAt || msg.timestamp)}
                      {msg.sender === "ai_autopilot" ? <Sparkles className="w-3.5 h-3.5 inline ml-1 text-indigo-200" /> : <CheckCircle2 className="w-3.5 h-3.5 inline ml-1 text-indigo-200" />}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex flex-col items-start w-full animate-pulse">
              <div className="px-3 py-2 text-sm rounded-lg bg-white text-slate-500 shadow-sm flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
                <span className="text-[11px] italic">{typingStatus || "Escribiendo..."}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Dynamic Smart Questions & Quick Replies Bar */}
        <div className="px-4 py-2 bg-white/60 backdrop-blur flex items-center gap-2 overflow-x-auto no-scrollbar border-t border-slate-100">
          <button
            type="button"
            onClick={handleDraftWithChatGpt}
            disabled={isGeneratingAi || isTyping}
            className="text-[12px] bg-gradient-to-r from-indigo-50 to-violet-50 hover:from-indigo-100 hover:to-violet-100 text-indigo-700 font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 shadow-sm flex-shrink-0 disabled:opacity-60 border border-indigo-100/50"
            title="Redactar con IA"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isGeneratingAi ? "Generando..." : "Redactar con IA"}
          </button>

          {dynamicSuggestions.map((text, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleQuickQuestionClick(text)}
              disabled={isTyping}
              className="text-[12px] bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex-shrink-0 shadow-sm disabled:opacity-50 border border-slate-200/60"
            >
              {text}
            </button>
          ))}
        </div>

        {/* Input Bar Form */}
        <div className="bg-white px-4 pb-5 pt-2">
          <form onSubmit={handleSend} className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <button
              type="button"
              onClick={onOpenProductModal}
              className="w-10 h-10 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-50 hover:text-indigo-500 transition-colors"
              title="Adjuntar"
            >
              <Plus className="w-6 h-6" />
            </button>
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Escribe un mensaje"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isTyping}
                className="w-full bg-slate-50 rounded-full py-3 px-5 text-[15px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white shadow-inner transition-all disabled:opacity-70"
              />
            </div>
            {inputText.trim() ? (
              <button
                type="submit"
                disabled={isTyping}
                className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-200 transition-all active:scale-95 ml-1"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isTyping}
                className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center transition-colors ml-1"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
