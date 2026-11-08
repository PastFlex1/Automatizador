import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Instagram,
  Facebook,
  AtSign,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { SocialPlatform } from '../../social/types';

interface SocialCalendarViewProps {
  posts: any[];
  onOpenNewPost: () => void;
  onSelectPost: (post: any) => void;
}

export const SocialCalendarView: React.FC<SocialCalendarViewProps> = ({
  posts,
  onOpenNewPost,
  onSelectPost,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedFilterPlatform, setSelectedFilterPlatform] = useState<SocialPlatform | 'ALL'>('ALL');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Filter posts matching this month and filters
  const filteredPosts = posts.filter((p) => {
    if (selectedFilterPlatform !== 'ALL') {
      const hasTarget = p.targets?.some((t: any) => t.platform === selectedFilterPlatform);
      if (!hasTarget) return false;
    }
    return true;
  });

  const getPostsForDay = (day: number) => {
    return filteredPosts.filter((p) => {
      const postDate = new Date(p.scheduledAt || p.publishedAt || p.createdAt);
      return (
        postDate.getFullYear() === year &&
        postDate.getMonth() === month &&
        postDate.getDate() === day
      );
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" title="Publicado" />;
      case 'SCHEDULED':
        return <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block animate-pulse" title="Programado" />;
      case 'DRAFT':
        return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="Borrador" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" title="Error" />;
    }
  };

  return (
    <div className="flex-1 h-full bg-white rounded-3xl border border-slate-200/80 shadow-sm flex flex-col overflow-hidden text-slate-800">
      {/* Calendar Header Controls */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            {monthNames[month]} {year}
          </h2>
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setSelectedFilterPlatform('ALL')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                selectedFilterPlatform === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedFilterPlatform('INSTAGRAM')}
              className={`px-3 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                selectedFilterPlatform === 'INSTAGRAM' ? 'bg-pink-50 text-pink-600 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Instagram className="w-3.5 h-3.5" />
              <span>Instagram</span>
            </button>
            <button
              onClick={() => setSelectedFilterPlatform('FACEBOOK')}
              className={`px-3 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                selectedFilterPlatform === 'FACEBOOK' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Facebook className="w-3.5 h-3.5" />
              <span>Facebook</span>
            </button>
            <button
              onClick={() => setSelectedFilterPlatform('THREADS')}
              className={`px-3 py-1 text-xs rounded-lg font-medium flex items-center gap-1.5 transition-all ${
                selectedFilterPlatform === 'THREADS' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AtSign className="w-3.5 h-3.5" />
              <span>Threads</span>
            </button>
          </div>

          <button
            onClick={onOpenNewPost}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Post</span>
          </button>
        </div>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80 text-center text-xs font-semibold text-slate-500 py-2">
        <span>Dom</span>
        <span>Lun</span>
        <span>Mar</span>
        <span>Mié</span>
        <span>Jue</span>
        <span>Vie</span>
        <span>Sáb</span>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-y-auto divide-x divide-y divide-slate-100">
        {/* Leading empty spaces */}
        {Array.from({ length: firstDayIndex }).map((_, idx) => (
          <div key={`empty-${idx}`} className="bg-slate-50/30 p-2 min-h-[90px]" />
        ))}

        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const day = idx + 1;
          const dayPosts = getPostsForDay(day);
          const isToday =
            new Date().getDate() === day &&
            new Date().getMonth() === month &&
            new Date().getFullYear() === year;

          return (
            <div
              key={`day-${day}`}
              className={`p-2 min-h-[90px] hover:bg-indigo-50/30 transition-colors flex flex-col justify-between group ${
                isToday ? 'bg-indigo-50/40' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center ${
                    isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
                  }`}
                >
                  {day}
                </span>

                {dayPosts.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {dayPosts.length} post{dayPosts.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Day's Posts List */}
              <div className="space-y-1.5 mt-1 overflow-y-auto max-h-[85px]">
                {dayPosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => onSelectPost(post)}
                    className="p-1.5 bg-slate-50 hover:bg-indigo-100/60 border border-slate-200/80 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    {getStatusBadge(post.status)}
                    <span className="text-[11px] font-medium text-slate-800 truncate flex-1">
                      {post.title || post.caption}
                    </span>
                    <div className="flex items-center gap-0.5 text-slate-400 flex-shrink-0">
                      {post.targets?.some((t: any) => t.platform === 'INSTAGRAM') && (
                        <Instagram className="w-2.5 h-2.5 text-pink-500" />
                      )}
                      {post.targets?.some((t: any) => t.platform === 'FACEBOOK') && (
                        <Facebook className="w-2.5 h-2.5 text-blue-500" />
                      )}
                      {post.targets?.some((t: any) => t.platform === 'THREADS') && (
                        <AtSign className="w-2.5 h-2.5 text-slate-800" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
