// Knowledge Context Manager — upload and manage knowledge bases
import React, { useState, useEffect } from 'react';
import { client } from '../client';

export function ContextManager() {
  const [contexts, setContexts] = useState<any[]>([]);
  const [ctxName, setCtxName] = useState('');
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('knowledge.txt');
  const [selectedCtx, setSelectedCtx] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { loadContexts(); }, []);

  const loadContexts = async () => {
    try { setContexts(await client.listContexts()); } catch {}
  };

  const createContext = async () => {
    if (!ctxName) return;
    setLoading(true);
    try {
      await client.createContext(ctxName);
      setCtxName('');
      await loadContexts();
    } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  const ingestText = async () => {
    if (!selectedCtx || !text) return;
    setLoading(true);
    try {
      const r = await client.ingestText(selectedCtx, text, filename);
      setResult(r);
      setText('');
    } catch (err: any) { alert(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '1rem', height: '100%' }}>
      <div style={{ borderRight: '1px solid #e0e0e0', padding: '0.75rem', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Contexts</h3>
        {contexts.map((c: any) => (
          <div
            key={c.id}
            onClick={() => setSelectedCtx(c.id)}
            style={{
              padding: '0.5rem', marginBottom: '0.25rem', borderRadius: '6px', cursor: 'pointer',
              background: selectedCtx === c.id ? '#eff6ff' : 'transparent',
              border: selectedCtx === c.id ? '1px solid #2563eb' : '1px solid transparent',
              fontSize: '0.85rem',
            }}
          >
            {c.name}
          </div>
        ))}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.25rem' }}>
          <input value={ctxName} onChange={(e) => setCtxName(e.target.value)} placeholder="New context name"
            style={{ flex: 1, padding: '0.3rem', borderRadius: '4px', border: '1px solid #d0d0d0', fontSize: '0.8rem' }} />
          <button onClick={createContext} disabled={loading || !ctxName}
            style={{ padding: '0.3rem 0.5rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+</button>
        </div>
      </div>

      <div style={{ padding: '0.75rem', overflow: 'auto' }}>
        {selectedCtx ? (
          <div>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Ingest Knowledge</h3>
            <div style={{ display: 'grid', gap: '0.5rem', maxWidth: '600px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Filename</label>
                <input value={filename} onChange={(e) => setFilename(e.target.value)}
                  style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.85rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Content</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12}
                  placeholder="Paste your knowledge content here..."
                  style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.85rem', fontFamily: 'monospace' }} />
              </div>
              <button onClick={ingestText} disabled={loading || !text}
                style={{ padding: '0.5rem 1rem', background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' }}>
                {loading ? 'Ingesting...' : 'Ingest & Embed'}
              </button>
              {result && (
                <div style={{ padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', fontSize: '0.8rem' }}>
                  Ingested: {result.chunk_count} chunks · {result.char_count || text.length} chars
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: '#999', padding: '2rem', textAlign: 'center' }}>Select or create a context to manage knowledge</div>
        )}
      </div>
    </div>
  );
}
