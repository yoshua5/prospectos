'use client';
import { useState, useRef, useEffect } from 'react';

type Lead = {
  name: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  social: string;
  service: string;
  keywords: string;
  platform?: string;
  platform_meta?: string;
  error?: string;
};

const PLATFORM_CONFIG: Record<string, { emoji: string; color: string; bg: string }> = {
  Reddit:            { emoji: '🟠', color: '#e05d20', bg: '#fff4ee' },
  'Twitter/X':       { emoji: '𝕏',  color: '#000000', bg: '#f0f0f0' },
  Facebook:          { emoji: '🔵', color: '#1877f2', bg: '#eef3ff' },
  'Facebook Grupos': { emoji: '🔵', color: '#1877f2', bg: '#dbeafe' },
  Quora:             { emoji: '🔴', color: '#b92b27', bg: '#fff0f0' },
  Foros:             { emoji: '💬', color: '#059669', bg: '#ecfdf5' },
  'Web general':     { emoji: '🌐', color: '#6b7280', bg: '#f3f4f6' },
};

export default function BusquedaPage() {
  const [tab, setTab] = useState<'empresa' | 'intencion'>('empresa');
  // --- Empresa state ---
  const [form, setForm] = useState({ service: '', keywords: '', location: '', country: '', limit: '20' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // --- Intención state ---
  const [iForm, setIForm] = useState({ keywords: '', location: '', limit: '20' });
  const [iPlats, setIPlats] = useState<string[]>(['reddit', 'twitter', 'quora', 'foros', 'web']);
  const [iLeads, setILeads] = useState<Lead[]>([]);
  const [iLoading, setILoading] = useState(false);
  const [iProgress, setIProgress] = useState(0);
  const [iStatus, setIStatus] = useState('');
  const [iSaved, setISaved] = useState(false);
  const iAbortRef = useRef<AbortController | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ---- Empresa handlers ----
  const handleSearch = async () => {
    if (!form.keywords || !form.location) {
      showToast('Ingresa palabras clave y ubicación', 'error');
      return;
    }
    setLeads([]); setLoading(true); setProgress(5); setSaved(false);
    setStatusMsg('Iniciando búsqueda...');
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: form.service,
          keywords: `${form.keywords} ${form.country}`.trim(),
          location: form.location,
          limit: parseInt(form.limit),
        }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let count = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw);
              if (data.done) {
                setProgress(100);
                setStatusMsg(`Búsqueda completada. ${count} leads encontrados.`);
              } else if (data.error) {
                setStatusMsg(`Error: ${data.error}`);
              } else {
                count++;
                setLeads(prev => [...prev, data]);
                setProgress(Math.min(90, 5 + count * 4));
                setStatusMsg(`Encontrando leads... ${count} encontrados`);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        showToast('Error en la búsqueda. Revisa la consola.', 'error');
        setStatusMsg('Error en la búsqueda');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => { abortRef.current?.abort(); setLoading(false); setStatusMsg('Búsqueda detenida.'); };

  const handleSaveAll = async () => {
    if (!leads.length) return;
    let n = 0;
    for (const lead of leads) {
      if (lead.error) continue;
      await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
      n++;
    }
    setSaved(true);
    showToast(`${n} leads guardados en Mis Leads ✓`);
  };

  // ---- Intención handlers ----
  const togglePlat = (p: string) => setIPlats(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const handleIntentSearch = async () => {
    if (!iForm.keywords) {
      showToast('Ingresa palabras clave', 'error');
      return;
    }
    if (!iPlats.length) {
      showToast('Selecciona al menos una plataforma', 'error');
      return;
    }

    setILeads([]); setILoading(true); setIProgress(5); setISaved(false);
    setIStatus('Buscando personas con intención de compra...');
    iAbortRef.current = new AbortController();

    let count = 0;

    // Helper to read SSE stream
    const readStream = async (res: Response) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw);
              if (data.done) {
                setIProgress(prev => Math.min(prev + 30, 95));
              } else if (data.error) {
                setIStatus(prev => `${prev} | Error: ${data.error}`);
              } else if (data.status) {
                // status/progress message — show in status bar, don't add as lead
                setIStatus(`Buscando... ${data.msg || data.status}`);
              } else {
                count++;
                setILeads(prev => [...prev, data]);
                setIProgress(Math.min(90, 5 + count * 5));
                setIStatus(`Buscando... ${count} publicaciones encontradas`);
              }
            } catch { /* skip */ }
          }
        }
      }
    };

    try {
      const res = await fetch('/api/intent-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: iForm.keywords,
          location: iForm.location,
          platforms: iPlats,
          limit: parseInt(iForm.limit),
        }),
        signal: iAbortRef.current.signal,
      });
      await readStream(res);

      setIProgress(100);
      setIStatus(`Búsqueda completada. ${count} publicaciones encontradas.`);
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        showToast('Error en la búsqueda.', 'error');
        setIStatus('Error en la búsqueda');
      }
    } finally {
      setILoading(false);
    }
  };


  const handleIntentStop = () => { iAbortRef.current?.abort(); setILoading(false); setIStatus('Búsqueda detenida.'); };

  const handleIntentSaveAll = async () => {
    if (!iLeads.length) return;
    let n = 0;
    for (const lead of iLeads) {
      if (lead.error) continue;
      await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
      n++;
    }
    setISaved(true);
    showToast(`${n} publicaciones guardadas en Mis Leads ✓`);
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>🔍 Búsqueda de Leads</h2>
        <p>Encuentra prospectos automáticamente usando web scraping</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        <button
          onClick={() => setTab('empresa')}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: tab === 'empresa' ? '2px solid #f97316' : '2px solid transparent',
            color: tab === 'empresa' ? '#f97316' : '#64748b',
            marginBottom: -2,
          }}
        >
          🏢 Por Empresa
        </button>
        <button
          onClick={() => setTab('intencion')}
          style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: tab === 'intencion' ? '2px solid #f97316' : '2px solid transparent',
            color: tab === 'intencion' ? '#f97316' : '#64748b',
            marginBottom: -2,
          }}
        >
          🎯 Por Intención
        </button>
      </div>

      {/* ========== EMPRESA TAB ========== */}
      {tab === 'empresa' && (
        <>
          <div className="card">
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Servicio que ofreces</label>
                <input className="input" placeholder="ej: diseño web, marketing digital..." value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} />
              </div>
              <div>
                <label className="label">Palabras clave *</label>
                <input className="input" placeholder="ej: restaurantes, dentistas, gym..." value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} />
              </div>
              <div>
                <label className="label">Ciudad / Ubicación *</label>
                <input className="input" placeholder="ej: Ciudad de México, Monterrey..." value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label className="label">País / Estado (opcional)</label>
                <input className="input" placeholder="ej: México, Colombia..." value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Máximo de leads</label>
                <select className="input" style={{ width: 120 }} value={form.limit} onChange={e => setForm({ ...form, limit: e.target.value })}>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
                {loading ? '⏳ Buscando...' : '🔍 Buscar Leads'}
              </button>
              {loading && <button className="btn btn-secondary" onClick={handleStop}>⏹ Detener</button>}
              {leads.length > 0 && !saved && (
                <button className="btn btn-secondary" onClick={handleSaveAll}>💾 Guardar todos ({leads.length})</button>
              )}
              {saved && <span style={{ color: '#166534', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center' }}>✅ Guardados en Mis Leads</span>}
            </div>

            {(loading || statusMsg) && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{statusMsg}</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{progress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>

          {leads.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>Resultados ({leads.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                {leads.map((lead, i) => (
                  <div key={i} className="lead-card">
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#0f172a' }}>{lead.name || 'Sin nombre'}</div>
                    {lead.website && (
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        🌐 <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ color: '#f97316', textDecoration: 'none' }}>
                          {lead.website.replace(/^https?:\/\//, '').slice(0, 40)}
                        </a>
                      </div>
                    )}
                    {lead.email && <div style={{ fontSize: 13, marginBottom: 4 }}>✉️ {lead.email}</div>}
                    {lead.phone && <div style={{ fontSize: 13, marginBottom: 4 }}>📞 {lead.phone}</div>}
                    {lead.city && <div style={{ fontSize: 13, color: '#64748b' }}>📍 {lead.city}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && leads.length === 0 && statusMsg && statusMsg.includes('completada') && (
            <div className="card">
              <div className="empty-state">
                <div className="icon">😕</div>
                <h3>No se encontraron leads</h3>
                <p>Intenta con otras palabras clave o ubicación</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== INTENCIÓN TAB ========== */}
      {tab === 'intencion' && (
        <>
          <div className="card">
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', fontSize: 13, color: '#0369a1' }}>
              💡 Busca personas que están pidiendo tu servicio en redes sociales y foros. Ej: alguien que escribe <em>&quot;busco diseñador web en CDMX&quot;</em> en Reddit o Twitter.
            </div>

            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Servicio que buscas *</label>
                <input className="input" placeholder="ej: diseño web, fotografía, plomero..." value={iForm.keywords} onChange={e => setIForm({ ...iForm, keywords: e.target.value })} />
              </div>
              <div>
                <label className="label">Ciudad / Ubicación (opcional)</label>
                <input className="input" placeholder="ej: CDMX, Monterrey, Madrid..." value={iForm.location} onChange={e => setIForm({ ...iForm, location: e.target.value })} />
              </div>
            </div>

            {/* Platform checkboxes */}
            <div style={{ marginBottom: 16 }}>
              <label className="label">Plataformas a buscar</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {[
                  { id: 'reddit',   label: '🟠 Reddit' },
                  { id: 'twitter',  label: '𝕏 Twitter/X' },
                  { id: 'facebook', label: '🔵 Facebook' },
                  { id: 'quora',    label: '🔴 Quora' },
                  { id: 'foros',    label: '💬 Foros' },
                  { id: 'web',      label: '🌐 Web general' },
                ].map(p => (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: `2px solid ${iPlats.includes(p.id) ? '#f97316' : '#e2e8f0'}`,
                    background: iPlats.includes(p.id) ? '#fff7ed' : '#fff',
                    color: iPlats.includes(p.id) ? '#f97316' : '#64748b',
                    userSelect: 'none',
                  }}>
                    <input type="checkbox" checked={iPlats.includes(p.id)} onChange={() => togglePlat(p.id)} style={{ display: 'none' }} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="label">Máximo de resultados</label>
                <select className="input" style={{ width: 120 }} value={iForm.limit} onChange={e => setIForm({ ...iForm, limit: e.target.value })}>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="40">40</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleIntentSearch} disabled={iLoading}>
                {iLoading ? '⏳ Buscando...' : '🎯 Buscar por Intención'}
              </button>
              {iLoading && <button className="btn btn-secondary" onClick={handleIntentStop}>⏹ Detener</button>}
              {iLeads.length > 0 && !iSaved && (
                <button className="btn btn-secondary" onClick={handleIntentSaveAll}>💾 Guardar todos ({iLeads.length})</button>
              )}
              {iSaved && <span style={{ color: '#166534', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center' }}>✅ Guardados en Mis Leads</span>}
            </div>

            {(iLoading || iStatus) && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{iStatus}</span>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{iProgress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${iProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          {iLeads.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>
                Publicaciones encontradas ({iLeads.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {iLeads.map((lead, i) => {
                  const cfg = PLATFORM_CONFIG[lead.platform || lead.service] || PLATFORM_CONFIG['Reddit'];
                  return (
                    <div key={i} className="lead-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Platform badge */}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`,
                          flexShrink: 0,
                        }}>
                          {cfg.emoji} {lead.platform || lead.service}
                        </span>
                        {lead.platform_meta && (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{lead.platform_meta}</span>
                        )}
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>📍 {lead.city || 'Global'}</span>
                      </div>

                      {/* Username */}
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                        👤 {lead.name}
                      </div>

                      {/* Post excerpt */}
                      {lead.address && (
                        <div style={{
                          fontSize: 13, color: '#374151', lineHeight: 1.5,
                          background: '#f8fafc', padding: '8px 12px', borderRadius: 6,
                          borderLeft: `3px solid ${cfg.color}`,
                        }}>
                          {lead.address}
                        </div>
                      )}

                      {/* Buttons */}
                      {lead.website && (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {/* DM button — platform-specific */}
                          {lead.platform === 'Reddit' && lead.name?.startsWith('u/') && (
                            <a
                              href={`https://www.reddit.com/message/compose/?to=${lead.name.replace('u/', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                background: '#fff', color: cfg.color, textDecoration: 'none',
                                border: `2px solid ${cfg.color}`,
                              }}
                            >
                              💬 Enviar DM
                            </a>
                          )}
                          {(lead.platform === 'Twitter/X') && lead.social && (
                            <a
                              href={lead.social}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                                background: '#fff', color: cfg.color, textDecoration: 'none',
                                border: `2px solid ${cfg.color}`,
                              }}
                            >
                              💬 Ver perfil
                            </a>
                          )}
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                              background: cfg.color, color: '#fff', textDecoration: 'none',
                            }}
                          >
                            Ver publicación →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!iLoading && iLeads.length === 0 && iStatus && iStatus.includes('completada') && (
            <div className="card">
              <div className="empty-state">
                <div className="icon">🔎</div>
                <h3>No se encontraron publicaciones</h3>
                <p>Intenta con otras palabras clave o agrega más plataformas</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
