// Observability Dashboard — cost tracking and event monitoring
import React, { useState, useEffect } from 'react';
import { client } from '../client';

export function ObservabilityDashboard() {
  const [cost, setCost] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [gaps, setGaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [costData, usageData, gapData] = await Promise.all([
        fetch('http://localhost:8000/v1/cost?days=30').then(r => r.json()),
        fetch('http://localhost:8000/v1/analytics/usage?days=7').then(r => r.json()),
        fetch('http://localhost:8000/v1/analytics/knowledge-gaps?days=7').then(r => r.json()),
      ]);
      setCost(costData);
      setUsage(usageData);
      setGaps(Array.isArray(gapData) ? gapData : []);
    } catch {}
    setLoading(false);
  };

  return (
    <div style={{ padding: '1rem', overflow: 'auto', height: '100%' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem' }}>Observability</h2>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card title="Total Turns" value={usage?.total_turns || 0} subtitle="Last 7 days" />
        <Card title="Sessions" value={usage?.unique_sessions || 0} subtitle="Unique users" />
        <Card title="Tokens" value={Number(usage?.total_tokens || 0).toLocaleString()} subtitle="Total consumed" />
        <Card title="Cost" value={`$${Number(usage?.total_cost || 0).toFixed(4)}`} subtitle="USD" color="#2563eb" />
      </div>

      {/* Knowledge Gaps */}
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Knowledge Gaps</h3>
      {gaps.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {gaps.slice(0, 10).map((g: any, i: number) => (
            <div key={i} style={{ padding: '0.5rem 0.75rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Q: {g.question || '(unknown)'}</div>
              <div style={{ color: '#666' }}>A: {g.answer || '(no answer)'}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#999', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          {loading ? 'Loading...' : 'No knowledge gaps detected'}
        </div>
      )}

      {/* Cost Details */}
      {cost && (
        <div>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>30-Day Cost</h3>
          <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px', fontSize: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div><strong>LLM Calls:</strong> {cost.total_events || 0}</div>
              <div><strong>Total Tokens:</strong> {Number(cost.total_tokens || 0).toLocaleString()}</div>
              <div><strong>Total Cost:</strong> ${Number(cost.total_cost || 0).toFixed(4)}</div>
            </div>
          </div>
        </div>
      )}

      <button onClick={loadData} disabled={loading}
        style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  );
}

function Card({ title, value, subtitle, color }: { title: string; value: string | number; subtitle: string; color?: string }) {
  return (
    <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
      <div style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color || '#111' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: '#999' }}>{subtitle}</div>
    </div>
  );
}
