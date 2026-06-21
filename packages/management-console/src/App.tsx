import { useState, useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from './components/FlowCanvas';
import NodePalette from './components/NodePalette';
import PropertyPanel from './components/PropertyPanel';
import { useFlowStore } from './lib/flowStore';
import { generateYaml, parseGraphFromYaml } from './lib/yamlGenerator';
import { Play, Save, FolderOpen, FilePlus, Download, Loader2, ChevronDown, TestTube, Palette } from 'lucide-react';
import AIAssistantPanel from './components/AIAssistantPanel';
import ToastContainer, { showToast } from './components/Toast';
import TestChatModal from './components/TestChatModal';
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
import CreateAgentModal from './components/CreateAgentModal';
import StylingModal from './components/StylingModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'designer' | 'agents' | 'templates' | 'versions' | 'proposals' | 'abtest' | 'monitor' | 'glyphs' | 'concepts' | 'memories' | 'tokens' | 'contexts'>('dashboard');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentList, setAgentList] = useState<Array<{ id: string; name: string; config_yaml?: string }>>([]);
  const [contextList, setContextList] = useState<Array<{ id: string; name: string }>>([]);

  const fetchAgents = () => {
    fetch('/v1/agents')
      .then((r) => r.json())
      .then((data) => setAgentList(Array.isArray(data) ? data : data.agents || []))
      .catch(() => {});
  };
  const fetchContexts = () => {
    fetch('/v1/contexts')
      .then((r) => r.json())
      .then((data) => setContextList(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  // Fetch agent and context lists
  useEffect(() => { fetchAgents(); fetchContexts(); }, []);

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
        showToast(`Agent "${agentName}" deployed — ID: ${data.id.slice(0, 8)}…`, 'success');
      } else {
        showToast(`Deploy failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Deploy error: ${err.message}`, 'error');
    }
  };

  const handleCreateAgent = async (name: string, templateKey: string) => {
    setCreateModalOpen(false);
    // Create in DB
    await fetch('/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: '', system_prompt: '' }),
    });
    fetchAgents();
    setAgentName(name);
    // Load template
    setActiveTab('designer');
    setQuickStartToast(`Building your ${templateKey === 'minimal' ? 'chatbot' : 'agent'}…`);
    setTimeout(() => {
      loadTemplateFromYaml(templateKey);
      setQuickStartToast(null);
    }, 600);
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

    // Try exact key first, then name match, fall back to minimal
    const template = templates[yamlText]
      || Object.values(templates).find((t) => yamlText.includes(t.name))
      || templates.minimal;

    loadGraph(template.nodes as any, template.edges);
    setAgentName(template.name);
  };

  // ── Quick-start toast state ──────────────────────────────────
  const [quickStartToast, setQuickStartToast] = useState<string | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalDefaults, setCreateModalDefaults] = useState<{ name?: string; template?: string }>({});
  const [stylingModalOpen, setStylingModalOpen] = useState(false);

  // Auto-close styling modal when navigating away from editor
  useEffect(() => {
    if (activeTab !== 'designer') setStylingModalOpen(false);
  }, [activeTab]);

  // ── Vibeful Guide event handlers ────────────────────────────
  useEffect(() => {
    const onDeploy = () => { handleDeploy(); };
    const onLoadTemplate = (e: Event) => {
      loadTemplateFromYaml((e as CustomEvent).detail);
    };

    // Quick-start flow: navigate to designer, load template, show toast, trigger AI
    const onQuickStart = (e: Event) => {
      const { template, message } = (e as CustomEvent).detail as { template: string; message: string };
      const currentNodes = useFlowStore.getState().nodes;
      setActiveTab('designer');

      // If there's already a chatbot on the canvas, just navigate — don't rebuild
      if (currentNodes.length > 0) return;

      setQuickStartToast(`Building your ${template === 'minimal' ? 'chatbot' : 'agent'}…`);
      setTimeout(async () => {
        loadTemplateFromYaml(template);
        // Create the agent record in the database so it appears on the dashboard
        const tplName = template === 'minimal' ? 'Basic Chatbot' : template === 'lucid' ? 'Lucid Agent' : template === 'full' ? 'Full Agent' : 'Agent';
        await fetch('/v1/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tplName, description: '', system_prompt: '' }),
        });
        setAgentName(tplName);
        fetchAgents();
        setQuickStartToast(null);
        if (message) {
          window.dispatchEvent(new CustomEvent('vibeful:quick-start-done', { detail: { template, message } }));
        }
      }, 1800);
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
    window.addEventListener('vibeful:quick-start', onQuickStart);
    window.addEventListener('vibeful:test-agent', () => setTestModalOpen(true));
    window.addEventListener('vibeful:create-agent-modal', (e: Event) => {
      const defaults = (e as CustomEvent).detail || {};
      setCreateModalDefaults(defaults);
      setCreateModalOpen(true);
    });
    window.addEventListener('vibeful:styling-modal', (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setActiveTab('designer');
      setStylingModalOpen(true);
      // Delay to let StylingModal mount, then apply preset if specified
      if (detail.preset || detail.mode) {
        const preset = detail.preset || detail.mode;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('vibeful:styling-apply', { detail: { preset } }));
          if (detail.font) {
            window.dispatchEvent(new CustomEvent('vibeful:styling-apply', { detail: { font: detail.font } }));
          }
        }, 100);
      }
    });

    return () => {
      window.removeEventListener('vibeful:deploy', onDeploy);
      window.removeEventListener('vibeful:load-template', onLoadTemplate);
      window.removeEventListener('vibeful:navigate', onNavigate);
      window.removeEventListener('vibeful:configure-analysis', onConfigureAnalysis);
      window.removeEventListener('vibeful:quick-start', onQuickStart);
      window.removeEventListener('vibeful:test-agent', () => setTestModalOpen(true));
      window.removeEventListener('vibeful:create-agent-modal', () => {});
      window.removeEventListener('vibeful:styling-modal', () => {});
    };
  }, []);

  return (
    <ReactFlowProvider>
      <SetupWizard />
      <NodeTooltip />
      <div className="h-screen flex flex-col bg-slate-950">
        {/* Header */}
        <header className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-1">
            <h1 className="text-sm font-semibold text-slate-200 mr-2">Vibeful</h1>

            {/* Main */}
            {[
              { tab: 'dashboard' as const, label: 'Dashboard' },
            ].map((t) => (
              <button key={t.tab} onClick={() => setActiveTab(t.tab)}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === t.tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {t.label}
              </button>
            ))}
            <div className="w-px h-4 bg-slate-700 self-center" />

            {/* Dropdown groups */}
            {[
              { label: 'Manage', items: [
                { tab: 'agents' as const, label: 'Agents' },
                { tab: 'templates' as const, label: 'Templates' },
                { tab: 'contexts' as const, label: 'Knowledge' },
              ]},
              { label: 'Quality', items: [
                { tab: 'versions' as const, label: 'Versions' },
                { tab: 'abtest' as const, label: 'A/B Tests' },
                { tab: 'monitor' as const, label: 'Monitor' },
              ]},
              { label: 'Lucid', items: [
                { tab: 'glyphs' as const, label: 'Glyphs' },
                { tab: 'concepts' as const, label: 'Concepts' },
                { tab: 'memories' as const, label: 'Memories' },
                { tab: 'tokens' as const, label: 'Tokens' },
              ]},
            ].map((group) => (
              <div key={group.label} className="relative group">
                <button className="px-3 py-1 text-xs rounded text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1">
                  {group.label} <ChevronDown size={10} />
                </button>
                <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[140px] py-1">
                  {group.items.map((item) => (
                    <button key={item.tab} onClick={() => setActiveTab(item.tab)}
                      className={`block w-full text-left px-3 py-1.5 text-xs ${activeTab === item.tab ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="w-px h-5 bg-slate-700" />
            <button onClick={handleSave} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
              <Download size={12} /> Save
            </button>
            <button onClick={handleDeploy} className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">
              <Play size={12} /> Deploy
            </button>
            <button onClick={() => setTestModalOpen(true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
              <TestTube size={12} /> Test
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

        {/* Body + persistent AI Guide sidebar */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'dashboard' ? (
          <Dashboard
            onNavigate={setActiveTab}
            agents={agentList}
            contexts={contextList}
            onDelete={async (id) => {
                const name = agentList.find((a) => a.id === id)?.name;
                await fetch(`/v1/agents/${id}`, { method: 'DELETE' });
                fetchAgents();
                // Clear graph if the deleted agent was being edited
                if (name === agentName || agentList.length <= 1) {
                  loadGraph([], []);
                  setAgentName('');
                }
              }}
            onTest={() => setTestModalOpen(true)}
          />
        ) : activeTab === 'designer' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-8 bg-slate-900 border-b border-slate-700 flex items-center px-3 flex-shrink-0">
              <span className="text-xs text-slate-400 mr-2">Editing:</span>
              <select
                value={agentName}
                onChange={(e) => {
                  const name = e.target.value;
                  if (name === '__new') { setAgentName(''); loadGraph([], []); return; }
                  const match = agentList.find((a) => a.name === name);
                  if (match) {
                    setAgentName(match.name);
                    // Load agent's graph from config if available
                    const cfg = match.config_yaml;
                    if (cfg) {
                      try { const { nodes: ns, edges: es } = parseGraphFromYaml(cfg, nodeDefaults); loadGraph(ns, es); } catch {}
                    }
                  }
                }}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
              >
                <option value={agentName || ''}>{agentName || 'Unnamed Agent'}</option>
                <option disabled>──</option>
                {agentList.filter((a) => a.name !== agentName).map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
                <option disabled>──</option>
                <option value="__new">＋ New (blank canvas)</option>
              </select>
              <button onClick={() => setStylingModalOpen(true)} className="px-2 py-0.5 text-xs text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <Palette size={12} /> Styling
              </button>
            </div>
            <div className="flex-1 flex overflow-hidden relative">
              <NodePalette />
              <div className="flex-1 min-w-0 relative">
                <FlowCanvas />
                {stylingModalOpen && (
                  <StylingModal
                    onClose={() => setStylingModalOpen(false)}
                    onApply={(cfg) => {
                      setStylingModalOpen(false);
                      showToast('Styling applied — will be saved with your agent', 'success');
                    }}
                  />
                )}
                {quickStartToast && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-indigo-600/95 text-white rounded-xl shadow-2xl animate-pulse flex items-center gap-3 text-sm font-medium">
                  <Loader2 size={16} className="animate-spin" />
                  {quickStartToast}
                </div>
              )}
            </div>
            <div className={`
              overflow-hidden flex-shrink-0 bg-slate-900
              ${panelAnimating ? 'transition-all duration-300 ease-in-out' : ''}
              ${selectedNodeId ? 'w-72 opacity-100 border-l border-slate-700' : 'w-0 opacity-0 pointer-events-none'}
            `}>
              <PropertyPanel />
            </div>
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
          <AIAssistantPanel
            key={activeTab}
            agents={agentList}
            contexts={contextList}
            activeTab={activeTab}
            onNavigate={setActiveTab}
            onAgentsChanged={fetchAgents}
            onContextsChanged={fetchContexts}
          />
        </div>
      </div>
      <ToastContainer />
      {createModalOpen && (
        <CreateAgentModal
          defaultName={createModalDefaults.name}
          defaultTemplate={createModalDefaults.template}
          onConfirm={handleCreateAgent}
          onClose={() => setCreateModalOpen(false)}
        />
      )}
      {testModalOpen && (() => {
        // Extract system prompt from agent's graph nodes
        const spNode = nodes.find((n) => n.data.nodeType === 'builtin.system_prompt' || n.data.label?.toLowerCase().includes('system prompt'));
        const prompt = spNode?.data?.config?.prompt || spNode?.data?.config?.content || '';
        return <TestChatModal agentName={agentName || 'My Agent'} systemPrompt={prompt || undefined} onClose={() => setTestModalOpen(false)} />;
      })()}
    </ReactFlowProvider>
  );
}
