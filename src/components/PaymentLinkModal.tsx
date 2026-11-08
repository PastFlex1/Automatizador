import React, { useState } from "react";
import { CreditCard, Send, ShieldCheck } from "lucide-react";
import { Product, BusinessProfile } from "../types";

interface PaymentLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  businessProfile: BusinessProfile;
  onSendPaymentLinkToChat: (url: string, amount: number, note: string) => void;
}

export const PaymentLinkModal: React.FC<PaymentLinkModalProps> = ({
  isOpen,
  onClose,
  products,
  businessProfile,
  onSendPaymentLinkToChat,
}) => {
  if (!isOpen) return null;

  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || "");
  const [customAmount, setCustomAmount] = useState(products[0]?.price || 1500);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState("Acceso inmediato + Garantía de 30 días");

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  const finalAmount = Math.round(
    (customAmount || selectedProduct?.price || 1500) * (1 - discountPercent / 100)
  );

  const checkoutUrl = `https://pay.example.com/checkout?amount=${finalAmount}&cur=${businessProfile.defaultCurrency}&product=${encodeURIComponent(
    selectedProduct?.name || "Servicio"
  )}`;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = `💳 *Enlace de Pago Seguro Generado*\n\nHola, aquí tienes tu enlace exclusivo para adquirir *${selectedProduct?.name}* por *$${finalAmount.toLocaleString()} ${businessProfile.defaultCurrency}*${
      discountPercent > 0 ? ` (${discountPercent}% de descuento aplicado)` : ""
    }.\n\n*Detalles:* ${paymentNote}.\n\n👉 *Realiza tu pago seguro aquí:* ${checkoutUrl}`;
    onSendPaymentLinkToChat(checkoutUrl, finalAmount, msg);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 font-display">
                Generar Enlace de Pago Directo
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                Crea un checkout personalizado para enviar al cliente por chat
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-bold">
            ✕
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Producto o Servicio:
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                const prod = products.find((p) => p.id === e.target.value);
                if (prod) setCustomAmount(prod.price);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.price.toLocaleString()} {p.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Monto ({businessProfile.defaultCurrency}):
              </label>
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-display"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Descuento Especial:
              </label>
              <select
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 font-medium"
              >
                <option value={0}>Sin Descuento (0%)</option>
                <option value={5}>5% Descuento</option>
                <option value={10}>10% Descuento Especial</option>
                <option value={15}>15% Cierre Inmediato</option>
                <option value={20}>20% Oferta Flash</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Nota / Garantía del Pedido:
            </label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Summary Box */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-semibold">Total a Cobrar:</span>
              <span className="text-lg font-black text-slate-900 font-display">
                ${finalAmount.toLocaleString()} {businessProfile.defaultCurrency}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 pt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Checkout seguro con tarjeta de crédito/débito y transferencia</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-sm transition-transform active:scale-95"
            >
              <Send className="w-3.5 h-3.5 fill-white" />
              <span>Enviar Enlace al Chat</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


