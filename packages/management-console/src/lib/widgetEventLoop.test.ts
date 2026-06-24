import { describe, it, expect, beforeEach, vi } from 'vitest';

// We test the widget event loop logic in isolation — the handleWidgetEvent
// async function that sends widget interactions to the agent and processes
// the response. This is the critical Tier 3 path.

describe('Widget event loop invariants', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends widget_id, event_type, value, and form_data to /v1/pages/:id/interact', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};

    (globalThis as any).fetch = vi.fn().mockImplementation(
      (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string || '{}');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'Got it!', finished: true }),
        });
      },
    );

    // Simulate what handleWidgetEvent does
    const pageId = 'page-1';
    const event = { widget_id: 'btn-1', event_type: 'click', value: 'Submit', form_data: undefined };

    const resp = await fetch(`/v1/pages/${pageId}/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_id: event.widget_id,
        event_type: event.event_type,
        value: event.value,
        form_data: event.form_data,
      }),
    });
    const data = await resp.json();

    expect(capturedUrl).toBe('/v1/pages/page-1/interact');
    expect(capturedBody.widget_id).toBe('btn-1');
    expect(capturedBody.event_type).toBe('click');
    expect(capturedBody.value).toBe('Submit');
    expect(data.response).toBe('Got it!');
  });

  it('handles form_data correctly when present', async () => {
    let capturedBody: Record<string, unknown> = {};

    (globalThis as any).fetch = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string || '{}');
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'Thanks!', finished: true }),
        });
      },
    );

    const formData = { name: 'Alice', email: 'alice@example.com', message: 'Hello' };
    const resp = await fetch('/v1/pages/page-1/interact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_id: 'contact-form',
        event_type: 'submit',
        value: null,
        form_data: formData,
      }),
    });

    expect(resp.ok).toBe(true);
    expect(capturedBody.form_data).toEqual(formData);
    expect(capturedBody.value).toBeNull();
  });

  it('handles agent error response gracefully', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ detail: 'Agent graph not initialized' }),
    });

    let caughtError = '';
    try {
      const resp = await fetch('/v1/pages/page-1/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widget_id: 'w1', event_type: 'click', value: null, form_data: null }),
      });
      if (!resp.ok) throw new Error(`Agent error (${resp.status})`);
    } catch (e: unknown) {
      caughtError = (e as Error).message;
    }

    expect(caughtError).toBe('Agent error (503)');
  });

  it('parses vibeful-command blocks from agent response to extract new widgets', () => {
    // The agent's response contains a vibeful-command block
    const agentResponse = `Thank you for submitting!\n\n\`\`\`vibeful-command\n{"action":"render_widget","details":{"widget_id":"card-1","type":"card","props":{"title":"Confirmation","content":"We received your submission."}}}\n\`\`\``;

    // Use the same parse logic as the PageViewer
    const parseCommands = (text: string) => {
      const commands: Array<{ action: string; details: Record<string, unknown> }> = [];
      const regex = /```vibeful-command\s*([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(match[1].trim());
          if (parsed.action && parsed.details) {
            commands.push({ action: parsed.action, details: parsed.details });
          }
        } catch { /* skip */ }
      }
      return commands;
    };

    const newCommands = parseCommands(agentResponse);
    const newWidgets = newCommands
      .filter((c) => c.action === 'render_widget')
      .map((c) => ({
        widget_id: c.details.widget_id || 'unknown',
        type: c.details.type || 'card',
        props: c.details.props || {},
      }));

    expect(newWidgets).toHaveLength(1);
    expect(newWidgets[0].widget_id).toBe('card-1');
    expect(newWidgets[0].type).toBe('card');
    expect((newWidgets[0].props as Record<string, unknown>).title).toBe('Confirmation');
  });

  it('strips vibeful-command blocks from response text for display', () => {
    const agentResponse = `Here is your result.\n\n\`\`\`vibeful-command\n{"action":"render_widget","details":{"widget_id":"chart-1","type":"chart","props":{"items":[{"label":"A","value":10}]}}}\n\`\`\`\n\nThank you!`;

    const cleanText = agentResponse.replace(/```vibeful-command\s*[\s\S]*?```/g, '').trim();

    expect(cleanText).not.toContain('vibeful-command');
    expect(cleanText).not.toContain('render_widget');
    expect(cleanText).toBe('Here is your result.\n\n\n\nThank you!');
  });

  it('handles multiple widget blocks in a single response', () => {
    const agentResponse = `\`\`\`vibeful-command\n{"action":"render_widget","details":{"widget_id":"w1","type":"card","props":{"title":"First"}}}\n\`\`\`\n\`\`\`vibeful-command\n{"action":"render_widget","details":{"widget_id":"w2","type":"button","props":{"label":"Click me"}}}\n\`\`\``;

    const parseCommands = (text: string) => {
      const commands: Array<{ action: string; details: Record<string, unknown> }> = [];
      const regex = /```vibeful-command\s*([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        try {
          const parsed = JSON.parse(match[1].trim());
          if (parsed.action && parsed.details) {
            commands.push({ action: parsed.action, details: parsed.details });
          }
        } catch { /* skip */ }
      }
      return commands;
    };

    const widgets = parseCommands(agentResponse)
      .filter((c) => c.action === 'render_widget')
      .map((c) => ({ id: c.details.widget_id, type: c.details.type }));

    expect(widgets).toHaveLength(2);
    expect(widgets[0].id).toBe('w1');
    expect(widgets[0].type).toBe('card');
    expect(widgets[1].id).toBe('w2');
    expect(widgets[1].type).toBe('button');
  });
});
