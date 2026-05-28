import React, { useEffect, useState, useCallback } from 'react';
import api from '../../lib/api';
import LeadDrawer from './LeadDrawer';

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // início na segunda
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function Calendar() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [meetings, setMeetings] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(true);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, f] = await Promise.all([
        api.get('/crm/meetings'),
        api.get('/crm/followups'),
      ]);
      setMeetings(m);
      setFollowups(f.filter(f => f.status === 'pending'));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const goToday  = () => setWeekStart(startOfWeek(new Date()));

  const meetingsForDay = (day) =>
    meetings.filter(m => isSameDay(new Date(m.meeting_at), day))
            .sort((a, b) => new Date(a.meeting_at) - new Date(b.meeting_at));

  const followupsForDay = (day) =>
    followups.filter(f => isSameDay(new Date(f.scheduled_at), day))
             .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const today = new Date();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white mr-auto">📅 Calendário</h1>
        <button onClick={prevWeek} className="btn btn-ghost text-sm border border-gray-600">← Ant.</button>
        <button onClick={goToday} className="btn btn-ghost text-sm border border-gray-600">Hoje</button>
        <button onClick={nextWeek} className="btn btn-ghost text-sm border border-gray-600">Próx. →</button>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500 mr-1" />Reuniões</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-orange-500 mr-1" />Follow-ups pendentes</span>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Carregando calendário...</div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            const dayMeetings = meetingsForDay(day);
            const dayFollowups = followupsForDay(day);
            const total = dayMeetings.length + dayFollowups.length;

            return (
              <div
                key={i}
                className={`min-h-[160px] rounded-xl border p-2 flex flex-col gap-1.5 ${
                  isToday ? 'border-orange-500 bg-orange-500/5' : 'border-gray-700 bg-gray-800/30'
                }`}
              >
                {/* Day header */}
                <div className={`text-center mb-1 ${isToday ? 'text-orange-400' : 'text-gray-400'}`}>
                  <p className="text-[10px] uppercase font-semibold">{DAY_NAMES[i]}</p>
                  <p className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-gray-300'}`}>
                    {day.getDate()}
                  </p>
                  <p className="text-[9px] text-gray-600">{fmtDate(day)}</p>
                </div>

                {total === 0 && (
                  <p className="text-[10px] text-gray-600 text-center mt-auto mb-auto">—</p>
                )}

                {/* Reuniões */}
                {dayMeetings.map(m => (
                  <button
                    key={`m-${m.id}`}
                    onClick={() => setSelectedLead(m.lead_id)}
                    className="w-full text-left rounded-lg bg-indigo-600/20 border border-indigo-500/30 p-1.5 hover:bg-indigo-600/30 transition-colors"
                  >
                    <p className="text-[9px] text-indigo-300 font-semibold">📅 {fmtTime(m.meeting_at)}</p>
                    <p className="text-[10px] text-white truncate">{m.lead_name || m.lead_phone || `Lead #${m.lead_id}`}</p>
                    {m.title && <p className="text-[9px] text-indigo-200/70 truncate">{m.title}</p>}
                  </button>
                ))}

                {/* Follow-ups */}
                {dayFollowups.map(f => (
                  <button
                    key={`f-${f.id}`}
                    onClick={() => setSelectedLead(f.lead_id)}
                    className="w-full text-left rounded-lg bg-orange-600/20 border border-orange-500/30 p-1.5 hover:bg-orange-600/30 transition-colors"
                  >
                    <p className="text-[9px] text-orange-300 font-semibold">📨 {fmtTime(f.scheduled_at)}</p>
                    <p className="text-[10px] text-white truncate">{f.lead_name || `Lead #${f.lead_id}`}</p>
                    {f.automation_type && (
                      <p className="text-[9px] text-orange-200/60 truncate">{f.automation_type}</p>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Totais da semana */}
      {!loading && (
        <div className="flex gap-4 text-xs text-gray-500">
          <span>📅 {meetings.filter(m => days.some(d => isSameDay(new Date(m.meeting_at), d))).length} reunião(ões) esta semana</span>
          <span>📨 {followups.filter(f => days.some(d => isSameDay(new Date(f.scheduled_at), d))).length} follow-up(s) pendente(s) esta semana</span>
        </div>
      )}

      {selectedLead && (
        <LeadDrawer leadId={selectedLead} onClose={() => setSelectedLead(null)} onUpdate={load} />
      )}
    </div>
  );
}
