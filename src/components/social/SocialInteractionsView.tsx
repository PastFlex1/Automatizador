import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Facebook,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  UserCheck,
  Tag,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Sliders,
  Send,
} from 'lucide-react';
import { Product } from '../../types';

interface SocialInteractionsViewProps {
  products: Product[];
}

export const SocialInteractionsView: React.FC<SocialInteractionsViewProps> = ({ products }) => {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'LEADS_ONLY' | 'COMMENT' | 'DIRECT_MESSAGE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTriggersModal, setShowTriggersModal] = useState(false);

  // New Trigger Form
  const [newKeywords, setNewKeywords] = useState('INFO, PRECIO, COTIZAR, ME INTERESA');
  const [newProductId, setNewProductId] = useState<string>('');
  const [isSavingTrigger, setIsSavingTrigger] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Load interactions
      const interRes = await fetch('/api/social/interactions');
      const interJson = await interRes.json();
      if (interJson.success) {
        setInteractions(interJson.data || []);
      }

      // 2. Load triggers
      const trigRes = await fetch('/api/social/triggers');
      const trigJson = await trigRes.json();
      if (trigJson.success) {
        setTriggers(trigJson.data || []);
      }
    } catch (err) {
      console.error('Error loading social interactions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywords.trim()) return;

    setIsSavingTrigger(true);
    try {
      const kwList = newKeywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      const res = await fetch('/api/social/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: kwList,
          productId: newProductId || undefined,
          action: 'CREATE_LEAD',
          active: true,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setNewKeywords('INFO, PRECIO, COTIZAR, ME INTERESA');
        setNewProductId('');
        await loadData();
      }
    } catch (err) {
      console.error('Error creating trigger rule:', err);
    } finally {
      setIsSavingTrigger(false);
    }
  };

  const handleDeleteTrigger = async (triggerId: number) => {
    try {
      await fetch(`/api/social/triggers/${triggerId}`, { method: 'DELETE' });
      setTriggers(triggers.filter((t) => t.id !== triggerId));
    } catch (err) {
      console.error('Error deleting trigger:', err);
    }
  };

  const handleToggleTrigger = async (trigger: any) => {
    try {
      const res = await fetch(`/api/social/triggers/${trigger.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !trigger.active }),
      });
      const json = await res.json();
      if (json.success) {
        setTriggers(triggers.map((t) => (t.id === trigger.id ? { ...t, active: !t.active } : t)));
      }
    } catch (err) {
      console.error('Error updating trigger:', err);
    }
  };

  // Filtered interactions
  const filteredInteractions = interactions.filter((item) => {
    if (filterType === 'LEADS_ONLY' && item.processingStatus !== 'PROCESSED' && !item.leadId) {
      return false;
    }
    if (filterType === 'COMMENT' && item.type !== 'COMMENT') return false;
    if (filterType === 'DIRECT_MESSAGE' && item.type !== 'DIRECT_MESSAGE') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchContent = item.content?.toLowerCase().includes(q);
      const matchAuthor = item.authorName?.toLowerCase().includes(q);
      const matchKeyword = item.metadata?.matchedKeyword?.toLowerCase().includes(q);
      if (!matchContent && !matchAuthor && !matchKeyword) return false;
    }

    return true;
  });

  const leadCount = interactions.filter((i) => i.leadId || i.metadata?.isCommercialIntent).length;
  const commentCount = interactions.filter((i) => i.type === 'COMMENT').length;
  const dmCount = interactions.filter((i) => i.type === 'DIRECT_MESSAGE').length;

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">Interacciones & Conversión de Leads</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Meta Webhook Activo
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Captura legítima de comentarios y mensajes de Facebook sin bots de spam ni automatizaciones invasivas.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowTriggersModal(true)}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-xs"
          >
            <Sliders className="w-4 h-4 text-gray-500" />
            Reglas de Disparo ({triggers.length})
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Interacciones</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{interactions.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Capturadas vía Webhook</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Leads Generados</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{leadCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Por intención de compra</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Comentarios FB</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">{commentCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">En posts vinculados</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-600">Messenger DMs</span>
          <p className="text-2xl font-bold text-purple-600 mt-1">{dmCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Conversaciones entrantes</p>
        </div>
      </div>

      {/* Filters & Search Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === 'ALL'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas ({interactions.length})
          </button>
          <button
            onClick={() => setFilterType('LEADS_ONLY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filterType === 'LEADS_ONLY'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Leads Calificados ({leadCount})
          </button>
          <button
            onClick={() => setFilterType('COMMENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filterType === 'COMMENT'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <Facebook className="w-3.5 h-3.5" />
            Comentarios ({commentCount})
          </button>
          <button
            onClick={() => setFilterType('DIRECT_MESSAGE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              filterType === 'DIRECT_MESSAGE'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Messenger ({dmCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por autor, texto o keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Interactions Feed List */}
      {filteredInteractions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No hay interacciones registradas</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            Los comentarios de tus publicaciones en Facebook y los mensajes directos de Messenger aparecerán aquí automáticamente al ser recibidos vía Webhook.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInteractions.map((item) => {
            const isLead = !!item.leadId || item.metadata?.isCommercialIntent;
            const isDM = item.type === 'DIRECT_MESSAGE';
            const matchedKeyword = item.metadata?.matchedKeyword;

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl p-4 transition-all hover:shadow-sm ${
                  isLead
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Author & Platform */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                        isDM
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {item.authorName
                        ? item.authorName
                            .split(' ')
                            .map((n: string) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                        : 'FB'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">
                          {item.authorName || `Usuario ${item.externalUserId?.slice(-4) || 'Facebook'}`}
                        </span>
                        {isDM ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" /> Messenger
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                            <Facebook className="w-3 h-3" /> Comentario FB
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(item.occurredAt || item.createdAt).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    {matchedKeyword && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Trigger: "{matchedKeyword}"
                      </span>
                    )}

                    {isLead ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Lead Calificado en CRM
                      </span>
                    ) : isDM ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        Conversación Guardada
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Sin Intención Comercial
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Message */}
                <div className="mt-3 pl-12">
                  <p className="text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg p-3 font-medium">
                    "{item.content}"
                  </p>

                  {/* Attribution Info */}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    {item.post && (
                      <span>
                        📌 En Post: <strong className="text-gray-700">{item.post.caption?.substring(0, 40)}...</strong>
                      </span>
                    )}
                    {item.contact && (
                      <span>
                        👤 Contacto CRM: <strong className="text-gray-700">{item.contact.name}</strong>
                      </span>
                    )}
                    {item.lead && (
                      <span>
                        🎯 Score Lead: <strong className="text-emerald-700">{item.lead.score}/100</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trigger Rules Management Modal */}
      {showTriggersModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Reglas de Disparo (Lead Triggers)</h3>
                  <p className="text-xs text-gray-500">
                    Configura las palabras clave que convierten interacciones en prospectos comerciales.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTriggersModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Create New Trigger Form */}
            <form onSubmit={handleCreateTrigger} className="mt-5 space-y-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">Agregar Nueva Regla</span>
              
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Palabras Clave (separadas por comas)
                </label>
                <input
                  type="text"
                  placeholder="INFO, PRECIO, COTIZAR, ME INTERESA"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Vincular a Producto (Opcional)
                </label>
                <select
                  value={newProductId}
                  onChange={(e) => setNewProductId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sin producto específico (Cualquier oferta)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.currency} ${p.price})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSavingTrigger}
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                {isSavingTrigger ? 'Guardando...' : 'Crear Regla de Captura'}
              </button>
            </form>

            {/* Active Triggers List */}
            <div className="mt-6 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Reglas Activas ({triggers.length})
              </span>

              {triggers.length === 0 ? (
                <p className="text-xs text-gray-500 italic p-3 bg-gray-50 rounded-lg border">
                  No hay reglas personalizadas creadas. El sistema utiliza las palabras clave estándar: INFO, PRECIO, COTIZAR, ME INTERESA.
                </p>
              ) : (
                triggers.map((trigger) => (
                  <div
                    key={trigger.id}
                    className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-2xs"
                  >
                    <div>
                      <div className="flex flex-wrap gap-1">
                        {(trigger.keywords || []).map((kw: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-800 border"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        Acción: <strong className="text-emerald-700">{trigger.action}</strong>
                        {trigger.productId && (
                          <span className="ml-2">
                            • Producto: <strong>{products.find((p) => p.id === trigger.productId)?.name || trigger.productId}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleTrigger(trigger)}
                        className={`text-xs px-2.5 py-1 rounded font-medium ${
                          trigger.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {trigger.active ? 'Activo' : 'Pausado'}
                      </button>
                      <button
                        onClick={() => handleDeleteTrigger(trigger.id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Eliminar regla"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowTriggersModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
