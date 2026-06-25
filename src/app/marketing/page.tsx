'use client';
import { useState, useEffect, useCallback } from 'react';
import { renderEmail } from '@/lib/emailTemplate';

type Lead = { id: number; name: string; email: string; city: string; website: string; status: string };
type Template = {
  id: number; name: string; subject: string; body: string;
  logo_url: string; header_color: string; cta_text: string; cta_url: string;
  sig_name: string; sig_title: string; sig_phone: string; sig_company: string;
  created_at: string;
};
type Campaign = {
  id: number; name: string; template_id: number; leads_json: string;
  status: string; sent_count: number; bounce_count: number; created_at: string; sent_at: string;
};
type SmtpConfig = { host?: string; port?: number; user?: string; pass?: string; from_name?: string; from_email?: string; lp_api_key?: string };

const VARS = ['{{nombre_empresa}}', '{{ciudad}}', '{{sitio_web}}', '{{email}}'];

const EMPTY_TEMPLATE = {
  name: '', subject: '', body: '',
  logo_url: '', header_color: '#f97316',
  cta_text: '', cta_url: '',
  sig_name: '', sig_title: '', sig_phone: '', sig_company: '',
};

export default function MarketingPage() {
  const [tab, setTab] = useState<'campañas' | 'templates' | 'config'>('campañas');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [editTemplate, setEditTemplate] = useState<Partial<Template> | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const [newCampaign, setNewCampaign] = useState({ name: '', templateId: '' });
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<{ sent: number; bounced: number; errors?: string[] } | null>(null);

  const [smtp, setSmtp] = useState<SmtpConfig>({});
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = useCallback(async () => {
    const [leadsRes, templatesRes, campaignsRes, smtpRes] = await Promise.all([
      fetch('/api/leads'), fetch('/api/templates'), fetch('/api/campaigns'), fetch('/api/smtp'),
    ]);
    setLeads(await leadsRes.json());
    setTemplates(await templatesRes.json());
    setCampaigns(await campaignsRes.json());
    setSmtp(await smtpRes.json());
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveTemplate = async () => {
    if (!editTemplate?.name || !editTemplate?.subject || !editTemplate?.body) {
      showToast('Completa nombre, asunto y cuerpo', 'error'); return;
    }
    if ((editTemplate as Template).id) {
      await fetch(`/api/templates/${(editTemplate as Template).id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editTemplate),
      });
    } else {
      await fetch('/api/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editTemplate),
      });
    }
    setEditTemplate(null);
    showToast('Template guardado ✓');
    loadData();
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm('¿Eliminar template?')) return;
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    showToast('Template eliminado');
    loadData();
  };

  const createCampaign = async () => {
    if (!newCampaign.name || !newCampaign.templateId || selectedLeads.size === 0) {
      showToast('Completa nombre, template y selecciona leads', 'error'); return;
    }
    await fetch('/api/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCampaign.name, templateId: parseInt(newCampaign.templateId), leadIds: [...selectedLeads], action: 'create' }),
    });
    setNewCampaign({ name: '', templateId: '' });
    setSelectedLeads(new Set());
    showToast('Campaña creada ✓');
    loadData();
  };

  const sendCampaign = async (id: number) => {
    if (!confirm('¿Enviar campaña ahora?')) return;
    setSending(id); setSendResult(null);
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send' }),
    });
    const data = await res.json();
    setSending(null);
    if (res.ok) {
      setSendResult(data);
      showToast(`Enviados: ${data.sent} ✓${data.bounced ? ` · Rebotes: ${data.bounced}` : ''}`);
      loadData();
    } else {
      showToast(data.error || 'Error al enviar', 'error');
    }
  };

  const deleteCampaign = async (id: number) => {
    if (!confirm('¿Eliminar campaña?')) return;
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    loadData();
  };

  const saveSmtp = async () => {
    setSmtpSaving(true);
    await fetch('/api/smtp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(smtp) });
    setSmtpSaving(false);
    showToast('Configuración SMTP guardada ✓');
  };

  const testSmtp = async () => {
    setSmtpTesting(true);
    const res = await fetch('/api/smtp/test', { method: 'POST' });
    const data = await res.json();
    setSmtpTesting(false);
    if (res.ok) showToast(data.message);
    else showToast(data.error, 'error');
  };

  const leadsWithEmail = leads.filter(l => l.email);

  const previewHtml = editTemplate
    ? renderEmail(
        { ...EMPTY_TEMPLATE, ...editTemplate } as Template,
        leads[0] || { name: 'Ejemplo Empresa', city: 'Ciudad', website: 'www.ejemplo.com', email: 'contacto@ejemplo.com' }
      )
    : '';

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>📧 Marketing</h2>
        <p>Crea campañas y envía emails masivos a tus leads</p>
      </div>

      <div className="tabs">
        {(['campañas', 'templates', 'config'] as const).map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'campañas' ? '📨 Campañas' : t === 'templates' ? '📝 Templates' : '⚙️ Config SMTP'}
          </div>
        ))}
      </div>

      {/* ====== CAMPAÑAS ====== */}
      {tab === 'campañas' && (
        <div>
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Nueva Campaña</h3>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div>
                <label className="label">Nombre de la campaña</label>
                <input className="input" placeholder="ej: Promo Enero 2025" value={newCampaign.name} onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Template de email</label>
                <select className="input" value={newCampaign.templateId} onChange={e => setNewCampaign({ ...newCampaign, templateId: e.target.value })}>
                  <option value="">Seleccionar template...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <label className="label">Seleccionar leads ({leadsWithEmail.length} con email)</label>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
              {leadsWithEmail.length === 0 ? (
                <div style={{ padding: 16, color: '#94a3b8', fontSize: 14 }}>No hay leads con email.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input type="checkbox"
                          checked={selectedLeads.size === leadsWithEmail.length}
                          onChange={() => selectedLeads.size === leadsWithEmail.length
                            ? setSelectedLeads(new Set())
                            : setSelectedLeads(new Set(leadsWithEmail.map(l => l.id)))}
                        />
                      </th>
                      <th>Empresa</th><th>Email</th><th>Ciudad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leadsWithEmail.map(lead => (
                      <tr key={lead.id}>
                        <td>
                          <input type="checkbox" checked={selectedLeads.has(lead.id)}
                            onChange={() => {
                              const next = new Set(selectedLeads);
                              next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id);
                              setSelectedLeads(next);
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 500 }}>{lead.name}</td>
                        <td style={{ color: '#64748b' }}>{lead.email}</td>
                        <td>{lead.city}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <button className="btn btn-primary" onClick={createCampaign}>
              ➕ Crear Campaña ({selectedLeads.size} leads)
            </button>
          </div>

          {campaigns.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Campañas ({campaigns.length})</h3>
              </div>
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Leads</th><th>Estado</th><th>Enviados</th><th>Rebotes</th><th>Fecha</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const leadsArr: number[] = JSON.parse(c.leads_json || '[]');
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>{leadsArr.length}</td>
                        <td>
                          <span className={`status-badge ${c.status === 'sent' ? 'status-cliente' : 'status-nuevo'}`}>
                            {c.status === 'sent' ? '✅ Enviada' : '📋 Borrador'}
                          </span>
                        </td>
                        <td>{c.sent_count || 0}</td>
                        <td>{c.bounce_count || 0}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>
                          {c.sent_at ? new Date(c.sent_at).toLocaleDateString('es') : new Date(c.created_at).toLocaleDateString('es')}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {c.status === 'draft' && (
                              <button className="btn btn-primary btn-sm" onClick={() => sendCampaign(c.id)} disabled={sending === c.id}>
                                {sending === c.id ? '⏳ Enviando...' : '📨 Enviar'}
                              </button>
                            )}
                            <button className="btn btn-ghost btn-sm" onClick={() => deleteCampaign(c.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sendResult && (
            <div className="card" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
              <h3 style={{ color: '#166534', margin: '0 0 8px' }}>✅ Campaña enviada</h3>
              <p style={{ margin: '0 0 8px', color: '#166534' }}>Enviados: {sendResult.sent} · Rebotes: {sendResult.bounced}</p>
              {sendResult.errors && sendResult.errors.length > 0 && (
                <details style={{ fontSize: 12, color: '#64748b' }}>
                  <summary>Ver errores ({sendResult.errors.length})</summary>
                  {sendResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====== TEMPLATES ====== */}
      {tab === 'templates' && (
        <div>
          {!editTemplate ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>{templates.length} templates</span>
                <button className="btn btn-primary btn-sm" onClick={() => setEditTemplate({ ...EMPTY_TEMPLATE })}>
                  ➕ Nuevo Template
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="card">
                  <div className="empty-state">
                    <div className="icon">📝</div>
                    <h3>No hay templates</h3>
                    <p>Crea tu primera plantilla de email profesional</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {templates.map(t => (
                    <div key={t.id} className="card" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <div style={{ width: 14, height: 14, borderRadius: '50%', background: t.header_color || '#f97316' }} />
                            <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>📌 {t.subject}</div>
                          {t.sig_company && <div style={{ fontSize: 12, color: '#94a3b8' }}>🏢 {t.sig_company} · {t.sig_name}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditTemplate(t)}>✏️ Editar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => deleteTemplate(t.id)}>🗑</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* ====== TEMPLATE EDITOR ====== */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

              {/* Left: form */}
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                      {(editTemplate as Template).id ? 'Editar Template' : 'Nuevo Template'}
                    </h3>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditTemplate(null)}>✕ Cancelar</button>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="label">Nombre del template</label>
                    <input className="input" placeholder="ej: Presentación servicios" value={editTemplate.name || ''} onChange={e => setEditTemplate({ ...editTemplate, name: e.target.value })} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="label">Asunto del email</label>
                    <input className="input" placeholder="ej: Hola {{nombre_empresa}}, tengo algo para ti" value={editTemplate.subject || ''} onChange={e => setEditTemplate({ ...editTemplate, subject: e.target.value })} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label className="label">Color del encabezado</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="color" value={editTemplate.header_color || '#f97316'}
                        onChange={e => setEditTemplate({ ...editTemplate, header_color: e.target.value })}
                        style={{ width: 44, height: 36, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }}
                      />
                      {['#f97316','#6366f1','#0ea5e9','#10b981','#ef4444','#1e293b'].map(c => (
                        <div key={c} onClick={() => setEditTemplate({ ...editTemplate, header_color: c })}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                            border: editTemplate.header_color === c ? '3px solid #0f172a' : '2px solid transparent' }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LOGO & ENCABEZADO</h4>
                  <div style={{ marginBottom: 14 }}>
                    <label className="label">URL del logo (opcional)</label>
                    <input className="input" placeholder="https://tuempresa.com/logo.png" value={editTemplate.logo_url || ''} onChange={e => setEditTemplate({ ...editTemplate, logo_url: e.target.value })} />
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Sube tu logo a imgur.com o usa una URL directa de imagen</div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CUERPO DEL EMAIL</h4>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {VARS.map(v => (
                      <span key={v} className="chip" onClick={() => {
                        const ta = document.getElementById('email-body') as HTMLTextAreaElement;
                        if (ta) {
                          const start = ta.selectionStart; const end = ta.selectionEnd;
                          const current = editTemplate.body || '';
                          setEditTemplate({ ...editTemplate, body: current.slice(0, start) + v + current.slice(end) });
                        } else {
                          setEditTemplate({ ...editTemplate, body: (editTemplate.body || '') + v });
                        }
                      }}>{v}</span>
                    ))}
                  </div>
                  <textarea id="email-body" className="input" style={{ minHeight: 180 }}
                    placeholder={`Hola {{nombre_empresa}},\n\nEsperamos que te encuentres bien.\n\nQuiero presentarte nuestros servicios de...`}
                    value={editTemplate.body || ''}
                    onChange={e => setEditTemplate({ ...editTemplate, body: e.target.value })}
                  />
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BOTÓN CTA (opcional)</h4>
                  <div className="form-grid">
                    <div>
                      <label className="label">Texto del botón</label>
                      <input className="input" placeholder="Reserva tu cita" value={editTemplate.cta_text || ''} onChange={e => setEditTemplate({ ...editTemplate, cta_text: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">URL del botón</label>
                      <input className="input" placeholder="https://tuempresa.com/contacto" value={editTemplate.cta_url || ''} onChange={e => setEditTemplate({ ...editTemplate, cta_url: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>FIRMA</h4>
                  <div className="form-grid">
                    <div>
                      <label className="label">Tu nombre</label>
                      <input className="input" placeholder="Juan Pérez" value={editTemplate.sig_name || ''} onChange={e => setEditTemplate({ ...editTemplate, sig_name: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Cargo</label>
                      <input className="input" placeholder="Director Comercial" value={editTemplate.sig_title || ''} onChange={e => setEditTemplate({ ...editTemplate, sig_title: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Empresa</label>
                      <input className="input" placeholder="Mi Empresa S.A." value={editTemplate.sig_company || ''} onChange={e => setEditTemplate({ ...editTemplate, sig_company: e.target.value })} />
                    </div>
                    <div>
                      <label className="label">Teléfono</label>
                      <input className="input" placeholder="+52 55 1234 5678" value={editTemplate.sig_phone || ''} onChange={e => setEditTemplate({ ...editTemplate, sig_phone: e.target.value })} />
                    </div>
                  </div>
                </div>

                <button className="btn btn-primary" style={{ width: '100%' }} onClick={saveTemplate}>
                  💾 Guardar Template
                </button>
              </div>

              {/* Right: live preview */}
              <div style={{ position: 'sticky', top: 24 }}>
                <div className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>VISTA PREVIA</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className={`btn btn-sm ${previewMode === 'desktop' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreviewMode('desktop')}>🖥 Desktop</button>
                      <button className={`btn btn-sm ${previewMode === 'mobile' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPreviewMode('mobile')}>📱 Mobile</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', background: '#e5e7eb', borderRadius: 8, padding: 16, minHeight: 400 }}>
                    <iframe
                      srcDoc={previewHtml}
                      style={{
                        width: previewMode === 'mobile' ? 375 : '100%',
                        minHeight: 500,
                        border: 'none',
                        borderRadius: 8,
                        background: 'white',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      }}
                      title="Email preview"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== CONFIG SMTP ====== */}
      {tab === 'config' && (
        <div style={{ maxWidth: 580 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Elige tu proveedor:</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className={`btn btn-sm ${(smtp.host === 'smtp.gmail.com' || !smtp.host) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSmtp({ ...smtp, host: 'smtp.gmail.com', port: 587 })}>📧 Gmail</button>
              <button className={`btn btn-sm ${smtp.host === 'smtp-relay.brevo.com' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSmtp({ ...smtp, host: 'smtp-relay.brevo.com', port: 587 })}>📨 Brevo</button>
              <button className={`btn btn-sm ${smtp.host === 'smtp.office365.com' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSmtp({ ...smtp, host: 'smtp.office365.com', port: 587 })}>🔷 Outlook</button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Configuración SMTP</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>
              {smtp.host === 'smtp-relay.brevo.com' ? 'Brevo: contraseña = API Key SMTP de brevo.com'
                : smtp.host === 'smtp.office365.com' ? 'Outlook: usa tu email y contraseña de Microsoft.'
                : 'Gmail: necesitas una "Contraseña de aplicación" (no tu contraseña normal).'}
            </p>

            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div>
                <label className="label">Servidor SMTP</label>
                <input className="input" placeholder="smtp.gmail.com" value={smtp.host || ''} onChange={e => setSmtp({ ...smtp, host: e.target.value })} />
              </div>
              <div>
                <label className="label">Puerto</label>
                <input className="input" type="number" placeholder="587" value={smtp.port || ''} onChange={e => setSmtp({ ...smtp, port: parseInt(e.target.value) })} />
              </div>
              <div>
                <label className="label">Usuario (tu email)</label>
                <input className="input" placeholder="tu@gmail.com" value={smtp.user || ''} onChange={e => setSmtp({ ...smtp, user: e.target.value })} />
              </div>
              <div>
                <label className="label">Contraseña de aplicación</label>
                <input className="input" type="password" placeholder="xxxx xxxx xxxx xxxx" value={smtp.pass || ''} onChange={e => setSmtp({ ...smtp, pass: e.target.value })} />
              </div>
              <div>
                <label className="label">Nombre remitente</label>
                <input className="input" placeholder="Mi Empresa" value={smtp.from_name || ''} onChange={e => setSmtp({ ...smtp, from_name: e.target.value })} />
              </div>
              <div>
                <label className="label">Email remitente</label>
                <input className="input" placeholder="tu@gmail.com" value={smtp.from_email || ''} onChange={e => setSmtp({ ...smtp, from_email: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveSmtp} disabled={smtpSaving}>
                {smtpSaving ? 'Guardando...' : '💾 Guardar'}
              </button>
              <button className="btn btn-secondary" onClick={testSmtp} disabled={smtpTesting}>
                {smtpTesting ? '⏳ Probando...' : '🧪 Enviar email de prueba'}
              </button>
            </div>

            {(smtp.host === 'smtp.gmail.com' || !smtp.host) && (
              <div style={{ marginTop: 20, padding: 14, background: '#fef9c3', borderRadius: 8, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📋 Cómo obtener Contraseña de Aplicación:</div>
                <ol style={{ fontSize: 13, color: '#475569', margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                  <li>Ve a <strong>myaccount.google.com/apppasswords</strong></li>
                  <li>Nombre: <strong>Prospectos</strong> → Crear</li>
                  <li>Copia la contraseña de 16 caracteres</li>
                  <li>Pégala en el campo de arriba → Guardar → Probar</li>
                </ol>
              </div>
            )}
          </div>

          {/* LocalProspects API Key */}
          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>🔑 LocalProspects API Key</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              Obtén leads enriquecidos con nombre del dueño, email directo, teléfono y tipo. Regístrate en <strong>localprospects.ai</strong>
            </p>
            <div>
              <label className="label">API Key (empieza con lp_)</label>
              <input
                className="input"
                type="password"
                placeholder="lp_xxxxxxxxxxxx"
                value={smtp.lp_api_key || ''}
                onChange={e => setSmtp({ ...smtp, lp_api_key: e.target.value })}
              />
            </div>
            {smtp.lp_api_key && !smtp.lp_api_key.endsWith('***') && (
              <div style={{ marginTop: 8, fontSize: 12, color: smtp.lp_api_key.startsWith('lp_') ? '#059669' : '#dc2626' }}>
                {smtp.lp_api_key.startsWith('lp_') ? '✓ Formato válido' : '⚠ La clave debe empezar con lp_'}
              </div>
            )}
            {smtp.lp_api_key?.endsWith('***') && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#059669' }}>✓ API Key configurada</div>
            )}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={saveSmtp} disabled={smtpSaving}>
                {smtpSaving ? 'Guardando...' : '💾 Guardar API Key'}
              </button>
            </div>
            <div style={{ marginTop: 14, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 13 }}>
              <strong>Cuando configures la API key:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#166534', lineHeight: 1.8 }}>
                <li>Búsqueda "Por Empresa" usará LocalProspects automáticamente</li>
                <li>Resultados incluyen dueño, email personal, teléfono verificado</li>
                <li>Sin API key → usa búsqueda básica con Brave</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
