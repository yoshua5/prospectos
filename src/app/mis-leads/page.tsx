'use client';
import { useState, useEffect, useCallback } from 'react';

type Lead = {
  id: number;
  name: string;
  website: string;
  email: string;
  phone: string;
  owner: string;
  phone_type: string;
  address: string;
  city: string;
  social: string;
  service: string;
  keywords: string;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  interesado: 'Interesado',
  no_interesado: 'No interesado',
  cliente: 'Cliente',
};

const EMPTY_LEAD = { name: '', website: '', email: '', phone: '', address: '', city: '', social: '', service: '', keywords: '', status: 'nuevo' };

export default function MisLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState<typeof EMPTY_LEAD | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data);
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este lead?')) return;
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    showToast('Lead eliminado');
    fetchLeads();
  };

  const handleDeleteSelected = async () => {
    if (!selected.size || !confirm(`¿Eliminar ${selected.size} leads?`)) return;
    await fetch('/api/leads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    showToast(`${selected.size} leads eliminados`);
    fetchLeads();
  };

  const handleStatusChange = async (id: number, status: string) => {
    const lead = leads.find(l => l.id === id)!;
    await fetch(`/api/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...lead, status }),
    });
    fetchLeads();
  };

  const handleSaveEdit = async () => {
    if (!editLead) return;
    await fetch(`/api/leads/${editLead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editLead),
    });
    setEditLead(null);
    showToast('Lead actualizado');
    fetchLeads();
  };

  const handleSaveNew = async () => {
    if (!newLead?.name) { showToast('Nombre requerido', 'error'); return; }
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLead),
    });
    setNewLead(null);
    showToast('Lead agregado ✓');
    fetchLeads();
  };

  const handleExport = () => {
    const ids = selected.size > 0 ? [...selected].join(',') : '';
    const url = `/api/leads/export${ids ? `?ids=${ids}` : ''}`;
    window.open(url, '_blank');
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      {/* Modal nuevo lead */}
      {newLead && (
        <div className="modal-overlay" onClick={() => setNewLead(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>➕ Agregar Lead Manualmente</h3>
            {(['name', 'website', 'email', 'phone', 'address', 'city'] as const).map(field => (
              <div key={field} style={{ marginBottom: 14 }}>
                <label className="label" style={{ textTransform: 'capitalize' }}>
                  {field === 'name' ? 'Nombre *' : field}
                </label>
                <input
                  className="input"
                  value={newLead[field as keyof typeof newLead] || ''}
                  onChange={e => setNewLead({ ...newLead, [field]: e.target.value })}
                />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label className="label">Estado</label>
              <select className="input" value={newLead.status} onChange={e => setNewLead({ ...newLead, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setNewLead(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveNew}>Guardar Lead</button>
            </div>
          </div>
        </div>
      )}

      {editLead && (
        <div className="modal-overlay" onClick={() => setEditLead(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Editar Lead</h3>
            {(['name', 'website', 'email', 'phone', 'address', 'city'] as const).map(field => (
              <div key={field} style={{ marginBottom: 14 }}>
                <label className="label" style={{ textTransform: 'capitalize' }}>{field}</label>
                <input
                  className="input"
                  value={editLead[field] || ''}
                  onChange={e => setEditLead({ ...editLead, [field]: e.target.value })}
                />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label className="label">Estado</label>
              <select className="input" value={editLead.status} onChange={e => setEditLead({ ...editLead, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditLead(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <h2>👥 Mis Leads</h2>
        <p>{leads.length} leads guardados</p>
      </div>

      <div className="card" style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="🔍 Buscar por nombre, email, ciudad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          <select className="input" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setNewLead({ ...EMPTY_LEAD })}>
              ➕ Agregar Lead
            </button>
            {selected.size > 0 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={handleExport}>
                  ⬇️ Exportar ({selected.size})
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>
                  🗑 Eliminar ({selected.size})
                </button>
              </>
            )}
            {selected.size === 0 && leads.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={handleExport}>
                ⬇️ Exportar CSV
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando...</div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👥</div>
            <h3>No hay leads aún</h3>
            <p>Ve a Búsqueda de Leads para encontrar prospectos</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleAll} />
                </th>
                <th>Empresa</th>
                <th>Contacto</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Ciudad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{lead.name || '—'}</div>
                    {lead.website && (
                      <a href={lead.website} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: '#f97316', textDecoration: 'none' }}>
                        {lead.website.replace(/^https?:\/\//, '').slice(0, 30)}
                      </a>
                    )}
                  </td>
                  <td style={{ color: lead.owner ? '#7c3aed' : '#cbd5e1', fontSize: 13 }}>{lead.owner || '—'}</td>
                  <td style={{ color: lead.email ? '#0f172a' : '#cbd5e1' }}>{lead.email || '—'}</td>
                  <td>
                    <span style={{ color: lead.phone ? '#0f172a' : '#cbd5e1' }}>{lead.phone || '—'}</span>
                    {lead.phone_type && (
                      <span style={{
                        marginLeft: 5, fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                        background: lead.phone_type === 'MOBILE' ? '#dcfce7' : '#dbeafe',
                        color: lead.phone_type === 'MOBILE' ? '#166534' : '#1e40af',
                      }}>{lead.phone_type}</span>
                    )}
                  </td>
                  <td>{lead.city || '—'}</td>
                  <td>
                    <select
                      className={`status-badge status-${lead.status}`}
                      value={lead.status}
                      onChange={e => handleStatusChange(lead.id, e.target.value)}
                      style={{ cursor: 'pointer', border: 'none', outline: 'none', background: 'inherit' }}
                    >
                      {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditLead(lead)} title="Editar">✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(lead.id)} title="Eliminar">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
