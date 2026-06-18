// MCP Server Manager — register and view MCP servers
import React, { useState, useEffect } from 'react';
import { client } from '../client';

export function McpManager() {
  const [servers, setServers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadServers(); }, []);

  const loadServers = async () => {
    try { setServers(await client.listMcpServers()); } catch {}
  };

  const createServer = async () => {
    if (!name || !url) return;
    setLoading(true);
    try {
      await client.createMcpServer(name, url);
      setName('');
      setUrl('');
      await loadServers();
    } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>MCP Servers</h3>

      {/* Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', maxWidth: '600px', marginBottom: '1rem' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name"
          style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.85rem' }} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://mcp-web-search:3100"
          style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.85rem' }} />
        <button onClick={createServer} disabled={loading || !name || !url}
          style={{ padding: '0.4rem 1rem', background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          Register
        </button>
      </div>

      {/* List */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {servers.map((s: any) => (
          <div key={s.id} style={{ padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'monospace' }}>{s.url}</div>
            </div>
            <div style={{ fontSize: '0.7rem' }}>
              <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', background: s.enabled ? '#dcfce7' : '#fee2e2', color: s.enabled ? '#166534' : '#991b1b' }}>{s.enabled ? 'Active' : 'Disabled'}</span>
            </div>
          </div>
        ))}
        {servers.length === 0 && <div style={{ color: '#999', fontSize: '0.85rem' }}>No MCP servers registered</div>}
      </div>
    </div>
  );
}
