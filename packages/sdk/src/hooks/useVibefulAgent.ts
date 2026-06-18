import { useState, useCallback, useRef } from 'react';
import { client, type ConversationChunk, type Message } from '../client';

interface UseAgentOptions {
  agentId: string;
  contextIds?: string[];
  mcpUrls?: string[];
}

export interface Citation {
  chunk_index: number;
  filename: string;
  text_snippet: string;
  similarity: number;
}

export interface QuickReply {
  label: string;
  message: string;
}

export function useVibefulAgent({ agentId, contextIds, mcpUrls }: UseAgentOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState('');
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ total_tokens: number; cost_usd: number } | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  const initSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await client.createSession(agentId, contextIds, mcpUrls);
    sessionIdRef.current = session.session_id;
    return session.session_id;
  }, [agentId, contextIds, mcpUrls]);

  const send = useCallback(async (content: string) => {
    setLoading(true);
    setStreaming('');
    setCitations([]);
    setFollowUps([]);
    setQuickReplies([]);
    setMessages((prev) => [...prev, { role: 'user', content }]);

    try {
      const sessionId = await initSession();
      const chunks: ConversationChunk[] = await client.converse(sessionId, content);

      let fullText = '';
      for (const chunk of chunks) {
        if (chunk.state === 'STREAMING') {
          fullText += chunk.text_chunk || '';
          setStreaming(fullText);
        } else if (chunk.state === 'REFERENCES') {
          if (chunk.citations) {
            setCitations(chunk.citations as Citation[]);
          }
          if (chunk.text_chunk) {
            fullText += chunk.text_chunk;
            setStreaming(fullText);
          }
        } else if (chunk.state === 'TOOL_USED' && chunk.tool_call) {
          setStreaming((prev) => prev + `\n\n🔧 Using: ${chunk.tool_call!.name}`);
        } else if (chunk.state === 'FOLLOW_UP') {
          if (chunk.follow_up_questions) {
            setFollowUps(chunk.follow_up_questions as string[]);
          }
          if (chunk.quick_replies) {
            setQuickReplies(chunk.quick_replies as QuickReply[]);
          }
        } else if (chunk.state === 'COMPLETED' && chunk.usage) {
          setUsage({ total_tokens: chunk.usage.total_tokens, cost_usd: chunk.usage.cost_usd });
        }
      }

      if (fullText) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText }]);
      }
      setStreaming('');
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [initSession]);

  const handleQuickReply = useCallback((reply: QuickReply) => {
    send(reply.message);
  }, [send]);

  return {
    messages, streaming, loading, usage, citations, followUps, quickReplies,
    send, handleQuickReply, connected: !!sessionIdRef.current,
  };
}
