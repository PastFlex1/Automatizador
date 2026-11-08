import React, { useState, useEffect } from 'react';
import {
  Instagram,
  Facebook,
  AtSign,
  ShieldCheck,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { SocialPlatform } from '../../social/types';

interface DiscoveredAccount {
  externalAccountId: string;
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'THREADS';
  name: string;
  username?: string;
  profilePictureUrl?: string;
  category?: string;
}

interface ConnectedAccountsViewProps {
  accounts: any[];
  onRefresh: () => void;
}

export const ConnectedAccountsView: React.FC<ConnectedAccountsViewProps> = ({
  accounts,
  onRefresh,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  
  // Selection Modal state
  const [discoveryId, setDiscoveryId] = useState<string | null>(null);
  const [discoveredAccounts, setDiscoveredAccounts] = useState<DiscoveredAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSavingSelection, setIsSavingSelection] = useState(false);

  // Manual Connection Modal State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    platform: 'FACEBOOK' as 'FACEBOOK' | 'INSTAGRAM',
    externalAccountId: '61593832447994',
    name: 'Página de Facebook (61593832447994)',
    username: '',
    accessToken: '',
  });
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Listen for OAuth messages from the popup window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'META_OAUTH_DISCOVERED') {
        const dId = event.data.discoveryId;
        if (dId) {
          setIsConnecting(false);
          await loadDiscoveredAccounts(dId);
        }
      } else if (event.data.type === 'META_OAUTH_ERROR') {
        setIsConnecting(false);
        setActionMessage({
          type: 'error',
          text: event.data.error || 'Error durante la autenticación con Meta.',
        });
      } else if (event.data.type === 'META_OAUTH_SUCCESS') {
        setIsConnecting(false);
        onRefresh();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const loadDiscoveredAccounts = async (dId: string) => {
    try {
      const res = await fetch(`/api/social/meta/discovered-accounts?discoveryId=${encodeURIComponent(dId)}`);
      const json = await res.json();

      if (json.success && json.data?.accounts) {
        setDiscoveryId(dId);
        setDiscoveredAccounts(json.data.accounts);
        // Default: select all discovered accounts
        setSelectedIds(json.data.accounts.map((acc: DiscoveredAccount) => acc.externalAccountId));
      } else {
        setActionMessage({
          type: 'error',
          text: json.error || 'No se pudieron cargar las cuentas descubiertas.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error al obtener cuentas descubiertas.',
      });
    }
  };

  // Trigger Meta OAuth popup
  const handleConnectMeta = async () => {
    setIsConnecting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/social/meta/connect', { method: 'GET' });
      const json = await res.json();

      if (json.success && json.data?.url) {
        const popup = window.open(
          json.data.url,
          'MetaOAuth',
          'width=620,height=760,toolbar=no,menubar=no'
        );

        const checkPopup = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(checkPopup);
            setIsConnecting(false);
          }
        }, 1000);
      } else {
        setActionMessage({
          type: 'error',
          text: json.error || 'No se pudo generar la URL de conexión con Meta.',
        });
        setIsConnecting(false);
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error al iniciar conexión Meta',
      });
      setIsConnecting(false);
    }
  };

  const handleToggleSelect = (externalId: string) => {
    setSelectedIds((prev) =>
      prev.includes(externalId)
        ? prev.filter((id) => id !== externalId)
        : [...prev, externalId]
    );
  };

  const handleConfirmConnectSelected = async () => {
    if (!discoveryId || selectedIds.length === 0) return;

    setIsSavingSelection(true);
    try {
      const res = await fetch('/api/social/meta/accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discoveryId,
          selectedAccountIds: selectedIds,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setActionMessage({
          type: 'success',
          text: `¡Se conectaron ${json.data.length} canal(es) de Meta exitosamente!`,
        });
        setDiscoveryId(null);
        setDiscoveredAccounts([]);
        setSelectedIds([]);
        onRefresh();
      } else {
        setActionMessage({
          type: 'error',
          text: json.error || 'Error al guardar cuentas seleccionadas.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error de red al conectar cuentas.',
      });
    } finally {
      setIsSavingSelection(false);
    }
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.externalAccountId || !manualForm.name) {
      setActionMessage({ type: 'error', text: 'El ID de la cuenta y el nombre son obligatorios.' });
      return;
    }

    setIsSavingManual(true);
    try {
      const res = await fetch('/api/social/accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: manualForm.platform,
          externalAccountId: manualForm.externalAccountId.trim(),
          name: manualForm.name.trim(),
          username: manualForm.username.trim() || undefined,
          accessToken: manualForm.accessToken.trim() || 'PAGE_ACCESS_TOKEN_PLACEHOLDER',
          metadata: {
            configuredManually: true,
            pageId: manualForm.externalAccountId.trim(),
          },
        }),
      });

      const json = await res.json();
      if (json.success) {
        setActionMessage({
          type: 'success',
          text: `¡Canal (${manualForm.name}) vinculado exitosamente con ID ${manualForm.externalAccountId}!`,
        });
        setShowManualModal(false);
        onRefresh();
      } else {
        setActionMessage({
          type: 'error',
          text: json.error || 'No se pudo conectar el canal manualmente.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error de red al registrar canal.',
      });
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleDisconnect = async (id: number) => {
    if (!window.confirm('¿Seguro que deseas desconectar este canal social?')) return;

    try {
      const res = await fetch(`/api/social/meta/accounts/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setActionMessage({
          type: 'info',
          text: 'Canal desconectado correctamente.',
        });
        onRefresh();
      }
    } catch (err: any) {
      console.error('Disconnect error:', err);
    }
  };

  const getPlatformIcon = (platform: SocialPlatform | string) => {
    switch (platform) {
      case 'INSTAGRAM':
        return <Instagram className="w-5 h-5 text-pink-600" />;
      case 'FACEBOOK':
        return <Facebook className="w-5 h-5 text-blue-600" />;
      case 'THREADS':
        return <AtSign className="w-5 h-5 text-slate-900" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-indigo-600" />;
    }
  };

  const activeConnectedCount = accounts.filter((a) => a.status === 'CONNECTED').length;

  return (
    <div className="flex-1 h-full bg-white rounded-3xl border border-slate-200/80 shadow-sm flex flex-col overflow-hidden text-slate-800 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Canales Sociales & Meta Graph API</h2>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border">
              {activeConnectedCount > 0 ? (
                <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Conectado ({activeConnectedCount} canales)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border-amber-200">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  No conectado
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Administra los canales oficiales para publicación automatizada y atribución de ventas en el CRM
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refrescar estado"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowManualModal(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer border border-slate-200"
          >
            Vincular por ID / Token
          </button>

          <button
            onClick={handleConnectMeta}
            disabled={isConnecting}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Abriendo Meta OAuth...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Conectar con OAuth</span>
              </>
            )}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center justify-between border ${
            actionMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-slate-200/80 flex items-center justify-center shadow-2xs overflow-hidden">
                    {acc.profilePictureUrl ? (
                      <img src={acc.profilePictureUrl} alt={acc.name} className="w-full h-full object-cover" />
                    ) : (
                      getPlatformIcon(acc.platform)
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 leading-tight">{acc.name}</h3>
                    <p className="text-[11px] text-slate-500 font-mono">@{acc.username || acc.externalAccountId}</p>
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    acc.status === 'CONNECTED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : acc.status === 'EXPIRED'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {acc.status === 'CONNECTED'
                    ? 'Conectada'
                    : acc.status === 'EXPIRED'
                    ? 'Token Vencido'
                    : 'Desconectada'}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-100 text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Plataforma:</span>
                  <span className="font-semibold">{acc.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Seguridad:</span>
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Cifrado AES-256
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                Conectado {new Date(acc.connectedAt || acc.createdAt).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-1">
                {acc.status === 'EXPIRED' && (
                  <button
                    onClick={handleConnectMeta}
                    className="px-2 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                    title="Renovar token de acceso"
                  >
                    Reconectar
                  </button>
                )}

                <button
                  onClick={() => handleDisconnect(acc.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Desconectar cuenta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="col-span-full p-12 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">No hay cuentas sociales conectadas</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Haz clic en "Conectar Meta" para sincronizar tus páginas de Facebook e Instagram profesional.
              </p>
            </div>
            <button
              onClick={handleConnectMeta}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl shadow-sm hover:bg-indigo-700 transition-all cursor-pointer"
            >
              Conectar Meta
            </button>
          </div>
        )}
      </div>

      {/* Account Selection Modal */}
      {discoveryId && discoveredAccounts.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Cuentas Meta Disponibles</h3>
                <p className="text-xs text-slate-500">
                  Selecciona las páginas y perfiles que deseas habilitar en este workspace:
                </p>
              </div>
              <button
                onClick={() => setDiscoveryId(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Account List */}
            <div className="p-6 max-h-80 overflow-y-auto space-y-3">
              {discoveredAccounts.map((acc) => {
                const isSelected = selectedIds.includes(acc.externalAccountId);
                return (
                  <div
                    key={acc.externalAccountId}
                    onClick={() => handleToggleSelect(acc.externalAccountId)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/50 shadow-2xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center overflow-hidden shrink-0">
                        {acc.profilePictureUrl ? (
                          <img src={acc.profilePictureUrl} alt={acc.name} className="w-full h-full object-cover" />
                        ) : (
                          getPlatformIcon(acc.platform)
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold text-slate-900">{acc.name}</h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {acc.platform}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          @{acc.username || acc.externalAccountId}
                          {acc.category ? ` • ${acc.category}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-indigo-600">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {selectedIds.length} de {discoveredAccounts.length} seleccionadas
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDiscoveryId(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleConfirmConnectSelected}
                  disabled={selectedIds.length === 0 || isSavingSelection}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingSelection ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <span>Conectar Seleccionadas</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Manual Connection Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Vincular Canal por ID / Token</h3>
                <p className="text-xs text-slate-500">
                  Configura o actualiza manualmente el ID de tu Página de Facebook o Instagram
                </p>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plataforma</label>
                <select
                  value={manualForm.platform}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, platform: e.target.value as 'FACEBOOK' | 'INSTAGRAM' })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="FACEBOOK">Facebook Page</option>
                  <option value="INSTAGRAM">Instagram Professional</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ID de la Página / Cuenta Meta <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.externalAccountId}
                  onChange={(e) => setManualForm({ ...manualForm, externalAccountId: e.target.value })}
                  placeholder="Ej. 61593832447994"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Identificador único numérico asignado por Meta a la página o cuenta profesional.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre visible en el CRM <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.name}
                  onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                  placeholder="Ej. Mi Página Comercial"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Page Access Token (opcional para pruebas en modo mock)
                </label>
                <input
                  type="password"
                  value={manualForm.accessToken}
                  onChange={(e) => setManualForm({ ...manualForm, accessToken: e.target.value })}
                  placeholder="EAAB..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  El token se almacena de forma segura con cifrado AES-256-GCM.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingManual ? 'Guardando...' : 'Guardar y Vincular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
