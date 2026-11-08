import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Paperclip,
  Mic,
  DollarSign,
  Package,
  Play,
  Pause,
  Check,
  CheckCheck,
  Flame,
  Award,
  ExternalLink,
  Bot,
  Copy,
  Sparkles,
  ShoppingBag,
  Clock,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Lead, Message, Product, LeadStatus, BusinessProfile } from "../types";
import { formatMessageTime } from "../utils/date-formatter";

interface ChatViewerProps {
  lead: Lead;
  onSendMessage: (text: string, type?: Message["type"], metaData?: any) => void;
  onUpdateLeadStatus: (status: LeadStatus) => void;
  onOpenPaymentModal: () => void;
  onOpenProductModal: () => void;
  products: Product[];
  businessProfile: BusinessProfile;
  onGenerateAIAdvisorHelp: () => void;
}

export const ChatViewer: React.FC<ChatViewerProps> = ({
  lead,
  onSendMessage,
  onUpdateLeadStatus,
  onOpenPaymentModal,
  onOpenProductModal,
  products,
  businessProfile,
  onGenerateAIAdvisorHelp,
}) => {
  const [inputText, setInputText] = useState("");
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [lead.conversationHistory]);

  const lastCustomerMessage = [...(lead.conversationHistory || [])]
    .reverse()
    .find((m) => m.sender === "customer");

  const isMessengerOrFacebook =
    lead.channel === "messenger" ||
    lead.channel === "facebook" ||
    lead.tags?.some((t) => t.toLowerCase().includes("messenger") || t.toLowerCase().includes("facebook"));

  const lastCustomerDate = lastCustomerMessage?.createdAt
    ? new Date(lastCustomerMessage.createdAt)
    : null;

  const hoursSinceLastCustomerMsg = lastCustomerDate
    ? (Date.now() - lastCustomerDate.getTime()) / (1000 * 60 * 60)
    : null;

  const is24hWindowClosed = Boolean(
    isMessengerOrFacebook &&
    hoursSinceLastCustomerMsg !== null &&
    hoursSinceLastCustomerMsg > 24
  );

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText, "text");
    setInputText("");
  };

  const handleMarkAsWon = () => {
    onUpdateLeadStatus("won_closed");
    try {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#10B981", "#3B82F6", "#6366F1", "#F59E0B"],
      });
    } catch (err) {
      console.log(err);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleAudio = (id: string) => {
    if (playingAudioId === id) {
      setPlayingAudioId(null);
    } else {
      setPlayingAudioId(id);
      // simulate audio finishing in 4 seconds
      setTimeout(() => {
        setPlayingAudioId((curr) => (curr === id ? null : curr));
      }, 4000);
    }
  };

  const quickSendVoiceNote = () => {
    const defaultVoiceScript = `¡Hola ${lead.name.split(" ")[0]}! Te dejo este audio rápido porque justo tengo tu ficha abierta y podemos dejar tu acceso activo hoy mismo con la garantía completa 🙌.`;
    onSendMessage(defaultVoiceScript, "audio", { audioDuration: "0:24" });
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] bg-slate-950 relative">
      {/* Chat Top Header */}
      <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={lead.avatar}
              alt={lead.name}
              className="w-10 h-10 rounded-full object-cover border border-slate-700 shadow-md"
            />
            {lead.channel === "whatsapp" && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[9px] text-white font-bold">
                W
              </span>
            )}
            {lead.channel === "instagram" && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[9px] text-white font-bold">
                IG
              </span>
            )}
            {lead.channel === "messenger" && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-[9px] text-white font-bold">
                M
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-100 text-sm">{lead.name}</h2>
              <span className="text-[11px] bg-blue-950/80 text-blue-300 border border-blue-800/80 px-2 py-0.5 rounded-full font-medium">
                Página: {lead.pageName || "APM inox 1"}
              </span>
              <span className="text-xs text-slate-400 font-normal">
                ({lead.handleOrPhone})
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-blue-400 font-semibold text-[11px]">
                ⚡ Facebook Messenger
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                <Flame className="w-3.5 h-3.5" />
                Intención: {lead.intentScore}%
              </span>
              <span>•</span>
              <span className="text-slate-300">
                Valor estimado: <strong className="text-emerald-400">${lead.estimatedValue} {businessProfile.defaultCurrency}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons & Status Selector */}
        <div className="flex items-center gap-2">
          {/* Status Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px]">Etapa:</span>
            <select
              value={lead.status}
              onChange={(e) => onUpdateLeadStatus(e.target.value as LeadStatus)}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer text-xs"
            >
              <option value="new_lead" className="bg-slate-900 text-slate-200">
                1. Lead Nuevo
              </option>
              <option value="qualifying" className="bg-slate-900 text-slate-200">
                2. En Calificación
              </option>
              <option value="advised" className="bg-slate-900 text-slate-200">
                3. Asesoramiento Activo
              </option>
              <option value="proposal_sent" className="bg-slate-900 text-slate-200">
                4. Propuesta Enviada
              </option>
              <option value="negotiating" className="bg-slate-900 text-slate-200">
                5. En Negociación
              </option>
              <option value="ready_to_close" className="bg-slate-900 text-slate-200">
                6. 🎯 Listo para Cierre
              </option>
              <option value="won_closed" className="bg-slate-900 text-emerald-400 font-bold">
                7. 💰 Venta Ganada / Pagada
              </option>
              <option value="lost" className="bg-slate-900 text-rose-400">
                8. Perdido / No califica
              </option>
            </select>
          </div>

          {/* Quick Mark As Won Button */}
          {lead.status !== "won_closed" ? (
            <button
              onClick={handleMarkAsWon}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all"
              title="Marcar venta como pagada y registrar ingresos"
            >
              <Award className="w-3.5 h-3.5" />
              <span>Cerrar Venta 💰</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold text-xs">
              <CheckCheck className="w-4 h-4 text-emerald-400" />
              <span>¡VENTA CERRADA!</span>
            </div>
          )}
        </div>
      </div>

      {/* Channel specific banner */}
      <div className="px-4 py-1.5 bg-slate-900/60 border-b border-slate-800/60 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lead.channel === "whatsapp" && (
            <span className="text-emerald-400 font-medium">💬 Conversación encriptada vía WhatsApp Cloud API</span>
          )}
          {lead.channel === "instagram" && (
            <span className="text-pink-400 font-medium">📸 Instagram Direct Message sincronizado</span>
          )}
          {lead.channel === "messenger" && (
            <span className="text-blue-400 font-medium">⚡ Mensaje directo de Facebook Messenger</span>
          )}
        </div>
        {lead.detectedObjection && (
          <div className="text-amber-300 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Objeción detectada: <em>"{lead.detectedObjection}"</em>
          </div>
        )}
      </div>

      {/* Messages Feed Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
        {/* Ad source pill if present */}
        {lead.sourceCampaign && (
          <div className="flex justify-center my-2">
            <div className="bg-slate-900/80 border border-slate-800 rounded-full px-3 py-1 text-[11px] text-slate-400 flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-indigo-400" />
              Origen del prospecto: <strong className="text-slate-200">{lead.sourceCampaign}</strong>
            </div>
          </div>
        )}

        {lead.conversationHistory.map((msg) => {
          const isCustomer = msg.sender === "customer";
          const isAutopilot = msg.sender === "ai_autopilot";

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}
            >
              <div className="flex items-end gap-1.5 max-w-[85%] sm:max-w-[75%]">
                {isCustomer && (
                  <img
                    src={lead.avatar}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover mb-1 border border-slate-700"
                  />
                )}

                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed relative shadow-md ${
                    isCustomer
                      ? "bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700"
                      : isAutopilot
                      ? "bg-gradient-to-tr from-indigo-900 to-indigo-700 text-white rounded-br-sm border border-indigo-500/40"
                      : lead.channel === "whatsapp"
                      ? "bg-emerald-700 text-white rounded-br-sm border border-emerald-600"
                      : lead.channel === "instagram"
                      ? "bg-gradient-to-r from-pink-700 to-purple-700 text-white rounded-br-sm border border-pink-600"
                      : "bg-blue-700 text-white rounded-br-sm border border-blue-600"
                  }`}
                >
                  {/* Autopilot Badge if sent by AI */}
                  {isAutopilot && (
                    <div className="flex items-center gap-1 text-[10px] text-indigo-200 font-semibold mb-1 pb-1 border-b border-indigo-400/30">
                      <Bot className="w-3 h-3" />
                      <span>Respuesta Auto-Piloto MetaCloser</span>
                    </div>
                  )}

                  {/* Story Mention Card */}
                  {msg.type === "story_mention" && msg.metaData?.storyMediaUrl && (
                    <div className="mb-2 p-2 rounded-lg bg-black/40 border border-white/10 flex items-center gap-2.5">
                      <img
                        src={msg.metaData.storyMediaUrl}
                        alt="Story"
                        className="w-10 h-10 rounded object-cover"
                      />
                      <div className="text-[11px] text-pink-200 font-medium">
                        Respondió a tu Historia de Instagram 📸
                      </div>
                    </div>
                  )}

                  {/* Audio Note Bubble */}
                  {msg.type === "audio" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 py-1">
                        <button
                          onClick={() => toggleAudio(msg.id)}
                          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shadow"
                        >
                          {playingAudioId === msg.id ? (
                            <Pause className="w-4 h-4 text-white" />
                          ) : (
                            <Play className="w-4 h-4 text-white ml-0.5" />
                          )}
                        </button>
                        <div className="flex-1 space-y-1">
                          {/* Animated sound wave bars */}
                          <div className="flex items-center gap-0.5 h-4">
                            {[12, 24, 18, 30, 22, 14, 28, 20, 16, 26, 10, 22].map((h, i) => (
                              <div
                                key={i}
                                className={`w-1 rounded-full ${
                                  playingAudioId === msg.id
                                    ? "bg-white animate-pulse"
                                    : "bg-white/50"
                                }`}
                                style={{ height: `${h}px` }}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between text-[10px] text-white/70">
                            <span>{playingAudioId === msg.id ? "Reproduciendo..." : "Nota de voz"}</span>
                            <span>{msg.metaData?.audioDuration || "0:24"}</span>
                          </div>
                        </div>
                      </div>
                      {msg.content && (
                        <p className="text-xs pt-1 border-t border-white/20 italic opacity-95">
                          "{msg.content}"
                        </p>
                      )}
                    </div>
                  ) : msg.type === "product_card" && msg.metaData?.product ? (
                    /* Product Card Bubble */
                    <div className="space-y-2 py-1">
                      <p className="mb-2">{msg.content}</p>
                      <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700 text-slate-100 space-y-2">
                        <div className="flex gap-3">
                          <img
                            src={msg.metaData.product.imageUrl}
                            alt={msg.metaData.product.name}
                            className="w-14 h-14 rounded-lg object-cover border border-slate-700"
                          />
                          <div>
                            <div className="font-bold text-xs text-slate-100">
                              {msg.metaData.product.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {msg.metaData.product.category}
                            </div>
                            <div className="text-sm font-extrabold text-emerald-400 mt-1">
                              ${msg.metaData.product.price} {msg.metaData.product.currency}
                            </div>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          {msg.metaData.product.description}
                        </p>
                      </div>
                    </div>
                  ) : msg.type === "payment_link" ? (
                    /* Payment Link Bubble */
                    <div className="space-y-2 py-1">
                      <p>{msg.content}</p>
                      <div className="bg-slate-900/95 rounded-xl p-3 border border-emerald-500/40 text-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                            <ShieldCheck className="w-4 h-4" />
                            <span>Enlace de Pago Seguro MetaPay</span>
                          </div>
                          <span className="text-xs font-extrabold text-slate-100">
                            ${msg.metaData?.amount || lead.estimatedValue} {businessProfile.defaultCurrency}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={msg.metaData?.paymentUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold text-center rounded-lg shadow transition-colors"
                          >
                            Pagar Ahora Directo 💳
                          </a>
                          <button
                            onClick={() =>
                              handleCopyText(
                                msg.metaData?.paymentUrl || "https://pay.metacloser.com/checkout",
                                msg.id
                              )
                            }
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Copiar enlace"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Standard Text Bubble */
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}

                  {/* Timestamp and delivery checkmarks */}
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                      isCustomer ? "text-slate-400" : "text-white/80"
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt || msg.timestamp)}</span>
                    {!isCustomer && (
                      msg.deliveryStatus === "failed" ? (
                        <span
                          className="flex items-center gap-0.5 text-red-300 font-semibold cursor-help bg-red-950/80 border border-red-500/40 px-1 py-0.5 rounded text-[9px]"
                          title={msg.deliveryError || "No entregado a Facebook por regla de 24 horas"}
                        >
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          <span>No entregado (24h)</span>
                        </span>
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5 text-white/90" />
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Closing Toolbar */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">
            Acciones de Cierre:
          </span>

          <button
            onClick={onOpenPaymentModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Link de Pago</span>
          </button>

          <button
            onClick={onOpenProductModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-colors"
          >
            <Package className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ficha de Producto</span>
          </button>

          <button
            onClick={quickSendVoiceNote}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-colors"
            title="Enviar nota de voz simulada de 20s para generar confianza"
          >
            <Mic className="w-3.5 h-3.5 text-purple-400" />
            <span>Nota de Voz</span>
          </button>
        </div>

        {/* AI Advisor Trigger Button */}
        <button
          onClick={onGenerateAIAdvisorHelp}
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all flex-shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Asesor AI de Cierre</span>
        </button>
      </div>

      {/* 24-Hour Policy Warning Banner */}
      {is24hWindowClosed && (
        <div className="mx-3 my-2 p-3 bg-amber-950/70 border border-amber-500/40 rounded-xl flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 flex-1">
            <div className="font-semibold text-amber-300 flex items-center justify-between">
              <span>Ventana de 24 horas de Facebook cerrada</span>
              <span className="text-[11px] text-amber-400/80 font-normal">
                {hoursSinceLastCustomerMsg ? `Último mensaje del cliente hace ${Math.floor(hoursSinceLastCustomerMsg)}h` : ''}
              </span>
            </div>
            <p className="mt-1 text-slate-300 leading-relaxed">
              Han pasado más de 24 horas desde la última interacción de {lead.name}. Meta bloquea envíos automáticos o por API.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href="https://business.facebook.com/latest/inbox"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors text-xs shadow-md shadow-blue-600/30"
              >
                <span>Responder desde Meta Business Suite</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="text-[11px] text-amber-300/80">
                (Una vez responda Washington, la ventana se reabrirá)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Message Input Box */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-slate-900 border-t border-slate-800/80 flex items-center gap-2"
      >
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={`Escribe un mensaje para ${lead.name} en ${lead.channel}... (*negrita*, emojis)`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={!inputText.trim()}
          className={`p-2.5 rounded-xl font-bold flex items-center justify-center transition-all ${
            inputText.trim()
              ? lead.channel === "whatsapp"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
                : lead.channel === "instagram"
                ? "bg-pink-600 hover:bg-pink-500 text-white shadow-md shadow-pink-600/20"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20"
              : "bg-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
