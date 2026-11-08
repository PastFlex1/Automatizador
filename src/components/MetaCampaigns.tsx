import React, { useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Radio,
  TrendingUp,
  Megaphone,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Campaign, Product, BusinessProfile, CampaignVariant } from "../types";

interface MetaCampaignsProps {
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  products: Product[];
  businessProfile: BusinessProfile;
}

export const MetaCampaigns: React.FC<MetaCampaignsProps> = ({
  campaigns,
  setCampaigns,
  products,
  businessProfile,
}) => {
  const [campaignType, setCampaignType] = useState("Lanzamiento de oferta especial con cupo limitado");
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "instagram" | "messenger">("whatsapp");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [targetAudience, setTargetAudience] = useState("Prospectos calificados e interesados en la propuesta");

  const [loading, setLoading] = useState(false);
  const [generatedVariants, setGeneratedVariants] = useState<CampaignVariant[]>([]);
  const [copiedVariantId, setCopiedVariantId] = useState<number | null>(null);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  const handleGenerateCampaignAI = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generate-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType,
          targetAudience,
          product: selectedProduct,
          businessProfile,
        }),
      });

      const data = await res.json();
      if (data.success && data.data?.variants) {
        setGeneratedVariants(data.data.variants);
      }
    } catch (err) {
      console.error("Error generating campaign:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedVariantId(id);
    setTimeout(() => setCopiedVariantId(null), 2000);
  };

  const handleLaunchCampaign = () => {
    const chosenVariant = generatedVariants[selectedVariantIndex] || {
      tone: "Mensaje Directo",
      message: "Hola! Tenemos una oportunidad especial...",
    };

    const newCamp: Campaign = {
      id: `camp-${Date.now()}`,
      title: `${chosenVariant.tone} - ${selectedProduct?.name || "Servicio"}`,
      channel: selectedChannel,
      targetAudience,
      sentCount: 150,
      openRate: 94.2,
      replyRate: 31.8,
      salesClosed: 6,
      revenue: (selectedProduct?.price || 1500) * 6,
      status: "active",
      scheduledDate: "Hoy, Transmisión Activa",
      messagePreview: chosenVariant.message,
    };

    setCampaigns((prev) => [newCamp, ...prev]);

    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.5 },
        colors: ["#10B981", "#6366F1", "#F59E0B", "#3B82F6"],
      });
    } catch (e) {}
  };

  const totalCampaignRevenue = campaigns.reduce((sum, c) => sum + c.revenue, 0);
  const totalCampaignSales = campaigns.reduce((sum, c) => sum + c.salesClosed, 0);

  return (
    <div className="flex-1 w-full h-full bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 md:p-6 shadow-sm border border-slate-200/80 flex flex-col overflow-y-auto custom-scrollbar space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight font-display">
            Campañas & Mensajería Masiva Meta
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Genera copys de alta conversión con IA para difusiones en WhatsApp Business, Instagram DM y Messenger.
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2.5">
          <div className="bg-emerald-50 border border-emerald-200/80 px-3 sm:px-3.5 py-1.5 rounded-xl sm:rounded-2xl text-[11px] sm:text-xs font-semibold text-emerald-800">
            <span>Ventas Generadas: </span>
            <strong className="font-display font-extrabold text-emerald-900 text-xs ml-1">
              {totalCampaignSales} ventas (${totalCampaignRevenue.toLocaleString()} {businessProfile.defaultCurrency})
            </strong>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Builder */}
        <div className="lg:col-span-5 bg-slate-50/70 rounded-2xl p-5 border border-slate-200/80 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-200/80 pb-3 font-display">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Generar Copy de Difusión con IA</span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1.5 uppercase tracking-wider text-[10px]">
                Canal de Envío:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedChannel("whatsapp")}
                  className={`py-2 px-2 rounded-xl font-bold transition-all text-xs ${
                    selectedChannel === "whatsapp"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedChannel("instagram")}
                  className={`py-2 px-2 rounded-xl font-bold transition-all text-xs ${
                    selectedChannel === "instagram"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Instagram
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedChannel("messenger")}
                  className={`py-2 px-2 rounded-xl font-bold transition-all text-xs ${
                    selectedChannel === "messenger"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Messenger
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                Objetivo de la Campaña:
              </label>
              <select
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
              >
                <option value="Lanzamiento de oferta especial con cupo limitado">
                  🎯 Lanzamiento con Cupo Limitado
                </option>
                <option value="Reactivación de prospectos indecisos">
                  ⚡ Reactivación de Prospectos Antiguos
                </option>
                <option value="Descuento especial por tiempo limitado 24h">
                  🔥 Promoción Flash 24 Horas
                </option>
                <option value="Invitación a demostración o llamada estratégica">
                  📞 Invitación a Llamada / Asesoría
                </option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                Producto o Servicio:
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.price.toLocaleString()} {p.currency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 uppercase tracking-wider text-[10px]">
                Audiencia / Segmento:
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="ej. Clientes que preguntaron el mes pasado..."
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <button
              onClick={handleGenerateCampaignAI}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-2xs flex items-center justify-center gap-2 transition-transform active:scale-95 mt-2"
            >
              <Sparkles className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Redactando con Gemini..." : "Generar Opciones de Copy"}</span>
            </button>
          </div>
        </div>

        {/* Right Section: Generated Results */}
        <div className="lg:col-span-7 space-y-5">
          {generatedVariants.length > 0 ? (
            <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/80 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 font-display">
                  <Megaphone className="w-4 h-4 text-indigo-600" />
                  <span>Variantes Redactadas</span>
                </h3>
                <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-0.5 rounded-full font-bold">
                  {generatedVariants.length} Opciones
                </span>
              </div>

              {/* Variant selector */}
              <div className="grid grid-cols-3 gap-2">
                {generatedVariants.map((variant, idx) => (
                  <button
                    key={variant.id}
                    onClick={() => setSelectedVariantIndex(idx)}
                    className={`p-2.5 rounded-xl text-left text-xs transition-all border ${
                      selectedVariantIndex === idx
                        ? "bg-indigo-600 border-indigo-600 text-white font-bold shadow-2xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="truncate font-semibold">{variant.tone}</div>
                  </button>
                ))}
              </div>

              {/* Active Variant Preview */}
              {generatedVariants[selectedVariantIndex] && (
                <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3 shadow-2xs">
                  <div className="text-xs font-bold text-slate-900 font-display">
                    {generatedVariants[selectedVariantIndex].hook}
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {generatedVariants[selectedVariantIndex].message}
                  </p>
                  <div className="text-xs text-indigo-900 font-medium bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-100">
                    <strong>Llamado a la Acción (CTA):</strong> {generatedVariants[selectedVariantIndex].callToAction}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      onClick={() =>
                        handleCopy(
                          generatedVariants[selectedVariantIndex].message,
                          generatedVariants[selectedVariantIndex].id
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                    >
                      {copiedVariantId === generatedVariants[selectedVariantIndex].id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copiar Texto</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleLaunchCampaign}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xs transition-transform active:scale-95"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Lanzar Campaña</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50/70 rounded-2xl p-8 border border-slate-200/80 text-center space-y-2">
              <Megaphone className="w-8 h-8 text-indigo-400 mx-auto" />
              <h3 className="font-bold text-slate-800 text-xs font-display">
                Crea copys persuasivos con IA para tus listas de difusión
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                El asistente redactará mensajes diseñados para captar respuestas inmediatas y agendar cierres en WhatsApp e Instagram.
              </p>
            </div>
          )}

          {/* Past Campaigns */}
          <div className="bg-slate-50/70 rounded-2xl p-5 border border-slate-200/80 space-y-4 shadow-2xs">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 font-display">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <span>Campañas y Difusiones Activas</span>
            </h3>

            <div className="space-y-3">
              {campaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="bg-white rounded-xl p-4 border border-slate-200 space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-xs text-slate-900 font-display">{camp.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {camp.targetAudience} • {camp.scheduledDate}
                      </div>
                    </div>

                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                      {camp.status === "active" ? "Activa 🟢" : "Completada"}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-xs">
                    <div>
                      <div className="text-slate-500 text-[10px]">Enviados</div>
                      <div className="font-bold text-slate-800">{camp.sentCount}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px]">Apertura</div>
                      <div className="font-bold text-slate-800">{camp.openRate}%</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px]">Respuestas</div>
                      <div className="font-bold text-slate-800">{camp.replyRate}%</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-[10px]">Ventas ($)</div>
                      <div className="font-display font-black text-emerald-700">${camp.revenue.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


