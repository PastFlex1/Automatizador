import React, { useState } from "react";
import {
  Plus,
  Copy,
  Check,
  Send,
  Trash2,
  Package,
  ShoppingBag,
  Upload,
  Loader2,
  Sparkles,
  ExternalLink,
  ImageIcon,
  Eye,
  Pencil,
  X,
  MessageCircle,
  ShieldCheck,
  Tag,
  DollarSign,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Product, BusinessProfile } from "../types";
import { hasRealPhoto } from "../utils/image-utils";

interface ProductCatalogProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  businessProfile: BusinessProfile;
  onSendProductToChat?: (product: Product) => void;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  products,
  setProducts,
  businessProfile,
  onSendProductToChat,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedMarketplaceId, setCopiedMarketplaceId] = useState<string | null>(null);
  const [publishingProductId, setPublishingProductId] = useState<string | null>(null);

  // Preview state
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  // Facebook Publish feedback states
  const [publishSuccessResult, setPublishSuccessResult] = useState<{
    productName: string;
    postUrl: string;
    caption: string;
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    category: "",
    price: 0,
    currency: "USD",
    tagline: "",
    description: "",
    featuresText: "",
    imageUrl: "",
    checkoutUrl: "",
  });
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [isUploadingEditImage, setIsUploadingEditImage] = useState(false);

  // Add Product state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "Cocinas Industriales",
    price: 200,
    currency: businessProfile.defaultCurrency || "USD",
    tagline: "",
    description: "",
    featuresText: "Acero inoxidable de grado alimenticio\nQuemadores de alta potencia\nBandeja recolectora desmontable",
    checkoutUrl: "https://wa.me/?text=Hola%20APM%20Inox,%20deseo%20cotizar%20este%20equipo",
    imageUrl: "",
  });

  const handleCopyMarketplaceFicha = (prod: Product) => {
    const ficha = `✨ ${prod.name.toUpperCase()} ✨\n\n💰 PRECIO: $${prod.price} (Precio directo de fábrica)\n📍 UBICACIÓN: Quito Norte, frente al Club de Leones\n🛡️ GARANTÍA: Acero inoxidable de grado alimenticio\n\nCARACTERÍSTICAS:\n${(prod.features || []).map((f) => `• ${f}`).join('\n')}\n\n✅ Entrega inmediata y envíos seguros a nivel nacional.\n👇 Escríbenos por mensaje para apartar la tuya o cotizar tu equipo a medida.`;

    navigator.clipboard.writeText(ficha);
    setCopiedMarketplaceId(prod.id);
    setTimeout(() => setCopiedMarketplaceId(null), 3000);

    window.open("https://www.facebook.com/marketplace/create/item", "_blank");
  };

  const handlePublishProductToFacebook = async (prod: Product) => {
    setPublishingProductId(prod.id);
    setPublishError(null);
    try {
      const res = await fetch("/api/social/autopilot/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: prod }),
      });
      const json = await res.json();
      if (json.success) {
        const postData = json.data || {};
        setPublishSuccessResult({
          productName: prod.name,
          postUrl: postData.externalPostUrl || `https://www.facebook.com/1323037820891730`,
          caption: postData.caption || "",
        });
      } else {
        setPublishError(json.error || "No se pudo completar la publicación en Facebook. Verifica tu conexión o token.");
      }
    } catch (err: any) {
      setPublishError(`Error de red al conectar con el servidor: ${err.message}`);
    } finally {
      setPublishingProductId(null);
    }
  };

  // Image upload for Add Product
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setImagePreview(base64Data);
      setIsUploadingImage(true);
      try {
        const res = await fetch("/api/upload/equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            base64Data,
          }),
        });
        const json = await res.json();
        if (json.success && json.url) {
          setNewProduct((prev) => ({ ...prev, imageUrl: json.url }));
        }
      } catch (err) {
        console.error("Error uploading image locally:", err);
      } finally {
        setIsUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Image upload for Edit Product
  const handleEditFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      setEditImagePreview(base64Data);
      setIsUploadingEditImage(true);
      try {
        const res = await fetch("/api/upload/equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            base64Data,
          }),
        });
        const json = await res.json();
        if (json.success && json.url) {
          setEditFormData((prev) => ({ ...prev, imageUrl: json.url }));
        }
      } catch (err) {
        console.error("Error uploading image locally:", err);
      } finally {
        setIsUploadingEditImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;

    const featuresList = newProduct.featuresText
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const created: Product = {
      id: `prod-${Date.now()}`,
      name: newProduct.name,
      category: newProduct.category || "Equipos Gastronómicos",
      price: Number(newProduct.price),
      currency: businessProfile.defaultCurrency || "USD",
      tagline: newProduct.tagline || "",
      description: newProduct.description || "",
      features: featuresList.length > 0 ? featuresList : ["Acero inoxidable de alta resistencia"],
      objectionHooks: {
        price: "Fabricación directa sin intermediarios con el mejor precio garantizado",
        guarantee: "Garantía de fábrica en soldaduras y componentes de acero inox",
      },
      checkoutUrl: newProduct.checkoutUrl || `https://wa.me/?text=Hola%20APM%20Inox,%20deseo%20cotizar%20${encodeURIComponent(newProduct.name)}`,
      imageUrl: newProduct.imageUrl || "",
    };

    const updated = [created, ...products];
    setProducts(updated);
    persistCatalog(updated);

    setShowAddModal(false);
    setImagePreview(null);
    setNewProduct({
      name: "",
      category: "Cocinas Industriales",
      price: 200,
      currency: businessProfile.defaultCurrency || "USD",
      tagline: "",
      description: "",
      featuresText: "Acero inoxidable de grado alimenticio\nQuemadores de alta potencia\nBandeja recolectora desmontable",
      checkoutUrl: "https://wa.me/?text=Hola%20APM%20Inox,%20deseo%20cotizar%20este%20equipo",
      imageUrl: "",
    });

    setToastMessage(`✓ "${created.name}" agregado al catálogo con éxito`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const persistCatalog = async (updatedList: Product[]) => {
    try {
      localStorage.setItem("metacloser_products", JSON.stringify(updatedList));
      await fetch("/api/crm/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: updatedList }),
      });
    } catch (e) {
      console.warn("Could not sync products with server:", e);
    }
  };

  const handleStartEdit = (prod: Product) => {
    setEditingProduct(prod);
    setEditFormData({
      name: prod.name || "",
      category: prod.category || "Equipos Gastronómicos",
      price: typeof prod.price === "number" ? prod.price : (parseFloat(prod.price as any) || 0),
      currency: prod.currency || businessProfile.defaultCurrency || "USD",
      tagline: prod.tagline || "",
      description: prod.description || "",
      featuresText: (Array.isArray(prod.features) ? prod.features : []).join("\n"),
      imageUrl: prod.imageUrl || "",
      checkoutUrl: prod.checkoutUrl || "",
    });
    setEditImagePreview(prod.imageUrl || null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editFormData.name) return;

    const featuresList = editFormData.featuresText
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const updated: Product = {
      ...editingProduct,
      name: editFormData.name.trim(),
      category: editFormData.category?.trim() || "Equipos Gastronómicos",
      price: Number(editFormData.price) || 0,
      currency: editFormData.currency || businessProfile.defaultCurrency || "USD",
      tagline: editFormData.tagline?.trim() || "",
      description: editFormData.description?.trim() || "",
      features: featuresList,
      imageUrl: editFormData.imageUrl || editingProduct.imageUrl,
      checkoutUrl: editFormData.checkoutUrl || editingProduct.checkoutUrl,
    };

    const updatedProducts = products.map((p) => (p.id === updated.id ? updated : p));
    setProducts(updatedProducts);
    persistCatalog(updatedProducts);

    // If currently previewing this product, update preview view as well
    if (previewProduct && previewProduct.id === updated.id) {
      setPreviewProduct(updated);
    }

    setEditingProduct(null);
    setToastMessage(`✓ "${updated.name}" actualizado correctamente`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const confirmDeleteProduct = (prod: Product) => {
    const updated = products.filter((p) => p.id !== prod.id);
    setProducts(updated);
    persistCatalog(updated);

    if (previewProduct?.id === prod.id) {
      setPreviewProduct(null);
    }
    setProductToDelete(null);
    setToastMessage(`🗑️ "${prod.name}" eliminado del catálogo`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="flex-1 w-full h-full bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 md:p-6 shadow-sm border border-slate-200/80 flex flex-col overflow-y-auto custom-scrollbar">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight font-display flex items-center gap-2">
            <span>Catálogo de Equipos APM Inox</span>
            <span className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold border border-indigo-200/60">
              {products.length} {products.length === 1 ? 'Equipo' : 'Equipos'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Administra, edita y previsualiza tus cocinas, mesas y campanas de acero inoxidable.
          </p>
        </div>

        <button
          onClick={() => {
            setImagePreview(null);
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:scale-[1.02] cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Equipo</span>
        </button>
      </div>

      {/* Real-photo coverage: the AutoPilot only publishes products with a real photo */}
      {(() => {
        const missing = products.filter((p) => !hasRealPhoto(p.imageUrl)).length;
        if (missing === 0) return null;
        return (
          <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <p>
              <strong>{missing} de {products.length} equipos no tienen foto real</strong> (no tienen foto o usan una imagen genérica de internet).
              El AutoPilot solo publica los equipos con foto real. Usa <strong>Editar</strong> en cada uno para subir una foto de tu taller o de una instalación.
            </p>
          </div>
        );
      })()}

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {products.map((prod) => (
          <div
            key={prod.id}
            className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow group relative"
          >
            <div>
              {/* Product Image with hover preview badge */}
              <div
                onClick={() => setPreviewProduct(prod)}
                className="w-full h-44 rounded-xl overflow-hidden mb-3 relative bg-slate-200 cursor-pointer group/img"
                title="Haz clic para previsualizar este equipo"
              >
                {hasRealPhoto(prod.imageUrl) ? (
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                    onError={(e: any) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(prod);
                    }}
                    className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-100 border-2 border-dashed border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                    title="Sube una foto real de este equipo"
                  >
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-xs font-bold">Sin foto real</span>
                    <span className="text-[10px] font-medium text-amber-600">Clic para subir una foto de tu equipo</span>
                  </button>
                )}
                <span className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-xs text-white font-bold text-xs px-2.5 py-1 rounded-lg">
                  ${prod.price} {prod.currency}
                </span>
                <span className="absolute top-2 left-2 bg-blue-600/90 text-white font-bold text-[10px] px-2 py-0.5 rounded-md">
                  {prod.category}
                </span>

                {/* Overlay on hover indicating click to preview */}
                <div className={`absolute inset-0 bg-slate-900/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none ${hasRealPhoto(prod.imageUrl) ? "" : "hidden"}`}>
                  <span className="bg-white/95 text-slate-800 font-bold text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    Previsualizar
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-2 mb-1">
                <h3
                  onClick={() => setPreviewProduct(prod)}
                  className="font-bold text-slate-900 text-sm font-display hover:text-indigo-600 cursor-pointer transition-colors"
                  title="Haz clic para ver detalles completos"
                >
                  {prod.name}
                </h3>
              </div>

              {prod.tagline && (
                <p className="text-xs text-indigo-600 font-semibold mb-2">
                  {prod.tagline}
                </p>
              )}

              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                {prod.description}
              </p>

              {/* Key Features */}
              {prod.features && prod.features.length > 0 && (
                <div className="space-y-1 bg-white p-2.5 rounded-xl border border-slate-200/80 text-xs mt-3">
                  <span className="font-bold text-slate-700 block text-[10px] uppercase tracking-wider">
                    Características de Fábrica:
                  </span>
                  {prod.features.slice(0, 3).map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-slate-600 text-[11px]">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span className="line-clamp-1">{f}</span>
                    </div>
                  ))}
                  {prod.features.length > 3 && (
                    <button
                      onClick={() => setPreviewProduct(prod)}
                      className="text-[10px] text-indigo-600 font-semibold hover:underline block pt-0.5"
                    >
                      + {prod.features.length - 3} características más...
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions Toolbar */}
            <div className="pt-3 mt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Previsualizar Button */}
                <button
                  onClick={() => setPreviewProduct(prod)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200/70 shadow-2xs transition-colors cursor-pointer"
                  title="Ver previsualización completa y detalles del producto"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ver</span>
                </button>

                {/* Editar Button */}
                <button
                  onClick={() => handleStartEdit(prod)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200/80 shadow-2xs transition-colors cursor-pointer"
                  title="Editar nombre, precio, descripción, foto y características"
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-600" />
                  <span>Editar</span>
                </button>

                {/* Marketplace Ficha Button */}
                <button
                  onClick={() => handleCopyMarketplaceFicha(prod)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 shadow-2xs transition-colors cursor-pointer"
                  title="Copia el texto vendedero y abre Marketplace para publicar en 20s"
                >
                  {copiedMarketplaceId === prod.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-blue-600" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                      <span>Ficha Marketplace</span>
                    </>
                  )}
                </button>

                {/* Publish to Facebook Page */}
                <button
                  onClick={() => handlePublishProductToFacebook(prod)}
                  disabled={publishingProductId === prod.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                  title="Publicar este equipo inmediatamente en la página de Facebook"
                >
                  {publishingProductId === prod.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  <span>Publicar FB</span>
                </button>
              </div>

              {/* Delete Button */}
              <button
                onClick={() => setProductToDelete(prod)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer ml-auto"
                title="Eliminar este equipo del catálogo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: PREVISUALIZACIÓN COMPLETA DEL PRODUCTO         */}
      {/* ======================================================== */}
      {previewProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 max-w-2xl w-full max-h-[92vh] overflow-y-auto space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Eye className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 font-display">
                    Previsualización del Producto
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Vista previa de catálogo y detalles para clientes
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Body Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Left Column: Image & Price Badge */}
              <div className="space-y-3">
                <div className="w-full h-56 sm:h-64 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80 relative shadow-inner">
                  {hasRealPhoto(previewProduct.imageUrl) ? (
                    <img
                      src={previewProduct.imageUrl}
                      alt={previewProduct.name}
                      className="w-full h-full object-cover"
                      onError={(e: any) => {
                        e.target.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-amber-700">
                      <ImageIcon className="w-10 h-10" />
                      <span className="text-sm font-bold">Este equipo aún no tiene foto real</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 bg-blue-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">
                    {previewProduct.category}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Precio de Fábrica
                    </span>
                    <span className="text-2xl font-black text-slate-900">
                      ${previewProduct.price} <span className="text-xs font-bold text-slate-500">{previewProduct.currency}</span>
                    </span>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200/80">
                    Disponibilidad Inmediata
                  </span>
                </div>
              </div>

              {/* Right Column: Descriptions & Details */}
              <div className="space-y-3 text-xs">
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {previewProduct.name}
                  </h3>
                  {previewProduct.tagline && (
                    <p className="text-xs text-indigo-600 font-semibold mt-1">
                      {previewProduct.tagline}
                    </p>
                  )}
                </div>

                <div>
                  <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider mb-1">
                    Descripción:
                  </span>
                  <p className="text-slate-600 leading-relaxed bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                    {previewProduct.description || "Sin descripción detallada."}
                  </p>
                </div>

                {/* Features List */}
                {previewProduct.features && previewProduct.features.length > 0 && (
                  <div>
                    <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider mb-1.5">
                      Especificaciones de Fábrica:
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                      {previewProduct.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-slate-700 text-xs">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Objection hooks / Guarantee if available */}
                <div className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200/60 text-amber-900 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Garantía de fabricación en acero inoxidable grado alimenticio.</span>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const prodToEdit = previewProduct;
                    setPreviewProduct(null);
                    handleStartEdit(prodToEdit);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs border border-indigo-200 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Editar este Equipo</span>
                </button>

                <button
                  onClick={() => {
                    const prodToDelete = previewProduct;
                    setPreviewProduct(null);
                    setProductToDelete(prodToDelete);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl text-xs border border-rose-200 transition-colors cursor-pointer"
                  title="Eliminar este equipo del catálogo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyMarketplaceFicha(previewProduct)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs border border-blue-200 transition-colors cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Ficha Marketplace</span>
                </button>

                <button
                  onClick={() => handlePublishProductToFacebook(previewProduct)}
                  disabled={publishingProductId === previewProduct.id}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {publishingProductId === previewProduct.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Publicar en FB</span>
                </button>

                <button
                  onClick={() => setPreviewProduct(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: EDITAR PRODUCTO EXISTENTE                       */}
      {/* ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 max-w-lg w-full max-h-[92vh] overflow-y-auto space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 font-display">
                <Pencil className="w-5 h-5 text-indigo-600" />
                <span>Editar Equipo del Catálogo</span>
              </h2>
              <button
                onClick={() => setEditingProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              {/* Photo Upload from Computer */}
              <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  <span>Foto del Equipo:</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditFileSelect}
                    className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                  />
                  {isUploadingEditImage && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                  {editImagePreview && (
                    <img
                      src={editImagePreview}
                      alt="Vista previa"
                      className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm"
                    />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Puedes seleccionar una nueva foto desde tu computadora o mantener la actual.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nombre del Equipo:
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Precio ($ USD):
                  </label>
                  <input
                    type="number"
                    required
                    value={editFormData.price}
                    onChange={(e) => setEditFormData({ ...editFormData, price: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Categoría:
                  </label>
                  <input
                    type="text"
                    value={editFormData.category}
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Subtítulo / Propuesta de Valor:
                </label>
                <input
                  type="text"
                  value={editFormData.tagline}
                  onChange={(e) => setEditFormData({ ...editFormData, tagline: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Descripción del Equipo:
                </label>
                <textarea
                  rows={3}
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Características de Fábrica (una por línea):
                </label>
                <textarea
                  rows={4}
                  value={editFormData.featuresText}
                  onChange={(e) => setEditFormData({ ...editFormData, featuresText: e.target.value })}
                  placeholder="Acero inoxidable grado alimenticio&#10;Quemadores de alta potencia&#10;Bandeja recolectora desmontable"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm transition-all cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: REGISTRAR NUEVO EQUIPO                          */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 max-w-lg w-full max-h-[92vh] overflow-y-auto space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 font-display">
                <Package className="w-5 h-5 text-indigo-600" />
                <span>Registrar Nuevo Equipo de Acero Inox</span>
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
              {/* Photo Upload from Computer */}
              <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  <span>Foto del Equipo (Se guarda en tu computadora):</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                  />
                  {isUploadingImage && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Vista previa"
                      className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm"
                    />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  La imagen se guardará en <code>public/equipos/</code> en tu computadora.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Nombre del Equipo:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Cocina Industrial 2 Quemadores Alta Presión"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Precio ($ USD):
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="200"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Categoría:
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Cocinas Industriales, Mesas, Campanas"
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Subtítulo / Propuesta de Valor:
                </label>
                <input
                  type="text"
                  placeholder="ej. Acero inoxidable grado alimenticio 1mm de alta durabilidad"
                  value={newProduct.tagline}
                  onChange={(e) => setNewProduct({ ...newProduct, tagline: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Descripción del Equipo:
                </label>
                <textarea
                  rows={2}
                  placeholder="Medidas, quemadores de hierro fundido, garantía directa de fábrica..."
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Características de Fábrica (una por línea):
                </label>
                <textarea
                  rows={3}
                  value={newProduct.featuresText}
                  onChange={(e) => setNewProduct({ ...newProduct, featuresText: e.target.value })}
                  placeholder="Acero inoxidable grado alimenticio&#10;Quemadores de alta potencia&#10;Bandeja recolectora desmontable"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:border-indigo-400 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm transition-all cursor-pointer"
                >
                  Guardar en mi Computadora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* MODAL 4: ÉXITO AL PUBLICAR EN FACEBOOK                   */}
      {/* ======================================================== */}
      {publishSuccessResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 font-display">
                    ¡Publicado en Facebook!
                  </h2>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Página Oficial APM inox 1
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPublishSuccessResult(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl">
              <p className="text-xs font-bold text-emerald-900 mb-1">
                🎉 El equipo &quot;{publishSuccessResult.productName}&quot; ya está en vivo en Facebook.
              </p>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Tus clientes y prospectos ya pueden ver la publicación y cotizar directamente por Messenger.
              </p>
            </div>

            {publishSuccessResult.caption && (
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 max-h-36 overflow-y-auto custom-scrollbar text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">
                <span className="font-bold text-slate-700 block mb-1 text-[10px] uppercase tracking-wider">
                  Copy publicado:
                </span>
                {publishSuccessResult.caption}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setPublishSuccessResult(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 text-xs cursor-pointer transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  window.open(publishSuccessResult.postUrl, "_blank", "noopener,noreferrer");
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer hover:scale-[1.02]"
              >
                <span>Ver Publicación en Facebook</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: ERROR AL PUBLICAR EN FACEBOOK                   */}
      {/* ======================================================== */}
      {publishError && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-5 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 font-display">
                    Error al Publicar en Facebook
                  </h2>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Aviso del sistema Meta Graph API
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPublishError(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-2xl text-xs text-rose-900 leading-relaxed">
              {publishError}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setPublishError(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: CONFIRMAR ELIMINACIÓN DE EQUIPO                 */}
      {/* ======================================================== */}
      {productToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900 font-display">
                ¿Eliminar equipo del catálogo?
              </h3>
              <p className="text-xs text-slate-500">
                ¿Estás seguro de que deseas eliminar <strong className="text-slate-700">"{productToDelete.name}"</strong>?
                Esta acción lo removerá de tu catálogo y de las cotizaciones automáticas.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center gap-3">
              <img
                src={productToDelete.imageUrl}
                alt={productToDelete.name}
                className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                onError={(e: any) => {
                  e.target.style.display = "none";
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 truncate">{productToDelete.name}</div>
                <div className="text-xs font-extrabold text-emerald-600">${productToDelete.price} {productToDelete.currency}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteProduct(productToDelete)}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TOAST FEEDBACK NOTIFICATION                              */}
      {/* ======================================================== */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
