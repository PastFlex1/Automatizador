import React, { useState } from "react";
import { UserPlus } from "lucide-react";
import { Lead, MetaChannel, Product, BusinessProfile } from "../types";

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLead: (lead: Lead) => void;
  products: Product[];
  businessProfile: BusinessProfile;
}

export const NewLeadModal: React.FC<NewLeadModalProps> = ({
  isOpen,
  onClose,
  onAddLead,
  products,
  businessProfile,
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState("");
  const [roleCompany, setRoleCompany] = useState("Director General - Empresa");
  const [handleOrPhone, setHandleOrPhone] = useState("");
  const [channel, setChannel] = useState<MetaChannel>("whatsapp");
  const [interestProductId, setInterestProductId] = useState(products[0]?.id || "");
  const [initialMessage, setInitialMessage] = useState("Hola, me gustaría recibir más información y precios del servicio.");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const selectedProduct = products.find((p) => p.id === interestProductId) || products[0];

    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      name,
      roleCompany,
      dealCode: `#LEAD-${Math.floor(10000 + Math.random() * 90000)}`,
      manager: businessProfile.ownerName || "Asesor Comercial",
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@empresa.com`,
      address: "Ciudad de México / Remoto",
      actionSubpill: "Información Solicitada",
      handleOrPhone: handleOrPhone || (channel === "whatsapp" ? "+52 55 1234 5678" : "@" + name.toLowerCase().replace(/\s+/g, ".")),
      avatar: `https://images.unsplash.com/photo-${1534528741775 + (Date.now() % 1000)}?auto=format&fit=crop&w=200&q=80`,
      channel,
      status: "new_lead",
      urgency: "hot",
      intentScore: 85,
      estimatedValue: selectedProduct?.price || 1500,
      tags: ["🔥 Nuevo Lead", "Meta Ads", channel.toUpperCase()],
      lastMessage: initialMessage,
      lastActivity: "Hace un momento",
      unreadCount: 1,
      notes: "Lead capturado vía campaña de Meta Ads. Interesado en propuesta comercial.",
      sourceCampaign: "Campaña Meta Ads - Tráfico Directo",
      interestProductId: selectedProduct?.id,
      detectedObjection: "Solicita detalles de precios, alcance y formas de pago",
      conversationHistory: [
        {
          id: `m-${Date.now()}`,
          sender: "customer",
          content: initialMessage,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: "text",
        },
      ],
    };

    onAddLead(newLead);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Registrar Nuevo Prospecto (Lead)
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Crea un contacto entrante de WhatsApp, Instagram o Facebook
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-bold">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Nombre Completo del Contacto:
            </label>
            <input
              type="text"
              required
              placeholder="ej. Carlos Mendoza"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Empresa / Cargo:
            </label>
            <input
              type="text"
              placeholder="ej. Director Comercial - TechCorp"
              value={roleCompany}
              onChange={(e) => setRoleCompany(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Canal de Entrada:
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as MetaChannel)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
              >
                <option value="whatsapp">WhatsApp Business</option>
                <option value="instagram">Instagram Direct</option>
                <option value="messenger">Facebook Messenger</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Teléfono / Usuario:
              </label>
              <input
                type="text"
                placeholder={channel === "whatsapp" ? "+52 55 1234 5678" : "@carlos.mendoza"}
                value={handleOrPhone}
                onChange={(e) => setHandleOrPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Producto o Servicio de Interés:
            </label>
            <select
              value={interestProductId}
              onChange={(e) => setInterestProductId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price.toLocaleString()} {p.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Mensaje Inicial del Prospecto:
            </label>
            <textarea
              rows={2}
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-sm transition-transform active:scale-95"
            >
              Registrar Lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


