import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerCommandHandler,
  unregisterCommandHandler,
  executeCommand,
  CONSOLE_COMMANDS,
} from '../lib/commandProtocol';

// ═══════════════════════════════════════════════════════════════
// Invariants for page-related Guide commands:
// - update_page: requires page_id, accepts content_markdown/content alias
// - publish_page: requires page_id, defaults publish=true, can unpublish
// - delete_page: requires page_id, sends DELETE
// ═══════════════════════════════════════════════════════════════

// Need to import the handlers to register them
// The handlers are registered in AIAssistantPanel's useEffect,
// so we need to manually register equivalent handlers for testing.
// We test the handler logic in isolation via fetch mocking.

function mockFetch(response: unknown, ok = true) {
  (globalThis as any).fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => response,
  });
}

function clearHandlers() {
  unregisterCommandHandler(CONSOLE_COMMANDS.UPDATE_PAGE);
  unregisterCommandHandler(CONSOLE_COMMANDS.PUBLISH_PAGE);
  unregisterCommandHandler(CONSOLE_COMMANDS.DELETE_PAGE);
}

beforeEach(() => {
  clearHandlers();
  vi.restoreAllMocks();
});

describe('update_page command handler', () => {
  it('requires page_id', async () => {
    registerCommandHandler(CONSOLE_COMMANDS.UPDATE_PAGE, (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      return { updated: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.UPDATE_PAGE,
      details: { title: 'New Title' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('page_id required');
  });

  it('accepts content_markdown and content as aliases', async () => {
    mockFetch({ id: 'p1' });
    registerCommandHandler(CONSOLE_COMMANDS.UPDATE_PAGE, async (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      const content = details.content_markdown || details.content;
      await fetch(`/v1/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_markdown: content }),
      });
      return { updated: true };
    });
    // Using 'content' alias
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.UPDATE_PAGE,
      details: { page_id: 'p1', content: '# Hello' },
    });
    expect(result.success).toBe(true);
  });

  it('errors when no fields provided', async () => {
    registerCommandHandler(CONSOLE_COMMANDS.UPDATE_PAGE, (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      const hasFields = details.title !== undefined
        || details.content_markdown !== undefined
        || details.content !== undefined
        || details.layout_json !== undefined;
      if (!hasFields) throw new Error('No fields to update');
      return { updated: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.UPDATE_PAGE,
      details: { page_id: 'p1' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No fields to update');
  });

  it('sends PUT with correct fields', async () => {
    mockFetch({ id: 'p1', title: 'Updated' });
    registerCommandHandler(CONSOLE_COMMANDS.UPDATE_PAGE, async (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      const body: Record<string, unknown> = {};
      if (details.title !== undefined) body.title = details.title;
      if (details.content_markdown !== undefined) body.content_markdown = details.content_markdown;
      await fetch(`/v1/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { updated: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.UPDATE_PAGE,
      details: { page_id: 'p1', title: 'Updated', content_markdown: '## Hi' },
    });
    expect(result.success).toBe(true);
    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.title).toBe('Updated');
    expect(callBody.content_markdown).toBe('## Hi');
  });
});

describe('publish_page command handler', () => {
  it('requires page_id', async () => {
    registerCommandHandler(CONSOLE_COMMANDS.PUBLISH_PAGE, (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      return { published: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.PUBLISH_PAGE,
      details: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('page_id required');
  });

  it('defaults to publishing (publish=true)', async () => {
    mockFetch({ id: 'p1' });
    registerCommandHandler(CONSOLE_COMMANDS.PUBLISH_PAGE, async (details) => {
      const pageId = details.page_id as string;
      const publish = details.publish !== false;
      await fetch(`/v1/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: publish ? 1 : 0 }),
      });
      return { published: publish };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.PUBLISH_PAGE,
      details: { page_id: 'p1' },
    });
    expect(result.success).toBe(true);
    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.published).toBe(1);
  });

  it('can unpublish with publish=false', async () => {
    mockFetch({ id: 'p1' });
    registerCommandHandler(CONSOLE_COMMANDS.PUBLISH_PAGE, async (details) => {
      const pageId = details.page_id as string;
      const publish = details.publish !== false;
      await fetch(`/v1/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: publish ? 1 : 0 }),
      });
      return { published: publish };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.PUBLISH_PAGE,
      details: { page_id: 'p1', publish: false },
    });
    expect(result.success).toBe(true);
    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.published).toBe(0);
  });
});

describe('delete_page command handler', () => {
  it('requires page_id', async () => {
    registerCommandHandler(CONSOLE_COMMANDS.DELETE_PAGE, (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      return { deleted: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.DELETE_PAGE,
      details: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('page_id required');
  });

  it('sends DELETE request', async () => {
    mockFetch({ status: 'deleted' });
    registerCommandHandler(CONSOLE_COMMANDS.DELETE_PAGE, async (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      await fetch(`/v1/pages/${pageId}`, { method: 'DELETE' });
      return { deleted: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.DELETE_PAGE,
      details: { page_id: 'p1' },
    });
    expect(result.success).toBe(true);
    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/v1/pages/p1');
  });

  it('errors when delete fails', async () => {
    mockFetch({ detail: 'Not found' }, false);
    registerCommandHandler(CONSOLE_COMMANDS.DELETE_PAGE, async (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      const resp = await fetch(`/v1/pages/${pageId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete page');
      return { deleted: true };
    });
    const result = await executeCommand({
      action: CONSOLE_COMMANDS.DELETE_PAGE,
      details: { page_id: 'nonexistent' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to delete page');
  });
});
