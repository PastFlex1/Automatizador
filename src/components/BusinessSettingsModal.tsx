import React, { useState } from "react";
import {
  Building2,
  ShieldCheck,
  CheckCircle,
  Save,
  Radio,
  Sparkles,
} from "lucide-react";
import { BusinessProfile } from "../types";

interface BusinessSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessProfile: BusinessProfile;
  setBusinessProfile: React.Dispatch<React.SetStateAction<BusinessProfile>>;
}

export const BusinessSettingsModal: React.FC<BusinessSettingsModalProps> = ({
  isOpen,
  onClose,
  businessProfile,
  setBusinessProfile,
}) => {
  if (!isOpen) return null;

  const [formData, setFormData] = useState<BusinessProfile>({ ...businessProfile });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setBusinessProfile(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 font-display">
                Configuración del Negocio & IA
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Personaliza la identidad de tu empresa, tono del asesor IA y políticas comerciales
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Business Core */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Identidad de la Empresa</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nombre de la Empresa:
                </label>
                <input
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Industria / Nicho:
                </label>
                <input
                  type="text"
                  required
                  value={formData.niche}
                  onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Moneda Principal:
                </label>
                <select
                  value={formData.defaultCurrency}
                  onChange={(e) => setFormData({ ...formData, defaultCurrency: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium font-display"
                >
                  <option value="USD">USD ($ Dólares)</option>
                  <option value="EUR">EUR (€ Euros)</option>
                  <option value="MXN">MXN ($ Pesos Mexicanos)</option>
                  <option value="COP">COP ($ Pesos Colombianos)</option>
                  <option value="CLP">CLP ($ Pesos Chilenos)</option>
                  <option value="ARS">ARS ($ Pesos Argentinos)</option>
                  <option value="GBP">GBP (£ Libras)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Tono del Asesor IA:
                </label>
                <select
                  value={formData.advisorTone}
                  onChange={(e) => setFormData({ ...formData, advisorTone: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
                >
                  <option value="consultivo">🤝 Consultivo y Empático (Recomendado)</option>
                  <option value="vip_exclusivo">💎 Premium y Exclusivo (High Ticket)</option>
                  <option value="persuasivo">⚡ Persuasivo y Dinámico</option>
                  <option value="directo_closer">🎯 Cierre Rápido y Directo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Proposition & Guarantee */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Propuesta de Valor & Garantía</span>
            </h3>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Propuesta de Valor Principal:
              </label>
              <textarea
                rows={2}
                value={formData.valueProposition}
                onChange={(e) => setFormData({ ...formData, valueProposition: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Garantía Comercial / Política de Satisfacción:
              </label>
              <textarea
                rows={2}
                value={formData.guaranteePolicy}
                onChange={(e) => setFormData({ ...formData, guaranteePolicy: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Meta Connections Status */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
              <span>Conexiones Meta Cloud API</span>
            </h3>

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-700">WhatsApp Business Cloud API</span>
                </div>
                <span className="text-emerald-700 font-bold text-[10px] bg-emerald-100/80 border border-emerald-200 px-2.5 py-0.5 rounded-full">Conectado</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
                  <span className="font-semibold text-slate-700">Instagram Messaging API</span>
                </div>
                <span className="text-pink-700 font-bold text-[10px] bg-pink-100/80 border border-pink-200 px-2.5 py-0.5 rounded-full">Conectado</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="font-semibold text-slate-700">Facebook Messenger API</span>
                </div>
                <span className="text-blue-700 font-bold text-[10px] bg-blue-100/80 border border-blue-200 px-2.5 py-0.5 rounded-full">Conectado</span>
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-sm transition-transform active:scale-95"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle className="w-4 h-4 text-white" />
                  <span>¡Cambios Guardados!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Configuración</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


