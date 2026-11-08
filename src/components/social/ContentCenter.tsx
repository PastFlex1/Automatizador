import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ListFilter,
  BarChart3,
  Share2,
  Plus,
  Sparkles,
  Send,
  Trash2,
  ExternalLink,
  Instagram,
  Facebook,
  AtSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  RefreshCw,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { SocialCalendarView } from './SocialCalendarView';
import { ConnectedAccountsView } from './ConnectedAccountsView';
import { SocialPerformanceView } from './SocialPerformanceView';
import { SocialInteractionsView } from './SocialInteractionsView';
import { NewPostModal } from './NewPostModal';
import { Product, BusinessProfile } from '../../types';

interface ContentCenterProps {
  products: Product[];
  businessProfile: BusinessProfile;
}

export const ContentCenter: React.FC<ContentCenterProps> = ({
  products,
  businessProfile,
}) => {
  const [subTab, setSubTab] = useState<'calendar' | 'posts' | 'interactions' | 'performance' | 'accounts'>('calendar');
  const [postFilter, setPostFilter] = useState<'ALL' | 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED'>('ALL');

  const [posts, setPosts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [publisherModeInfo, setPublisherModeInfo] = useState<{
    mode: string;
    isRealMode: boolean;
    connectedAccountsCount: number;
  } | null>(null);

  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<number | null>(null);
  const [confirmPublishPost, setConfirmPublishPost] = useState<any | null>(null);

  const [autoPilotStatus, setAutoPilotStatus] = useState<any | null>(null);
  const [isPublishingAutoPilot, setIsPublishingAutoPilot] = useState(false);
  const [isSchedulingWeek, setIsSchedulingWeek] = useState(false);

  // Load initial social data
  const loadSocialData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Posts
      const postsRes = await fetch('/api/social/posts');
      const postsJson = await postsRes.json();
      if (postsJson.success) {
        setPosts(postsJson.data || []);
      }

      // 2. Fetch Connected Accounts
      const accountsRes = await fetch('/api/social/accounts');
      const accountsJson = await accountsRes.json();
      if (accountsJson.success) {
        setAccounts(accountsJson.data || []);
      }

      // 3. Fetch Analytics
      const analyticsRes = await fetch('/api/social/analytics');
      const analyticsJson = await analyticsRes.json();
      if (analyticsJson.success) {
        setAnalytics(analyticsJson.data);
      }

      // 4. Fetch Publisher Mode
      const modeRes = await fetch('/api/social/publisher/mode');
      const modeJson = await modeRes.json();
      if (modeJson.success) {
        setPublisherModeInfo(modeJson.data);
      }

      // 5. Fetch AutoPilot Status
      const autoRes = await fetch('/api/social/autopilot/status');
      const autoJson = await autoRes.json();
      if (autoJson.success) {
        setAutoPilotStatus(autoJson.data);
      }
    } catch (err) {
      console.error('Failed to load social publisher state:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSocialData();
  }, []);

  // Publish a draft or failed post immediately
  const handleExecutePublishNow = async (postId: number) => {
    setConfirmPublishPost(null);
    setPublishingPostId(postId);
    try {
      const res = await fetch(`/api/social/posts/${postId}/publish`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) {
        alert(`Error al publicar: ${json.error || 'Fallo de publicación'}`);
      }
      await loadSocialData();
    } catch (err: any) {
      alert(`Error de red al publicar: ${err.message}`);
    } finally {
      setPublishingPostId(null);
    }
  };

  // Delete post
  const handleDeletePost = async (postId: number) => {
    try {
      await fetch(`/api/social/posts/${postId}`, { method: 'DELETE' });
      loadSocialData();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Execute immediate publish of an AI-generated post to Facebook Page
  const handlePublishAutoPilotNow = async () => {
    setIsPublishingAutoPilot(true);
    try {
      const res = await fetch('/api/social/autopilot/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        alert('🎉 ¡Publicación comercial generada por IA y publicada exitosamente en Facebook APM Inox!');
      } else {
        alert(`Error al publicar: ${json.error || 'Error desconocido'}`);
      }
      await loadSocialData();
    } catch (err: any) {
      alert(`Error de conexión: ${err.message}`);
    } finally {
      setIsPublishingAutoPilot(false);
    }
  };

  // Generate 7-day schedule with AI
  const handleScheduleWeek = async () => {
    setIsSchedulingWeek(true);
    try {
      const res = await fetch('/api/social/autopilot/schedule-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        alert(`📅 ¡Parrilla semanal generada! ${json.data.createdCount} publicaciones comerciales programadas para los próximos 7 días.`);
      } else {
        alert(`Error: ${json.error || 'Fallo al programar'}`);
      }
      await loadSocialData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsSchedulingWeek(false);
    }
  };

  // Toggle AutoPilot status
  const handleToggleAutoPilot = async () => {
    if (!autoPilotStatus) return;
    const newEnabled = !autoPilotStatus.settings?.enabled;
    try {
      await fetch('/api/social/autopilot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      await loadSocialData();
    } catch (err) {
      console.error('Error toggling autopilot:', err);
    }
  };

  const filteredPosts = posts.filter((p) => {
    if (postFilter === 'ALL') return true;
    return p.status === postFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Publicado
          </span>
        );
      case 'PARTIALLY_PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> Parcial
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Procesando
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Clock className="w-3 h-3" /> Programado
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <FileText className="w-3 h-3" /> Borrador
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> Fallido
          </span>
        );
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col gap-2.5 sm:gap-3.5 overflow-hidden">
      {/* Top Header Bar */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-2.5 sm:p-3.5 sm:px-6 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 overflow-x-auto max-w-full custom-scrollbar">
          <button
            onClick={() => setSubTab('calendar')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'calendar'
                ? 'bg-white text-indigo-600 shadow-xs shadow-indigo-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Calendario</span>
          </button>

          <button
            onClick={() => setSubTab('posts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'posts'
                ? 'bg-white text-indigo-600 shadow-xs shadow-indigo-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            <span>Publicaciones ({posts.length})</span>
          </button>

          <button
            onClick={() => setSubTab('interactions')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'interactions'
                ? 'bg-white text-indigo-600 shadow-xs shadow-indigo-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Interacciones & Leads</span>
          </button>

          <button
            onClick={() => setSubTab('performance')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'performance'
                ? 'bg-white text-indigo-600 shadow-xs shadow-indigo-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Rendimiento</span>
          </button>

          <button
            onClick={() => setSubTab('accounts')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              subTab === 'accounts'
                ? 'bg-white text-indigo-600 shadow-xs shadow-indigo-100'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Canales ({accounts.length})</span>
          </button>
        </div>

        {/* Action Buttons & Status Badge */}
        <div className="flex items-center gap-2.5">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
            <button
              onClick={async () => {
                await fetch('/api/social/publisher/mode', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: 'meta' }),
                });
                loadSocialData();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                publisherModeInfo?.isRealMode
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${publisherModeInfo?.isRealMode ? 'bg-emerald-200 animate-pulse' : 'bg-slate-400'}`}></span>
              <span>Modo Meta (Real)</span>
            </button>

            <button
              onClick={async () => {
                await fetch('/api/social/publisher/mode', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mode: 'mock' }),
                });
                loadSocialData();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                publisherModeInfo?.isMockMode
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${publisherModeInfo?.isMockMode ? 'bg-amber-200' : 'bg-slate-400'}`}></span>
              <span>Modo Mock (Simulación)</span>
            </button>
          </div>

          <button
            onClick={loadSocialData}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refrescar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={() => setIsNewPostOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs shadow-indigo-200 transition-all hover:scale-105 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Crear Publicación</span>
          </button>
        </div>
      </div>

      {/* AutoPilot Commercial Publisher Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-indigo-500/30 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-indigo-600/30 border border-indigo-400/40 rounded-2xl flex-shrink-0 text-indigo-300">
            <Sparkles className="w-6 h-6 text-indigo-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-bold text-base text-white">
                Piloto Automático de Publicaciones de Facebook
              </h3>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                autoPilotStatus?.settings?.enabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${autoPilotStatus?.settings?.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
                {autoPilotStatus?.settings?.enabled ? 'Activo (Publicando automáticamente)' : 'En Pausa'}
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 mt-1 max-w-2xl leading-relaxed">
              La IA genera publicaciones comerciales de alta conversión para tus cocinas industriales, mesas de trabajo y campanas en acero inoxidable, atrayendo prospectos directamente a Messenger y WhatsApp.
            </p>
            {autoPilotStatus?.settings?.lastPublishedAt && (
              <div className="text-[11px] text-indigo-300/70 mt-1.5 flex items-center gap-2 flex-wrap">
                <span>Último post automático: {new Date(autoPilotStatus.settings.lastPublishedAt).toLocaleString()}</span>
                <span>•</span>
                <span>Total publicados: {autoPilotStatus.settings.totalAutoPublished || 0}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
          <button
            onClick={handleToggleAutoPilot}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              autoPilotStatus?.settings?.enabled
                ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md'
            }`}
          >
            {autoPilotStatus?.settings?.enabled ? 'Pausar Piloto' : 'Activar Piloto Automático'}
          </button>

          <button
            onClick={handleScheduleWeek}
            disabled={isSchedulingWeek}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600/70 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl border border-indigo-400/30 transition-all shadow-md disabled:opacity-50 cursor-pointer"
            title="Genera 7 posts comerciales programados para toda la semana"
          >
            {isSchedulingWeek ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5 text-indigo-300" />}
            <span>Autoprogramar Semana</span>
          </button>

          <button
            onClick={handlePublishAutoPilotNow}
            disabled={isPublishingAutoPilot}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-md shadow-blue-600/30 transition-all hover:scale-105 disabled:opacity-50 cursor-pointer"
          >
            {isPublishingAutoPilot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>Publicar Ahora en Facebook</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden">
        {subTab === 'calendar' && (
          <SocialCalendarView
            posts={posts}
            onOpenNewPost={() => setIsNewPostOpen(true)}
            onSelectPost={(p) => {
              setSubTab('posts');
            }}
          />
        )}

        {subTab === 'posts' && (
          <div className="h-full bg-white rounded-3xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden text-slate-800 p-6 space-y-4">
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {(['ALL', 'SCHEDULED', 'PUBLISHED', 'DRAFT', 'FAILED'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setPostFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      postFilter === filter
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {filter === 'ALL'
                      ? 'Todos'
                      : filter === 'SCHEDULED'
                      ? 'Programados'
                      : filter === 'PUBLISHED'
                      ? 'Publicados'
                      : filter === 'DRAFT'
                      ? 'Borradores'
                      : 'Fallidos'}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-400 font-mono">
                Mostrando {filteredPosts.length} publicaciones
              </span>
            </div>

            {/* Posts Table / List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/50 p-2 rounded-2xl transition-colors"
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Media Thumbnail */}
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center">
                      {post.media?.[0]?.url ? (
                        <img
                          src={post.media[0].url}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(post.status)}
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                          {post.contentType}
                        </span>
                        {post.product && (
                          <span className="text-xs text-slate-400 font-medium">
                            • {post.product.name}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-slate-900 line-clamp-1">
                        {post.title || post.caption.substring(0, 40)}
                      </p>

                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {post.caption}
                      </p>

                      <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
                        <span>
                          {post.scheduledAt
                            ? `Programado para ${new Date(post.scheduledAt).toLocaleString()}`
                            : post.publishedAt
                            ? `Publicado el ${new Date(post.publishedAt).toLocaleString()}`
                            : `Creado el ${new Date(post.createdAt).toLocaleDateString()}`}
                        </span>

                        {/* Platform & Account Badges */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {post.targets?.map((t: any) => (
                            <div
                              key={t.id}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
                                t.status === 'PUBLISHED'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                                  : t.status === 'FAILED'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/80'
                                  : t.status === 'PROCESSING'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200/80 animate-pulse'
                                  : 'bg-slate-100 text-slate-700 border-slate-200/80'
                              }`}
                            >
                              {t.platform === 'FACEBOOK' && <Facebook className="w-3.5 h-3.5 text-blue-600" />}
                              {t.platform === 'INSTAGRAM' && <Instagram className="w-3.5 h-3.5 text-pink-600" />}
                              {t.platform === 'THREADS' && <AtSign className="w-3.5 h-3.5 text-slate-900" />}
                              <span>{t.account?.name || (t.platform === 'FACEBOOK' ? 'Facebook' : t.platform)}</span>
                              {t.status === 'PUBLISHED' ? (
                                <span className="text-emerald-600 font-bold ml-0.5">✅ Publicado</span>
                              ) : t.status === 'FAILED' ? (
                                <span className="text-rose-600 font-bold ml-0.5">❌ Error</span>
                              ) : t.status === 'PROCESSING' ? (
                                <span className="text-blue-600 font-bold ml-0.5">⏳ Procesando...</span>
                              ) : (
                                <span className="text-slate-400 font-medium ml-0.5">• Pendiente</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {post.status !== 'PUBLISHED' && (
                      <button
                        onClick={() => setConfirmPublishPost(post)}
                        disabled={publishingPostId === post.id}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {publishingPostId === post.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Publicar Ahora</span>
                      </button>
                    )}

                    {(post.externalPostUrl || post.targets?.some((t: any) => t.externalPostUrl)) && (
                      <a
                        href={post.externalPostUrl || post.targets?.find((t: any) => t.externalPostUrl)?.externalPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 text-xs font-bold transition-colors cursor-pointer shadow-xs"
                        title="Abrir publicación en vivo en Facebook"
                      >
                        <Facebook className="w-3.5 h-3.5 text-blue-600" />
                        <span>Ver en Facebook</span>
                        <ExternalLink className="w-3 h-3 text-blue-500" />
                      </a>
                    )}

                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Eliminar post"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {filteredPosts.length === 0 && (
                <div className="p-12 text-center text-xs text-slate-400">
                  No hay publicaciones que coincidan con este filtro.
                </div>
              )}
            </div>
          </div>
        )}

        {subTab === 'interactions' && (
          <SocialInteractionsView products={products} />
        )}

        {subTab === 'performance' && (
          <SocialPerformanceView analytics={analytics} businessProfile={businessProfile} />
        )}

        {subTab === 'accounts' && (
          <ConnectedAccountsView accounts={accounts} onRefresh={loadSocialData} />
        )}
      </div>

      {/* Direct Publish Confirmation Modal */}
      {confirmPublishPost && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Publicar Inmediatamente</h3>
                <p className="text-xs text-slate-500">
                  {publisherModeInfo?.isRealMode
                    ? 'Se enviará la publicación directamente a Meta Graph API.'
                    : 'Se ejecutará la publicación en modo de simulación.'}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                <span className="font-semibold text-slate-800">{confirmPublishPost.title || 'Publicación Facebook'}</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${publisherModeInfo?.isRealMode ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {publisherModeInfo?.isRealMode ? 'META GRAPH API (REAL)' : 'MOCK (SIMULACIÓN)'}
                </span>
              </div>
              <p className="text-slate-700 font-medium whitespace-pre-wrap">{confirmPublishPost.caption}</p>
              <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Facebook className="w-3.5 h-3.5 text-blue-600" />
                <span>Página destino: <strong>APM inox 1</strong></span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmPublishPost(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExecutePublishNow(confirmPublishPost.id)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer"
              >
                Confirmar y Publicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Post Modal */}
      <NewPostModal
        isOpen={isNewPostOpen}
        onClose={() => setIsNewPostOpen(false)}
        products={products}
        businessProfile={businessProfile}
        connectedAccounts={accounts}
        onPostCreated={loadSocialData}
      />
    </div>
  );
};
