// Widget Studio — conversational widget builder component
// Widget Studio — Admin describes a widget conversationally, agent generates the config.

import React, { useState } from 'react';
import { WidgetRenderer } from './WidgetRenderer';

interface WidgetConfig {
  type: string;
  title: string;
  data: any;
}

export function WidgetStudio() {
  const [prompt, setPrompt] = useState('');
  const [widget, setWidget] = useState<WidgetConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);

  const generateWidget = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setHistory((prev) => [...prev, { role: 'user', content: prompt }]);

    try {
      // In production: use the Meta Agent to generate widget config
      // For now: parse the prompt and create a simple widget
      const lower = prompt.toLowerCase();

      if (lower.includes('chart') || lower.includes('graph') || lower.includes('bar')) {
        setWidget({
          type: 'chart',
          title: prompt,
          data: [
            { label: 'A', value: 30 },
            { label: 'B', value: 50 },
            { label: 'C', value: 20 },
            { label: 'D', value: 40 },
          ],
        });
      } else if (lower.includes('table') || lower.includes('list') || lower.includes('grid')) {
        setWidget({
          type: 'table',
          title: prompt,
          data: {
            columns: ['Name', 'Value', 'Status'],
            rows: [
              { Name: 'Item 1', Value: 100, Status: 'Active' },
              { Name: 'Item 2', Value: 200, Status: 'Pending' },
              { Name: 'Item 3', Value: 150, Status: 'Active' },
            ],
          },
        });
      } else if (lower.includes('form') || lower.includes('input')) {
        setWidget({
          type: 'form',
          title: prompt,
          data: {
            fields: [
              { label: 'Name', type: 'text', placeholder: 'Enter name' },
              { label: 'Email', type: 'email', placeholder: 'Enter email' },
              { label: 'Message', type: 'textarea', placeholder: 'Your message' },
            ],
          },
        });
      } else {
        setWidget({
          type: 'card',
          title: prompt,
          data: {
            items: [
              { title: 'Generated Widget', description: prompt, value: 'Ready' },
            ],
          },
        });
      }

      setHistory((prev) => [...prev, { role: 'assistant', content: `Widget created: ${widget?.type || 'card'}` }]);
    } catch (err: any) {
      setHistory((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
      setPrompt('');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', height: '100%', padding: '1rem' }}>
      {/* Left: Conversation */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Widget Studio</h3>
        <div style={{ flex: 1, overflow: 'auto', marginBottom: '0.75rem' }}>
          {history.map((msg, i) => (
            <div key={i} style={{
              marginBottom: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: '8px',
              background: msg.role === 'user' ? '#eff6ff' : '#f3f4f6',
              fontSize: '0.85rem',
            }}>
              <strong>{msg.role === 'user' ? 'You' : 'Builder'}:</strong> {msg.content}
            </div>
          ))}
          {history.length === 0 && (
            <div style={{ color: '#999', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
              Describe the widget you want to build. Examples:
              <br />"A bar chart showing quarterly sales"
              <br />"A table of top products"
              <br />"A contact form"
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generateWidget()}
            placeholder="Describe your widget..."
            disabled={loading}
            style={{
              flex: 1, padding: '0.4rem', borderRadius: '6px', border: '1px solid #d0d0d0',
              fontSize: '0.85rem',
            }}
          />
          <button
            onClick={generateWidget}
            disabled={loading || !prompt.trim()}
            style={{
              padding: '0.4rem 1rem', background: loading ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
            }}
          >
            {loading ? 'Building...' : 'Build'}
          </button>
        </div>
      </div>

      {/* Right: Preview */}
      <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Preview</h3>
        {widget ? (
          <WidgetRenderer widgets={[{ widget_id: 'preview', type: widget.type as any, props: { data: widget.data, title: widget.title } }]} />
        ) : (
          <div style={{ color: '#999', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
            Your widget will appear here
          </div>
        )}
      </div>
    </div>
  );
}
