/**
 * Shared agent templates — used by both the AI Assistant (LOAD_TEMPLATE command)
 * and the App (vibeful:load-template DOM event listener).
 */
import type { Node, Edge } from '@xyflow/react';
import type { VibefulNodeData } from './flowStore';

export interface AgentTemplate {
  name: string;
  nodes: Node<VibefulNodeData>[];
  edges: Edge[];
}

export const TEMPLATES: Record<string, AgentTemplate> = {
  minimal: {
    name: 'Minimal Agent',
    nodes: [
      { id: 'n1', type: 'vibefulNode', position: { x: 250, y: 50 }, data: { label: 'setup', nodeType: 'builtin.setup', config: {} } },
      { id: 'n2', type: 'vibefulNode', position: { x: 250, y: 170 }, data: { label: 'system_prompt', nodeType: 'builtin.system_message_builder', config: {} } },
      { id: 'n3', type: 'vibefulNode', position: { x: 250, y: 290 }, data: { label: 'react_agent', nodeType: 'builtin.react_agent', config: { max_iterations: 5 } } },
      { id: 'n4', type: 'vibefulNode', position: { x: 250, y: 410 }, data: { label: 'stream_completion', nodeType: 'builtin.stream_completion', config: {} } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
    ],
  },
  full: {
    name: 'Full Agent',
    nodes: [
      { id: 'n1', type: 'vibefulNode', position: { x: 250, y: 50 }, data: { label: 'attack_guard', nodeType: 'builtin.attack_guard', config: {} } },
      { id: 'n2', type: 'vibefulNode', position: { x: 250, y: 170 }, data: { label: 'setup', nodeType: 'builtin.setup', config: {} } },
      { id: 'n3', type: 'vibefulNode', position: { x: 250, y: 290 }, data: { label: 'fact_recall', nodeType: 'builtin.fact_recall', config: {} } },
      { id: 'n4', type: 'vibefulNode', position: { x: 250, y: 410 }, data: { label: 'planning', nodeType: 'builtin.planning', config: {} } },
      { id: 'n5', type: 'vibefulNode', position: { x: 250, y: 530 }, data: { label: 'system_prompt', nodeType: 'builtin.system_message_builder', config: {} } },
      { id: 'n6', type: 'vibefulNode', position: { x: 250, y: 650 }, data: { label: 'analysis_pipeline', nodeType: 'builtin.analysis_pipeline', config: {} } },
      { id: 'n7', type: 'vibefulNode', position: { x: 250, y: 770 }, data: { label: 'react_agent', nodeType: 'builtin.react_agent', config: { max_iterations: 5 } } },
      { id: 'n8', type: 'vibefulNode', position: { x: 250, y: 890 }, data: { label: 'output_router', nodeType: 'builtin.output_router', config: {} } },
      { id: 'n9', type: 'vibefulNode', position: { x: 250, y: 1010 }, data: { label: 'stream_completion', nodeType: 'builtin.stream_completion', config: {} } },
      { id: 'n10', type: 'vibefulNode', position: { x: 250, y: 1130 }, data: { label: 'fact_mining', nodeType: 'builtin.fact_mining', config: {} } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7' },
      { id: 'e7', source: 'n7', target: 'n8' },
      { id: 'e8', source: 'n8', target: 'n9' },
      { id: 'e9', source: 'n9', target: 'n10' },
    ],
  },
  lucid: {
    name: 'Lucid Analysis Agent',
    nodes: [
      { id: 'n1', type: 'vibefulNode', position: { x: 250, y: 50 }, data: { label: 'attack_guard', nodeType: 'builtin.attack_guard', config: {} } },
      { id: 'n2', type: 'vibefulNode', position: { x: 250, y: 170 }, data: { label: 'setup', nodeType: 'builtin.setup', config: {} } },
      { id: 'n3', type: 'vibefulNode', position: { x: 250, y: 290 }, data: { label: 'system_prompt', nodeType: 'builtin.system_message_builder', config: {} } },
      { id: 'n4', type: 'vibefulNode', position: { x: 250, y: 410 }, data: { label: 'analysis_pipeline', nodeType: 'builtin.analysis_pipeline', config: {} } },
      { id: 'n5', type: 'vibefulNode', position: { x: 250, y: 530 }, data: { label: 'react_agent', nodeType: 'builtin.react_agent', config: { max_iterations: 5 } } },
      { id: 'n6', type: 'vibefulNode', position: { x: 250, y: 650 }, data: { label: 'output_router', nodeType: 'builtin.output_router', config: {} } },
      { id: 'n7', type: 'vibefulNode', position: { x: 250, y: 770 }, data: { label: 'stream_completion', nodeType: 'builtin.stream_completion', config: {} } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7' },
    ],
  },
};
