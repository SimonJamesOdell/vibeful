import { useState, useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from './components/FlowCanvas';
import NodePalette from './components/NodePalette';
import PropertyPanel from './components/PropertyPanel';
import { useFlowStore } from './lib/flowStore';
import { generateYaml, parseGraphFromYaml } from './lib/yamlGenerator';
import { Play, Save, FolderOpen, FilePlus, Download } from 'lucide-react';
import AIAssistantPanel from './components/AIAssistantPanel';
import VersionHistory from './components/VersionHistory';
import ABTestDashboard from './components/ABTestDashboard';
import RegressionMonitor from './components/RegressionMonitor';
import ProposalCard from './components/ProposalCard';
import GlyphManager from './components/GlyphManager';
import ConceptBrowser from './components/ConceptBrowser';
import GlobalMemoryExplorer from './components/GlobalMemoryExplorer';
import TokenDashboard from './components/TokenDashboard';
import SetupWizard from './components/SetupWizard';
import NodeTooltip from './components/NodeTooltip';
import AgentList from './components/AgentList';
import ContextManager from './components/ContextManager';
import Dashboard from './components/Dashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'designer' | 'agents' | 'templates' | 'versions' | 'proposals' | 'abtest' | 'monitor' | 'glyphs' | 'concepts' | 'memories' | 'tokens' | 'contexts'>('dashboard');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentList, setAgentList] = useState<Array<{ id: string; name: string; config_yaml?: string }>>([]);

  // Fetch agent list for the selector dropdown
  useEffect(() => {
    fetch('/v1/agents')
      .then((r) => r.json())
      .then((data) => setAgentList(Array.isArray(data) ? data : data.agents || []))
      .catch(() => {});
  }, []);

  const switchToAgent = async (agentId: string) => {
    try {
      const resp = await fetch(`/v1/agents/${agentId}`);
      const data = await resp.json();
      const parsed = parseGraphFromYaml(data);
      if (parsed) {
        loadGraph(parsed.nodes as any, parsed.edges);
        setAgentName(data.name || '');
      }
    } catch {
      // Keep current graph if agent can't be loaded
    }
    setActiveAgentId(agentId);
    setActiveTab('designer');
  };

  const {
    nodes, edges,
    agentName, setAgentName,
    agentDescription, setAgentDescription,
    codePreviewVisible, toggleCodePreview,
    propertiesVisible, toggleProperties,
    selectedNodeId,
    loadGraph, clearGraph,
  } = useFlowStore();

  // Track previous selection to animate properties panel only on enter/exit
  const prevSelectedRef = useRef<string | null>(null);
  const [panelAnimating, setPanelAnimating] = useState(false);

  useEffect(() => {
    const wasSelected = prevSelectedRef.current !== null;
    const isSelected = selectedNodeId !== null;
    if (wasSelected !== isSelected) {
      setPanelAnimating(true);
    } else {
      setPanelAnimating(false);
    }
    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const handleDeploy = async () => {
    const yaml = generateYaml(nodes, edges, agentName, agentDescription);
    try {
      const resp = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agentName, description: agentDescription, config_yaml: yaml }),
      });
      const data = await resp.json();
      if (resp.ok) {
        alert(`Agent deployed! ID: ${data.id}`);
      } else {
        alert(`Deploy failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Deploy error: ${err.message}`);
    }
  };

  const handleSave = () => {
    const yaml = generateYaml(nodes, edges, agentName, agentDescription);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentName || 'agent'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = async (templateName: string) => {
    try {
      const resp = await fetch(`/v1/agents?template=${templateName}`);
      if (!resp.ok) {
        // Try loading from local templates
        const localResp = await fetch(`/templates/${templateName}.yaml`);
        if (!localResp.ok) {
          alert('Template not found');
          return;
        }
        const text = await localResp.text();
        // Basic YAML parsing for template
        loadTemplateFromYaml(text);
        return;
      }
      const agents = await resp.json();
      if (agents.length > 0) {
        const parsed = parseGraphFromYaml(agents[0]);
        if (parsed) {
          loadGraph(parsed.nodes, parsed.edges);
          setAgentName(agents[0].name || '');
          setAgentDescription(agents[0].description || '');
        }
      }
    } catch (err: any) {
      alert(`Load error: ${err.message}`);
    }
  };

  const loadTemplateFromYaml = (yamlText: string) => {
    // Simple template loading - in production, use a proper YAML parser
    // For now, we load pre-built templates
    const templates: Record<string, { nodes: any[]; edges: any[]; name: string }> = {
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

    const template = Object.values(templates).find((t) =>
      yamlText.includes(t.name)
    ) || templates.minimal;

    loadGraph(template.nodes as any, template.edges);
    setAgentName(template.name);
  };

  // ── Vibeful Guide event handlers ────────────────────────────
  // The Guide agent emits custom DOM events to control the console.
  // This demonstrates the same command protocol end users' agents will use.

  useEffect(() => {
    const onDeploy = () => { handleDeploy(); };
    const onLoadTemplate = (e: Event) => {
      loadTemplateFromYaml((e as CustomEvent).detail);
    };
    const onNavigate = (e: Event) => {
      const tab = (e as CustomEvent).detail as string;
      const validTabs = ['dashboard', 'designer', 'agents', 'templates', 'versions', 'proposals', 'abtest', 'monitor', 'glyphs', 'concepts', 'memories', 'tokens', 'contexts'];
      if (validTabs.includes(tab)) setActiveTab(tab as typeof activeTab);
    };
    const onConfigureAnalysis = (e: Event) => {
      const phases = (e as CustomEvent).detail;
      console.log('[Vibeful Guide] Analysis configured:', phases);
    };

    window.addEventListener('vibeful:deploy', onDeploy);
    window.addEventListener('vibeful:load-template', onLoadTemplate);
    window.addEventListener('vibeful:navigate', onNavigate);
    window.addEventListener('vibeful:configure-analysis', onConfigureAnalysis);

    return () => {
      window.removeEventListener('vibeful:deploy', onDeploy);
      window.removeEventListener('vibeful:load-template', onLoadTemplate);
      window.removeEventListener('vibeful:navigate', onNavigate);
      window.removeEventListener('vibeful:configure-analysis', onConfigureAnalysis);
    };
  }, []);

  return (
    <ReactFlowProvider>
      <SetupWizard />
      <NodeTooltip />
      <div className="h-screen flex flex-col bg-slate-950">
        {/* Header */}
        <header className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-slate-200">Vibeful Console</h1>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Dashboard
              </button>
              <div className="w-px h-4 bg-slate-700 self-center" />
              <button
                onClick={() => setActiveTab('designer')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'designer' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Designer
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'agents' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Agents
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'templates' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Templates
              </button>
              <button
                onClick={() => setActiveTab('versions')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'versions' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Versions
              </button>
              <button
                onClick={() => setActiveTab('proposals')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'proposals' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Proposals
              </button>
              <button
                onClick={() => setActiveTab('abtest')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'abtest' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                A/B Tests
              </button>
              <button
                onClick={() => setActiveTab('monitor')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'monitor' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Monitor
              </button>
              <div className="w-px h-4 bg-slate-700" />
              <button
                onClick={() => setActiveTab('glyphs')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'glyphs' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Glyphs
              </button>
              <button
                onClick={() => setActiveTab('concepts')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'concepts' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Concepts
              </button>
              <button
                onClick={() => setActiveTab('memories')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'memories' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Memories
              </button>
              <button
                onClick={() => setActiveTab('tokens')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'tokens' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Tokens
              </button>
              <button
                onClick={() => setActiveTab('contexts')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'contexts' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Knowledge
              </button>
            </div>
          </div>

          {/* Agent selector dropdown */}
          <div className="flex-1 flex justify-center">
            {agentList.length > 1 && (
              <select
                value={activeAgentId || ''}
                onChange={(e) => { const id = e.target.value; if (id === 'new') { setActiveAgentId(null); loadGraph([], []); setAgentName(''); } else if (id) switchToAgent(id); }}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 max-w-[200px]"
              >
                <option value="">Select agent…</option>
                <option value="new">＋ New Agent</option>
                {agentList.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || 'Unnamed'}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent name…"
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 w-40 focus:outline-none focus:border-indigo-500"
            />
            <div className="w-px h-5 bg-slate-700" />
            <button onClick={handleSave} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
              <Download size={12} /> Save
            </button>
            <button onClick={handleDeploy} className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">
              <Play size={12} /> Deploy
            </button>
            {activeAgentId && (
              <>
                <div className="w-px h-5 bg-slate-700" />
                <button
                  onClick={async () => {
                    const yaml = generateYaml(nodes, edges, agentName, agentDescription);
                    const resp = await fetch('/v1/agents', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: `${agentName} (copy)`, description: agentDescription, config_yaml: yaml }),
                    });
                    if (resp.ok) {
                      const data = await resp.json();
                      setActiveAgentId(data.id);
                      setAgentList((prev) => [...prev, { id: data.id, name: `${agentName} (copy)` }]);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
                  title="Clone agent"
                >
                  Clone
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`Delete agent "${agentName}"? This cannot be undone.`)) return;
                    fetch(`/v1/agents/${activeAgentId}`, { method: 'DELETE' }).then(() => {
                      setAgentList((prev) => prev.filter((a) => a.id !== activeAgentId));
                      setActiveAgentId(null);
                      loadGraph([], []);
                      setAgentName('');
                    });
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-red-700 text-slate-200 rounded transition-colors"
                  title="Delete agent"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </header>

        {/* Body */}
        {activeTab === 'dashboard' ? (
          <Dashboard onNavigate={setActiveTab} />
        ) : activeTab === 'designer' ? (
          <div className="flex-1 flex overflow-hidden">
            <NodePalette />
            <div className="flex-1 min-w-0 relative">
              <FlowCanvas />
            </div>
            <div className={`
              overflow-hidden flex-shrink-0 bg-slate-900
              ${panelAnimating ? 'transition-all duration-300 ease-in-out' : ''}
              ${selectedNodeId ? 'w-72 opacity-100 border-l border-slate-700' : 'w-0 opacity-0 pointer-events-none'}
            `}>
              <PropertyPanel />
            </div>
            <div className="w-[340px] bg-slate-900 border-l border-slate-700 flex-shrink-0">
              <AIAssistantPanel />
            </div>
          </div>
        ) : activeTab === 'versions' ? (
          <div className="flex-1 overflow-y-auto">
            <VersionHistory agentId={activeAgentId} />
          </div>
        ) : activeTab === 'proposals' ? (
          <div className="flex-1 overflow-y-auto">
            <ProposalCard agentId={activeAgentId} />
          </div>
        ) : activeTab === 'abtest' ? (
          <div className="flex-1 overflow-y-auto">
            <ABTestDashboard agentId={activeAgentId} />
          </div>
        ) : activeTab === 'monitor' ? (
          <div className="flex-1 overflow-y-auto">
            <RegressionMonitor agentId={activeAgentId} />
          </div>
        ) : activeTab === 'glyphs' ? (
          <div className="flex-1 overflow-y-auto">
            <GlyphManager />
          </div>
        ) : activeTab === 'concepts' ? (
          <div className="flex-1 overflow-y-auto">
            <ConceptBrowser />
          </div>
        ) : activeTab === 'memories' ? (
          <div className="flex-1 overflow-y-auto">
            <GlobalMemoryExplorer />
          </div>
        ) : activeTab === 'agents' ? (
          <div className="flex-1 overflow-y-auto">
            <AgentList onSelect={(id) => { setActiveAgentId(id); setActiveTab('designer'); }} />
          </div>
        ) : activeTab === 'tokens' ? (
          <div className="flex-1 overflow-y-auto">
            <TokenDashboard />
          </div>
        ) : activeTab === 'contexts' ? (
          <div className="flex-1 overflow-y-auto">
            <ContextManager />
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Agent Templates</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'Minimal Agent', key: 'minimal', desc: 'Setup → System Prompt → ReAct → Stream. Simplest agent loop.' },
                { name: 'Full Agent', key: 'full', desc: 'Attack guard, fact recall, planning, analysis, output routing. Production-ready.' },
                { name: 'Lucid Analysis Agent', key: 'lucid', desc: 'Analysis pipeline + conductor + DML output router. Full Lucid parity.' },
              ].map((tpl) => (
                <button
                  key={tpl.key}
                  onClick={() => { loadTemplateFromYaml(tpl.name); setActiveTab('designer'); }}
                  className="p-4 bg-slate-900 border border-slate-700 rounded-lg hover:border-indigo-500 transition-colors text-left"
                >
                  <div className="text-sm font-medium text-slate-200">{tpl.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{tpl.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
