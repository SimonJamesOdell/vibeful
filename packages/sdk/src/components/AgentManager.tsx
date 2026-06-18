// Agent Management Studio — admin dashboard for Vibeful
import React, { useState, useEffect } from 'react';
import { client, type AgentData } from '../client';

export function AgentManager() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [selected, setSelected] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', system_prompt: '', model: 'deepseek-chat',
    temperature: 0.7, max_tokens: 4096, personality: '', tone: 'professional',
  });

  useEffect(() => { loadAgents(); }, []);

  const loadAgents = async () => {
    try { setAgents(await client.listAgents()); } catch {}
  };

  const createAgent = async () => {
    if (!form.name) return;
    setLoading(true);
    try {
      const agent = await client.createAgent(form);
      setAgents((prev) => [...prev, agent]);
      setForm({ name: '', description: '', system_prompt: '', model: 'deepseek-chat', temperature: 0.7, max_tokens: 4096, personality: '', tone: 'professional' });
    } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('Delete this agent?')) return;
    await client.deleteAgent(id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '1rem', height: '100%' }}>
      {/* Sidebar */}
      <div style={{ borderRight: '1px solid #e0e0e0', padding: '0.75rem', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Agents</h3>
        {agents.map((a) => (
          <div
            key={a.id}
            onClick={() => setSelected(a)}
            style={{
              padding: '0.5rem', marginBottom: '0.25rem', borderRadius: '6px', cursor: 'pointer',
              background: selected?.id === a.id ? '#eff6ff' : 'transparent',
              border: selected?.id === a.id ? '1px solid #2563eb' : '1px solid transparent',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.name}</div>
            <div style={{ fontSize: '0.7rem', color: '#999' }}>{a.model} · {a.tone}</div>
          </div>
        ))}
        {agents.length === 0 && <div style={{ color: '#999', fontSize: '0.8rem' }}>No agents yet</div>}
      </div>

      {/* Main */}
      <div style={{ padding: '0.75rem', overflow: 'auto' }}>
        {selected ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{selected.name}</h2>
              <button onClick={() => deleteAgent(selected.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Row label="ID" value={selected.id} />
              <Row label="Description" value={selected.description || '(none)'} />
              <Row label="System Prompt" value={selected.system_prompt || '(default)'} />
              <Row label="Model" value={selected.model} />
              <Row label="Temperature" value={String(selected.temperature)} />
              <Row label="Max Tokens" value={String(selected.max_tokens)} />
              <Row label="Personality" value={selected.personality || '(none)'} />
              <Row label="Tone" value={selected.tone} />
              <Row label="Created" value={selected.created_at} />
            </div>
          </div>
        ) : (
          <div>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem' }}>Create Agent</h2>
            <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '500px' }}>
              <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} textarea />
              <Field label="System Prompt" value={form.system_prompt} onChange={(v) => setForm({ ...form, system_prompt: v })} textarea />
              <Field label="Personality" value={form.personality} onChange={(v) => setForm({ ...form, personality: v })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                <SelectField label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} options={['deepseek-chat', 'deepseek-reasoner']} />
                <SelectField label="Tone" value={form.tone} onChange={(v) => setForm({ ...form, tone: v })} options={['professional', 'friendly', 'casual', 'formal']} />
                <Field label="Temperature" value={String(form.temperature)} onChange={(v) => setForm({ ...form, temperature: parseFloat(v) || 0.7 })} />
                <Field label="Max Tokens" value={String(form.max_tokens)} onChange={(v) => setForm({ ...form, max_tokens: parseInt(v) || 4096 })} />
              </div>
              <button onClick={createAgent} disabled={loading || !form.name} style={{ padding: '0.6rem 1.5rem', background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}>
                {loading ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
      <span style={{ color: '#999', fontWeight: 600 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, textarea, required }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; required?: boolean }) {
  const Comp = textarea ? 'textarea' : 'input';
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{label}{required ? ' *' : ''}</label>
      <Comp value={value} onChange={(e: any) => onChange(e.target.value)} rows={textarea ? 3 : undefined}
        style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.85rem', fontFamily: 'inherit' }} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.85rem' }}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
