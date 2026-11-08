import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Instagram,
  Facebook,
  AtSign,
  Image as ImageIcon,
  Video,
  Layers,
  Calendar,
  Send,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Product, BusinessProfile } from '../../types';
import { PLATFORM_CAPABILITIES, SocialPlatform, SocialContentType, SocialObjective } from '../../social/types';
import { validatePublicMediaUrl } from '../../social/utils/url-validator';

interface NewPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  businessProfile: BusinessProfile;
  connectedAccounts: any[];
  onPostCreated: () => void;
}

export const NewPostModal: React.FC<NewPostModalProps> = ({
  isOpen,
  onClose,
  products,
  businessProfile,
  connectedAccounts,
  onPostCreated,
}) => {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['INSTAGRAM', 'FACEBOOK']);
  const [contentType, setContentType] = useState<SocialContentType>('IMAGE');
  const [objective, setObjective] = useState<SocialObjective>('LEADS');
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [cta, setCta] = useState('');
  const [mediaUrl, setMediaUrl] = useState(
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80'
  );
  const [scheduledDate, setScheduledDate] = useState('');
  const [isScheduledMode, setIsScheduledMode] = useState(false);

  // Lead Trigger Configuration
  const [enableLeadCapture, setEnableLeadCapture] = useState(true);
  const [leadKeywords, setLeadKeywords] = useState('INFO, PRECIO, COTIZAR, ME INTERESA');

  // Publisher Mode state
  const [publisherMode, setPublisherMode] = useState<'mock' | 'meta'>('mock');
  const [isRealMode, setIsRealMode] = useState(false);

  // OpenAI Generation State
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiVariations, setAiVariations] = useState<any[]>([]);
  const [selectedTone, setSelectedTone] = useState('Persuasivo, fiduciario y orientado a conversión directa');

  // Submit states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<SocialPlatform>('INSTAGRAM');

  // Pre-Publish Confirmation Dialog state
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Post-Publish Result state
  const [publishResultData, setPublishResultData] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Fetch current publisher mode
      fetch('/api/social/publisher/mode')
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            setPublisherMode(json.data.mode);
            setIsRealMode(json.data.isRealMode);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  // Character limit validation for shortest selected platform
  const minCharLimit = selectedPlatforms.reduce((min, p) => {
    const limit = PLATFORM_CAPABILITIES[p]?.maxCaptionLength || 2200;
    return limit < min ? limit : min;
  }, 63206);

  const togglePlatform = (p: SocialPlatform) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((x) => x !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  // Check URL validation
  const mediaUrlValidation = mediaUrl ? validatePublicMediaUrl(mediaUrl) : { isValid: true };

  // Target accounts calculation
  const targetAccounts = connectedAccounts.filter((acc) =>
    selectedPlatforms.includes(acc.platform) && acc.status === 'CONNECTED'
  );

  // Generate content with OpenAI (Does NOT publish automatically)
  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/social/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selectedProduct?.name || businessProfile?.companyName || 'MetaCloser',
          productDescription: selectedProduct?.description || businessProfile?.industry || 'Soluciones comerciales',
          productPrice: selectedProduct ? `$${selectedProduct.price}` : undefined,
          objective,
          platform: selectedPlatforms[0] || 'INSTAGRAM',
          tone: selectedTone,
          keyBenefits: selectedProduct?.features || [
            'Atención personalizada',
            'Garantía fiduciaria',
            'Cierre asistido',
          ],
          callToAction: cta || 'Enviar mensaje privado para recibir asesoría personalizada',
        }),
      });

      const json = await res.json();
      if (json.success && json.data?.options) {
        setAiVariations(json.data.options);
        const first = json.data.options[0];
        if (first) {
          setTitle(first.hook);
          setCaption(`${first.hook}\n\n${first.caption}\n\n${first.cta}\n\n${first.hashtags?.join(' ') || ''}`);
          setCta(first.cta);
          if (first.recommendedFormat) setContentType(first.recommendedFormat);
        }
      } else {
        setErrorMsg(json.error || 'No se pudo generar contenido con IA');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión con el servicio de IA');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Pre-publish check
  const handlePublishClick = () => {
    if (!caption.trim()) {
      setErrorMsg('Debes redactar un copy antes de publicar.');
      return;
    }

    if (contentType !== 'TEXT' && !mediaUrl) {
      setErrorMsg('Instagram y las publicaciones con imagen requieren una URL de multimedia.');
      return;
    }

    if (mediaUrl && !mediaUrlValidation.isValid) {
      setErrorMsg(mediaUrlValidation.error || 'La URL de la imagen no es válida.');
      return;
    }

    if (targetAccounts.length === 0) {
      setErrorMsg('No hay cuentas conectadas activas para las plataformas seleccionadas. Ve a Canales para conectar Meta.');
      return;
    }

    // Open confirmation dialog
    setShowConfirmModal(true);
  };

  // Execute publication
  const handleExecuteSaveOrPublish = async (publishImmediately = false) => {
    setShowConfirmModal(false);
    setIsSubmitting(true);
    setErrorMsg(null);

    const targetAccountIds = targetAccounts.map((acc) => acc.id);

    try {
      // 1. Create Post
      const postPayload: any = {
        title: title || caption.substring(0, 40),
        caption,
        contentType,
        objective,
        productId: selectedProductId || null,
        cta,
        targetAccountIds,
        mediaAssets: mediaUrl
          ? [
              {
                type: contentType === 'VIDEO' || contentType === 'REEL' ? 'VIDEO' : 'IMAGE',
                url: mediaUrl,
                position: 0,
              },
            ]
          : [],
        scheduledAt: isScheduledMode && scheduledDate ? new Date(scheduledDate).toISOString() : null,
        status: isScheduledMode && scheduledDate ? 'SCHEDULED' : 'DRAFT',
      };

      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postPayload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error al guardar publicación');
      }

      const createdPost = json.data;

      // Create linked Lead Trigger Rule if requested
      if (enableLeadCapture && createdPost?.id) {
        try {
          const kwList = leadKeywords
            .split(',')
            .map((k) => k.trim())
            .filter((k) => k.length > 0);

          await fetch('/api/social/triggers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              socialPostId: createdPost.id,
              keywords: kwList.length > 0 ? kwList : ['INFO', 'PRECIO', 'COTIZAR', 'ME INTERESA'],
              productId: selectedProductId || undefined,
              action: 'CREATE_LEAD',
              active: true,
            }),
          });
        } catch (trigErr) {
          console.warn('Could not create trigger for post:', trigErr);
        }
      }

      // 2. Publish immediately if requested
      if (publishImmediately && createdPost?.id) {
        const pubRes = await fetch(`/api/social/posts/${createdPost.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const pubJson = await pubRes.json();
        if (pubRes.ok && pubJson.success) {
          setPublishResultData(pubJson.data);
          onPostCreated();
          return;
        } else {
          setErrorMsg(pubJson.error || 'Error durante la publicación');
        }
      }

      onPostCreated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error al procesar la publicación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">Crear Publicación Social</h2>
            
            {/* Publisher Mode Guardrail Banner */}
            {isRealMode ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                PUBLICACIÓN REAL ACTIVADA (Meta Graph API)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                MODO SIMULACIÓN (MOCK)
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {/* Left Column: Form & Settings (7 cols) */}
          <div className="lg:col-span-7 p-6 space-y-5 overflow-y-auto">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <button onClick={() => setErrorMsg(null)} className="p-1 text-rose-500 hover:text-rose-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Target Networks */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Canales Destino</label>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => togglePlatform('FACEBOOK')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    selectedPlatforms.includes('FACEBOOK')
                      ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Facebook className="w-4 h-4" />
                  <span>Facebook Page</span>
                </button>

                <button
                  type="button"
                  onClick={() => togglePlatform('INSTAGRAM')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    selectedPlatforms.includes('INSTAGRAM')
                      ? 'border-pink-600 bg-pink-50 text-pink-700 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Instagram className="w-4 h-4" />
                  <span>Instagram Business</span>
                </button>
              </div>
            </div>

            {/* Format Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Formato</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setContentType('IMAGE')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    contentType === 'IMAGE'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Imagen Única</span>
                </button>

                <button
                  type="button"
                  onClick={() => setContentType('TEXT')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    contentType === 'TEXT'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>Solo Texto (FB)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setContentType('STORY')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    contentType === 'STORY'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Estado / Historia</span>
                </button>
              </div>
            </div>

            {/* AI Generator Trigger */}
            <div className="p-4 bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl border border-indigo-100/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-semibold text-slate-900">Generador de Copy con IA</h4>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAi}
                  disabled={isGeneratingAi}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isGeneratingAi ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Redactando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generar Copy</span>
                    </>
                  )}
                </button>
              </div>

              {products.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Producto</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${p.price})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Tono de Comunicación</label>
                    <input
                      type="text"
                      value={selectedTone}
                      onChange={(e) => setSelectedTone(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Caption & Copy Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">Texto / Caption Oficial</label>
                <span
                  className={`text-[11px] ${
                    caption.length > minCharLimit ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {caption.length} / {minCharLimit} caracteres
                </span>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escribe el texto de tu publicación aquí o utiliza el generador de IA..."
                rows={5}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-hidden resize-none leading-relaxed"
              />
            </div>

            {/* Media URL Input (Public URL for Meta Graph API) */}
            {contentType !== 'TEXT' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  URL Pública de Imagen
                </label>
                <input
                  type="text"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono text-slate-700"
                />
                {!mediaUrlValidation.isValid ? (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {mediaUrlValidation.error}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Meta requiere una URL pública de imagen (HTTPS) accesible desde sus servidores.
                  </p>
                )}
              </div>
            )}

            {/* Lead Capture by Keywords Section */}
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-bold text-emerald-950">Capturar Leads en CRM Automáticamente</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableLeadCapture}
                    onChange={(e) => setEnableLeadCapture(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {enableLeadCapture && (
                <div className="space-y-2 pt-1 border-t border-emerald-100">
                  <label className="block text-[11px] font-semibold text-emerald-900">
                    Palabras clave para disparar creación de prospecto:
                  </label>
                  <input
                    type="text"
                    value={leadKeywords}
                    onChange={(e) => setLeadKeywords(e.target.value)}
                    placeholder="INFO, PRECIO, COTIZAR, ME INTERESA"
                    className="w-full text-xs p-2 rounded-xl bg-white border border-emerald-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-emerald-700">
                    Si un comentario en Facebook contiene alguna de estas palabras, se creará un Contacto y Lead calificado en tu CRM automáticamente.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Mockup Preview & Actions (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-slate-50/50 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700">Vista Previa</h3>
                <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform('INSTAGRAM')}
                    className={`p-1.5 rounded-md text-xs transition-all ${
                      previewPlatform === 'INSTAGRAM' ? 'bg-pink-50 text-pink-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <Instagram className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPlatform('FACEBOOK')}
                    className={`p-1.5 rounded-md text-xs transition-all ${
                      previewPlatform === 'FACEBOOK' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <Facebook className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Mock Device Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden text-xs">
                {/* Header Profile */}
                <div className="p-3 flex items-center justify-between border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-[10px]">
                      {(businessProfile?.companyName || 'MetaCloser').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 leading-tight">
                        {previewPlatform === 'INSTAGRAM'
                          ? (businessProfile?.companyName || 'metacloser_crm').toLowerCase().replace(/\s+/g, '_')
                          : (businessProfile?.companyName || 'MetaCloser CRM')}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {previewPlatform === 'INSTAGRAM'
                          ? 'Publicación • Instagram Business'
                          : 'Página Oficial • Facebook'}
                      </p>
                    </div>
                  </div>
                  <span className="text-slate-300 font-bold">•••</span>
                </div>

                {/* Media Container */}
                {mediaUrl && contentType !== 'TEXT' && (
                  <div className="w-full aspect-square bg-slate-900 flex items-center justify-center overflow-hidden">
                    <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Caption Content */}
                <div className="p-3.5 space-y-2">
                  <p className="text-slate-800 whitespace-pre-line leading-relaxed text-[11px] line-clamp-6">
                    {caption || 'Aquí se mostrará el texto redactado para tu publicación...'}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-200/60 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleExecuteSaveOrPublish(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Guardar Borrador
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handlePublishClick}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Publicando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Publicar Ahora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-Publish Confirmation Dialog */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Confirmar Publicación</h3>
                <p className="text-xs text-slate-500">
                  {isRealMode
                    ? 'Esta acción enviará la publicación inmediatamente a tus cuentas oficiales de Meta.'
                    : 'Esta acción simulará la publicación en modo de prueba (Mock).'}
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <p className="font-semibold text-slate-700">Vas a publicar en:</p>
              {targetAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between text-slate-600 py-0.5">
                  <div className="flex items-center gap-2">
                    {acc.platform === 'FACEBOOK' ? (
                      <Facebook className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Instagram className="w-3.5 h-3.5 text-pink-600" />
                    )}
                    <span>{acc.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">@{acc.username || acc.externalAccountId}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExecuteSaveOrPublish(true)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer"
              >
                Confirmar y Publicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Publish Results Modal */}
      {publishResultData && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  publishResultData.status === 'PUBLISHED'
                    ? 'bg-emerald-50 text-emerald-600'
                    : publishResultData.status === 'PARTIALLY_PUBLISHED'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-rose-50 text-rose-600'
                }`}
              >
                {publishResultData.status === 'PUBLISHED' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {publishResultData.status === 'PUBLISHED'
                    ? '¡Publicación Exitosa!'
                    : publishResultData.status === 'PARTIALLY_PUBLISHED'
                    ? 'Publicación Parcialmente Exitosa'
                    : 'Error en la Publicación'}
                </h3>
                <p className="text-xs text-slate-500">
                  Modo: <span className="font-semibold">{publishResultData.publisherMode?.toUpperCase()}</span>
                </p>
              </div>
            </div>

            {/* Results by target */}
            <div className="space-y-2.5">
              {publishResultData.results?.map((res: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs ${
                    res.result?.success
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/60 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{res.platform}</span>
                      {res.accountName && <span className="text-slate-500">({res.accountName})</span>}
                      {res.result?.success ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Publicado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                          Falló
                        </span>
                      )}
                    </div>
                    {res.result?.success ? (
                      <p className="text-[11px] font-mono text-emerald-700">
                        ID: {res.result?.externalPostId}
                      </p>
                    ) : (
                      <p className="text-[11px] text-rose-700">{res.result?.errorMessage}</p>
                    )}
                  </div>

                  {res.result?.externalPostUrl && (
                    <a
                      href={res.result.externalPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-semibold shadow-2xs"
                    >
                      <span>Ver Publicación</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setPublishResultData(null);
                  onClose();
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer"
              >
                Cerrar y Ver en CRM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
