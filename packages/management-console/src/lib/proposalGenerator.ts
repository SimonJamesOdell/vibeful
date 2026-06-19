/**
 * LLM Proposal Generator — AI analyzes agent graphs and suggests optimizations.
 *
 * Adapted from lsml-composer/server/proposalGenerator.ts.
 * Analyzes the current workflow for issues and opportunities, then proposes
 * concrete changes with estimated impact and confidence scoring.
 */

import type { Node, Edge } from '@xyflow/react';
import type { VibefulNodeData } from './flowStore';
import { VIBEFUL_NODE_TYPES } from '../const';

export interface WorkflowProposal {
  title: string;
  problem: string;
  solution: string;
  benefits: string;
  risks: string;
  changes: ProposalChange[];
  estimatedImpact: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    costChange: string;
    latencyChange: string;
  };
  confidence: number; // 0-100
}

export interface ProposalChange {
  type: 'add_node' | 'remove_node' | 'modify_config' | 'enable_phase' | 'disable_phase';
  target: string;
  description: string;
}

const SYSTEM_PROMPT = `You are an expert workflow optimization AI for Vibeful agent graphs. Analyze agent configurations and propose improvements.

**Available Node Types:**
${VIBEFUL_NODE_TYPES.map((nt) => `- ${nt.label} (${nt.type}): ${nt.description}`).join('\n')}

**Available Analysis Phases (when analysis_pipeline node is present):**
- memories (0.2): Extract user facts — +safety, +cost
- impressions (0.5): User emotional state detection — +empathy, +cost
- concepts (0.5): New conceptual frameworks — +insight, +cost
- assumptions (0.2): Implicit user assumptions — +understanding, +cost
- intent (0.4): Rich intent classification — +routing, +cost
- conductor (0.5): Dynamic temperature control — +adaptability, +cost
- code_detect (0.5): Code generation requests — +code_quality, +cost
- search_detect (0.4): Web search detection — +accuracy, +cost
- global_memories (0.5): Cross-user knowledge — +insight, +cost
- next (0.5): Next-message prediction — +engagement, +cost
- search_execute: Actual web search — +accuracy, +cost
- output_routing: DML segment routing — +precision, +cost

**Optimization Principles:**
1. **Cost**: Each additional node and analysis phase adds LLM calls. Don't suggest unnecessary additions.
2. **Latency**: More nodes = longer response time. Balance capability vs speed.
3. **Safety**: Attack guard should always be present for production agents.
4. **Completeness**: For production agents, include fact_mining to learn about users.
5. **Specific context**: Tailor suggestions to the agent's purpose.

**Response Format — Return ONLY valid JSON with a "proposals" array:**
{
  "proposals": [
    {
      "title": "Add Attack Guard for Security",
      "problem": "This agent has no attack guard. It is vulnerable to prompt injection, jailbreak attempts, and data exfiltration.",
      "solution": "Add a builtin.attack_guard node as the entry point. It routes safe messages to setup and blocks attacks.",
      "benefits": "Protects against prompt injection (95% detection), jailbreak attempts, SQL injection, and XSS.",
      "risks": "None — attack_guard is a fast regex-based check with negligible latency.",
      "changes": [
        { "type": "add_node", "target": "attack_guard", "description": "Add Attack Guard as graph entry point" }
      ],
      "estimatedImpact": {
        "nodesAdded": 1, "nodesRemoved": 0, "nodesModified": 0,
        "costChange": "+$0.0001/turn", "latencyChange": "+5ms"
      },
      "confidence": 95
    }
  ]
}

**Examples of good proposals:**
1. Agent missing attack guard → suggest adding it (confidence 95+)
2. Agent has analysis_pipeline but no impressions → suggest enabling it for user empathy (confidence 70+)
3. Agent has analysis_pipeline with output_routing but no conductor → suggest conductor for dynamic temp control (confidence 85+)
4. Support agent has no fact_mining → suggest adding it to learn about users (confidence 80+)
5. Agent has too many analysis phases for a simple use case → suggest disabling unnecessary ones (confidence 60+)`;

/**
 * Generate optimization proposals for the current agent graph.
 */
export async function generateProposals(
  nodes: Node<VibefulNodeData>[],
  edges: Edge[],
): Promise<WorkflowProposal[]> {
  const graphContext = {
    nodes: nodes.map((n) => ({
      label: n.data.label,
      type: n.data.nodeType,
      config: n.data.config,
    })),
    edges: edges.map((e) => ({
      source: nodes.find((n) => n.id === e.source)?.data?.label || '?',
      target: nodes.find((n) => n.id === e.target)?.data?.label || '?',
    })),
    totalNodes: nodes.length,
    hasAnalysis: nodes.some((n) => n.data.nodeType === 'builtin.analysis_pipeline'),
    hasOutputRouter: nodes.some((n) => n.data.nodeType === 'builtin.output_router'),
    hasAttackGuard: nodes.some((n) => n.data.nodeType === 'builtin.attack_guard'),
    hasFactMining: nodes.some((n) => n.data.nodeType === 'builtin.fact_mining'),
    hasRAG: nodes.some((n) => n.data.nodeType === 'builtin.rag'),
  };

  const userContent = `Current agent graph:\n${JSON.stringify(graphContext, null, 2)}\n\nAnalyze this graph and propose 2-4 concrete optimizations.`;

  try {
    const resp = await fetch('/v1/ai/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_prompt: SYSTEM_PROMPT,
        message: userContent,
        temperature: 0.5,
        max_tokens: 800,
      }),
    });

    if (!resp.ok) {
      return await fallbackProposals(SYSTEM_PROMPT, userContent);
    }

    const data = await resp.json();
    const content = data.response || data.content || '';
    return parseProposals(content);
  } catch {
    return await fallbackProposals(SYSTEM_PROMPT, userContent);
  }
}

async function fallbackProposals(systemPrompt: string, userContent: string): Promise<WorkflowProposal[]> {
  try {
    const resp = await fetch('http://localhost:50052/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userContent,
        system_prompt: systemPrompt,
        temperature: 0.5,
        max_tokens: 800,
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const content = data.response || data.content || '';
    return parseProposals(content);
  } catch {
    return [];
  }
}

function parseProposals(content: string): WorkflowProposal[] {
  try {
    let json = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const start = json.indexOf('{');
    const end = json.lastIndexOf('}');
    if (start >= 0 && end > start) {
      json = json.slice(start, end + 1);
    }

    const parsed = JSON.parse(json);
    const proposals = parsed.proposals || (Array.isArray(parsed) ? parsed : []);
    return proposals.map((p: any) => ({
      title: p.title || 'Untitled Proposal',
      problem: p.problem || '',
      solution: p.solution || '',
      benefits: p.benefits || '',
      risks: p.risks || '',
      changes: (p.changes || []).map((c: any) => ({
        type: c.type || 'modify_config',
        target: c.target || '',
        description: c.description || '',
      })),
      estimatedImpact: {
        nodesAdded: p.estimatedImpact?.nodesAdded || 0,
        nodesRemoved: p.estimatedImpact?.nodesRemoved || 0,
        nodesModified: p.estimatedImpact?.nodesModified || 0,
        costChange: p.estimatedImpact?.costChange || 'unknown',
        latencyChange: p.estimatedImpact?.latencyChange || 'unknown',
      },
      confidence: p.confidence || 50,
    }));
  } catch {
    return [];
  }
}
