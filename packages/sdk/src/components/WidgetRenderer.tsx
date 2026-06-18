// Widget Renderers — chart, table, form, card

interface WidgetRendererProps {
  type: string;
  data: any;
  title?: string;
}

export function WidgetRenderer({ type, data, title }: WidgetRendererProps) {
  switch (type) {
    case 'table':
      return <TableWidget data={data} title={title} />;
    case 'chart':
      return <ChartWidget data={data} title={title} />;
    case 'card':
      return <CardWidget data={data} title={title} />;
    case 'form':
      return <FormWidget data={data} title={title} />;
    default:
      return (
        <div style={{ padding: '1rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
          {title && <h3 style={{ margin: '0 0 0.5rem' }}>{title}</h3>}
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
      );
  }
}

function TableWidget({ data, title }: { data: any; title?: string }) {
  const rows = Array.isArray(data) ? data : data?.rows || [];
  const cols = data?.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);

  if (rows.length === 0) {
    return <div style={{ padding: '1rem', color: '#999' }}>No data</div>;
  }

  return (
    <div style={{ overflow: 'auto', maxHeight: '300px' }}>
      {title && <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>{title}</h3>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr>
            {cols.map((col: string) => (
              <th key={col} style={{ textAlign: 'left', padding: '0.4rem', borderBottom: '2px solid #e0e0e0', background: '#f9fafb' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, i: number) => (
            <tr key={i}>
              {cols.map((col: string) => (
                <td key={col} style={{ padding: '0.4rem', borderBottom: '1px solid #f0f0f0' }}>{String(row[col] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartWidget({ data, title }: { data: any; title?: string }) {
  // Simple bar chart from an array of numbers or {label, value} pairs
  const items: Array<{ label: string; value: number }> = Array.isArray(data)
    ? data.map((d: any, i: number) => ({
        label: d.label || d.name || `Item ${i + 1}`,
        value: typeof d === 'number' ? d : d.value || d.count || 0,
      }))
    : [];

  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div style={{ padding: '0.5rem' }}>
      {title && <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{title}</h3>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '150px' }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: '100%', maxWidth: '60px',
                height: `${(item.value / maxVal) * 120}px`,
                background: `hsl(${(i * 40) % 360}, 70%, 60%)`,
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.3s',
              }}
            />
            <span style={{ fontSize: '0.7rem', marginTop: '0.25rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60px' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardWidget({ data, title }: { data: any; title?: string }) {
  const items = Array.isArray(data?.items) ? data.items : [data];

  return (
    <div>
      {title && <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{title}</h3>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ flex: '1 1 200px', padding: '0.75rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
            {item.title && <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.85rem' }}>{item.title}</h4>}
            {item.description && <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>{item.description}</p>}
            {item.value !== undefined && <p style={{ margin: '0.25rem 0 0', fontSize: '1.2rem', fontWeight: 700, color: '#2563eb' }}>{item.value}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormWidget({ data, title }: { data: any; title?: string }) {
  const fields = data?.fields || [];

  return (
    <div style={{ padding: '0.5rem' }}>
      {title && <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{title}</h3>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {fields.map((field: any, i: number) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea rows={3} placeholder={field.placeholder} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '0.85rem' }} />
            ) : field.type === 'select' ? (
              <select style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '0.85rem' }}>
                {field.options?.map((opt: string) => <option key={opt}>{opt}</option>)}
              </select>
            ) : (
              <input type={field.type || 'text'} placeholder={field.placeholder} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #e0e0e0', fontSize: '0.85rem' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
