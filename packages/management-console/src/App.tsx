import { useState, useEffect, useRef, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from './components/FlowCanvas';
import NodePalette from './components/NodePalette';
import PropertyPanel from './components/PropertyPanel';
import { useFlowStore } from './lib/flowStore';
import { generateYaml, parseGraphFromYaml } from './lib/yamlGenerator';
import { TEMPLATES } from './lib/templates';
import { Play, Save, FolderOpen, FilePlus, Download, Loader2, ChevronDown, TestTube, Palette, BookOpen, Smile, Server, FileText, Shield } from 'lucide-react';
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
import TourOverlay from './components/TourOverlay';
import AgentList from './components/AgentList';
import ContextManager from './components/ContextManager';
import Dashboard from './components/Dashboard';
import CreateAgentModal from './components/CreateAgentModal';
import StylingModal, { loadAgentStyling, applyStylingToDOM } from './components/StylingModal';
import KnowledgeAttachModal from './components/KnowledgeAttachModal';
import PersonalityModal from './components/PersonalityModal';
import McpAttachModal from './components/McpAttachModal';
import McpServers from './components/McpServers';
import GuardrailsModal from './components/GuardrailsModal';
import PageList from './components/PageList';
import PageEditorModal from './components/PageEditorModal';
import PageViewer from './components/PageViewer';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import McpCatalog from './components/McpCatalog';

type TabName = 'dashboard' | 'analytics' | 'designer' | 'agents' | 'templates' | 'versions' | 'proposals' | 'abtest' | 'monitor' | 'glyphs' | 'concepts' | 'memories' | 'tokens' | 'contexts' | 'mcp' | 'pages';
const VALID_TABS: readonly TabName[] = ['dashboard', 'analytics', 'designer', 'agents', 'templates', 'versions', 'proposals', 'abtest', 'monitor', 'glyphs', 'concepts', 'memories', 'tokens', 'contexts', 'mcp', 'pages'];

function tabFromHash(): TabName {
  const raw = window.location.hash.replace(/^#/, '');
  return (VALID_TABS as readonly string[]).includes(raw) ? raw as TabName : 'dashboard';
}

export default function App() {
  const [activeTab, setActiveTabInternal] = useState<TabName>(tabFromHash);

  // Wrapper that syncs state → URL hash (but NOT on popstate — that's read-only)
  const navigateTo = (tab: TabName) => {
    setActiveTabInternal(tab);
    const hash = `#${tab}`;
    if (window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }
  };

  // Listen for browser back/forward — sync hash → state
  useEffect(() => {
    const onPop = () => setActiveTabInternal(tabFromHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentList, setAgentList] = useState<Array<{ id: string; name: string; config_yaml?: string }>>([]);
  const [contextList, setContextList] = useState<Array<{ id: string; name: string }>>([]);
  const [mcpServerList, setMcpServerList] = useState<Array<{ id: string; name: string; url: string }>>([]);

  const fetchAgents = () => {
    fetch('/v1/agents')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.agents || [];
        list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        setAgentList(list);
      })
      .catch(() => {});
  };
  const fetchContexts = () => {
    fetch('/v1/contexts')
      .then((r) => r.json())
      .then((data) => setContextList(Array.isArray(data) ? data : []))
      .catch(() => {});
  };
  const fetchMcpServers = () => {
    fetch('/v1/mcp-servers')
      .then((r) => r.json())
      .then((data) => setMcpServerList(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  // Fetch agent and context lists
  useEffect(() => { fetchAgents(); fetchContexts(); fetchMcpServers(); }, []);

  // ── Auto-save: persist graph changes to the database ──────
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false); // true when user has made changes since last save

  const autoSave = () => {
    if (!activeAgentId) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      const state = useFlowStore.getState();
      const yaml = generateYaml(state.nodes, state.edges, state.agentName, state.agentDescription);
      try {
        await fetch(`/v1/agents/${activeAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: state.agentName, description: state.agentDescription, config_yaml: yaml }),
        });
        dirtyRef.current = false;
      } catch { /* silent — save is best-effort */ }
    }, 1500);
  };

  // Save immediately before switching agents (don't wait for debounce)
  const saveNow = async () => {
    if (!activeAgentId) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    const state = useFlowStore.getState();
    const yaml = generateYaml(state.nodes, state.edges, state.agentName, state.agentDescription);
    try {
      await fetch(`/v1/agents/${activeAgentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: state.agentName, description: state.agentDescription, config_yaml: yaml }),
      });
      dirtyRef.current = false;
    } catch { /* silent */ }
  };

  const switchToAgent = async (agentId: string) => {
    // Save current agent's state before switching away
    await saveNow();

    try {
      const resp = await fetch(`/v1/agents/${agentId}`);
      if (!resp.ok) {
        showToast(`Agent not found (${resp.status})`, 'error');
        return;
      }
      const data = await resp.json();
      const parsed = parseGraphFromYaml(data);
      if (parsed) {
        loadGraph(parsed.nodes as any, parsed.edges);
      } else {
        // Agent has no YAML config (e.g., created via AI assistant).
        // Start with a clean canvas but preserve agent metadata.
        clearGraph();
        // Don't silently fail — notify the user
        if (!data.config_json && !(data as any).config_yaml) {
          showToast('Agent has no visual config — showing blank canvas', 'info');
        }
      }
      setAgentName(data.name || '');
      setAgentDescription(data.description || '');
    } catch (err: any) {
      showToast(`Failed to load agent: ${err.message}`, 'error');
      return;
    }
    setActiveAgentId(agentId);
    navigateTo('designer');
    dirtyRef.current = false; // suppress auto-save on freshly loaded agent

    // Reapply persisted styling for this agent (from database)
    try {
      const resp2 = await fetch(`/v1/agents/${agentId}`);
      if (resp2.ok) {
        const agentData = await resp2.json();
        const savedPreset = loadAgentStyling(agentData);
        if (savedPreset) applyStylingToDOM(savedPreset);
      }
    } catch { /* styling is best-effort */ }
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

  // ── Auto-save: persist graph changes to the database ──────
  // Must be AFTER useFlowStore() destructuring (temporal dead zone).
  // Only saves when dirtyRef is true — skips the initial load after switchToAgent.
  useEffect(() => {
    if (!activeAgentId || nodes.length === 0) return;
    if (!dirtyRef.current) { dirtyRef.current = true; return; }
    autoSave();
  }, [nodes, edges, agentName, agentDescription]);

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
    // Check for name conflict before deploying
    if (agentList.some((a) => a.name === agentName)) {
      showToast(`An agent named "${agentName}" already exists. Choose a unique name.`, 'error');
      return;
    }
    const yaml = generateYaml(nodes, edges, agentName, agentDescription);
    try {
      const resp = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agentName, description: agentDescription, config_yaml: yaml }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setActiveAgentId(data.id);
        fetchAgents();
        showToast(`Agent "${agentName}" deployed — ID: ${data.id.slice(0, 8)}…`, 'success');
      } else {
        showToast(`Deploy failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Deploy error: ${err.message}`, 'error');
    }
  };

  const handleCreateAgent = async (name: string, templateKey: string) => {
    setActiveModal(null);

    // Get the template from shared TEMPLATES to generate a YAML config.
    // The YAML is what makes the agent reloadable after navigation.
    const tplName = templateKey;
    const localTemplates: Record<string, { nodes: any[]; edges: any[]; name: string }> = {
      minimal: { name: 'Minimal Agent', nodes: [], edges: [] },
      full: { name: 'Full Agent', nodes: [], edges: [] },
      lucid: { name: 'Lucid Analysis Agent', nodes: [], edges: [] },
    };
    // Use TEMPLATES from lib if available, fall back to local
    const source = (TEMPLATES as any)[templateKey] || localTemplates[templateKey];
    const yaml = source ? generateYaml(source.nodes, source.edges, name, '') : '';

    // Create in DB with config_yaml so it survives reloads
    const resp = await fetch('/v1/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: '', system_prompt: '', config_yaml: yaml }),
    });
    if (!resp.ok) {
      showToast('Failed to create agent', 'error');
      return;
    }
    const data = await resp.json();
    setActiveAgentId(data.id);
    fetchAgents();
    setAgentName(name);
    // Clear old graph immediately so previous agent's nodes don't flicker
    clearGraph();
    // Load template into canvas
    navigateTo('designer');
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
    // Use shared TEMPLATES from lib — single source of truth.
    // Try exact key first, then name match, fall back to minimal.
    const template = (TEMPLATES as any)[yamlText]
      || Object.values(TEMPLATES).find((t) => yamlText.includes(t.name))
      || TEMPLATES.minimal;

    loadGraph([...template.nodes], [...template.edges]);
    // Only set the name from the template if no agent name is already set
    // (avoids overwriting user-chosen names when called from handleCreateAgent)
    const state = useFlowStore.getState();
    if (!state.agentName || state.agentName === 'Untitled Agent') {
      setAgentName(template.name);
    }
  };

  // ── Quick-start toast state ──────────────────────────────────
  const [quickStartToast, setQuickStartToast] = useState<string | null>(null);
  // Single modal state — opening any modal closes all others
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [createModalDefaults, setCreateModalDefaults] = useState<{ name?: string; template?: string }>({});
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const stylingPresetRef = useRef<string | undefined>(undefined);
  const stylingFontRef = useRef<string | undefined>(undefined);

  // Auto-close styling modal when navigating away from editor
  useEffect(() => {
    if (activeTab !== 'designer') setActiveModal(null);
  }, [activeTab]);

  // ── Vibeful Guide event handlers ────────────────────────────
  useEffect(() => {
    const onDeploy = () => { handleDeploy(); };
    const onLoadTemplate = (e: Event) => {
      loadTemplateFromYaml((e as CustomEvent).detail);
    };

    // Quick-start flow: navigate to designer, load template, show toast, trigger AI.
    // Only creates a new agent on a genuinely empty canvas — never overwrites an existing agent.
    const onQuickStart = (e: Event) => {
      const { template, message } = (e as CustomEvent).detail as { template: string; message: string };
      const state = useFlowStore.getState();
      const currentNodes = state.nodes;
      const hasAgent = !!activeAgentId;

      navigateTo('designer');

      // If there's already an active agent or nodes on the canvas, just navigate — don't rebuild
      if (hasAgent || currentNodes.length > 0) return;

      setQuickStartToast(`Building your ${template === 'minimal' ? 'chatbot' : 'agent'}…`);
      setTimeout(async () => {
        loadTemplateFromYaml(template);
        // Create the agent record in the database so it appears on the dashboard.
        // Store the current graph as config_yaml so the agent is reloadable.
        const { nodes: ns, edges: es, agentName: an, agentDescription: ad } = useFlowStore.getState();
        const yaml = generateYaml(ns, es, an || 'Untitled Agent', ad || '');
        const tplName = template === 'minimal' ? 'Basic Chatbot' : template === 'lucid' ? 'Lucid Agent' : template === 'full' ? 'Full Agent' : 'Agent';
        const resp = await fetch('/v1/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tplName, description: '', system_prompt: '', config_yaml: yaml }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setActiveAgentId(data.id);
        }
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
      const validTabs = ['dashboard', 'designer', 'agents', 'templates', 'versions', 'proposals', 'abtest', 'monitor', 'glyphs', 'concepts', 'memories', 'tokens', 'contexts', 'mcp', 'pages'];
      if (validTabs.includes(tab)) navigateTo(tab as TabName);
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
    window.addEventListener('vibeful:test-agent', () => setActiveModal('test'));
    window.addEventListener('vibeful:open-knowledge', () => setActiveModal('knowledge'));
    window.addEventListener('vibeful:create-agent-modal', (e: Event) => {
      const defaults = (e as CustomEvent).detail || {};
      setCreateModalDefaults(defaults);
      setActiveModal('create');
    });
    window.addEventListener('vibeful:styling-modal', (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      // Scan all values for known preset names (param-name agnostic)
      const KNOWN_PRESETS = ['light', 'dark', 'default', 'brand'];
      let preset: string | undefined;
      let font: string | undefined;
      if (detail && typeof detail === 'object') {
        for (const [k, v] of Object.entries(detail)) {
          if (typeof v !== 'string' || !v.trim()) continue;
          const norm = v.toLowerCase().trim().replace(/\s+(mode|theme|preset|style)$/, '');
          if (KNOWN_PRESETS.includes(norm)) { preset = v; continue; }
          if (k === 'font' || k === 'fontFamily') { font = v; }
        }
      }
      if (!preset) preset = detail.preset || detail.mode || detail.theme || undefined;
      if (!font) font = detail.font || undefined;
      console.log('[App:styling-modal] preset:', preset, 'font:', font, 'detail:', JSON.stringify(detail));
      stylingPresetRef.current = preset;
      stylingFontRef.current = font;
      navigateTo('designer');
      setActiveModal('styling');
      // Re-dispatch so the StylingModal catches it after mount
      setTimeout(() => {
        console.log('[App:styling-apply re-dispatch] preset:', preset, 'font:', font);
        window.dispatchEvent(new CustomEvent('vibeful:styling-apply', { detail: { preset, font } }));
      }, 50);
    });
    window.addEventListener('vibeful:guardrails-modal', () => {
      navigateTo('designer');
      setActiveModal('guardrails');
    });

    return () => {
      window.removeEventListener('vibeful:deploy', onDeploy);
      window.removeEventListener('vibeful:load-template', onLoadTemplate);
      window.removeEventListener('vibeful:navigate', onNavigate);
      window.removeEventListener('vibeful:configure-analysis', onConfigureAnalysis);
      window.removeEventListener('vibeful:quick-start', onQuickStart);
      window.removeEventListener('vibeful:test-agent', () => setActiveModal('test'));
      window.removeEventListener('vibeful:open-knowledge', () => setActiveModal('knowledge'));
      window.removeEventListener('vibeful:create-agent-modal', () => {});
      window.removeEventListener('vibeful:styling-modal', () => {});
      window.removeEventListener('vibeful:guardrails-modal', () => {});
    };
  }, []);

  // ── Page viewer route: /#/p/:slug renders the published page ──
  const pageSlug = (() => {
    const raw = window.location.hash.replace(/^#/, '');
    const match = raw.match(/^\/p\/(.+)/);
    return match ? match[1] : null;
  })();

  if (pageSlug) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="h-12 bg-slate-900 border-b border-slate-700 flex items-center px-4 flex-shrink-0">
          <h1 className="text-sm font-semibold text-slate-200">Vibeful</h1>
          <span className="text-xs text-slate-600 ml-3">— Published Page</span>
          <a href="#dashboard" className="ml-auto text-xs text-slate-500 hover:text-slate-300">← Console</a>
        </div>
        <PageViewer slug={pageSlug} />
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <SetupWizard />
      <NodeTooltip />
      <TourOverlay />
      <div className="h-screen flex flex-col bg-slate-950">
        {/* Header */}
        <header className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-1">
            <h1 className="text-sm font-semibold text-slate-200 mr-2">Vibeful</h1>

            {/* Main tabs */}
            {[
              { tab: 'dashboard' as const, label: 'Dashboard' },
              { tab: 'analytics' as const, label: 'Analytics' },
              { tab: 'agents' as const, label: 'Agents' },
              { tab: 'contexts' as const, label: 'Knowledge' },
              { tab: 'mcp' as const, label: 'MCP' },
              { tab: 'pages' as const, label: 'Pages' },
            ].map((t) => (
              <button key={t.tab} onClick={() => navigateTo(t.tab)}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === t.tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
          </div>
        </header>

        {/* Body + persistent AI Guide sidebar */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'analytics' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">Analytics</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Platform overview — agents, pages, knowledge bases, and more
                  </p>
                </div>
              </div>
              <AnalyticsDashboard activeAgentId={activeAgentId} />
            </div>
          </div>
        ) : activeTab === 'dashboard' ? (
          <Dashboard
            onNavigate={(tab: string) => navigateTo(tab as TabName)}
            agents={agentList}
            contexts={contextList}
            mcpServers={mcpServerList}
            onSelectAgent={switchToAgent}
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
             onTest={() => setActiveModal('test')}
            onRename={async (id, name) => {
              try {
                const resp = await fetch(`/v1/agents/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name }),
                });
                if (resp.status === 409) {
                  const data = await resp.json();
                  showToast(data.detail || `An agent named "${name}" already exists.`, 'error');
                  return false;
                }
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                fetchAgents();
                showToast(`Renamed to "${name}"`, 'success');
                return true;
              } catch (e: any) {
                showToast(`Rename failed: ${e.message}`, 'error');
                return false;
              }
            }}
          />
        ) : activeTab === 'designer' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-8 bg-slate-900 border-b border-slate-700 flex items-center px-3 flex-shrink-0">
              <span className="text-xs text-slate-400 mr-2">Editing:</span>
              {(() => {
                // Stable options list — only recomputes when agentList or activeAgentId changes
                const nameCount: Record<string, number> = {};
                for (const a of agentList) nameCount[a.name] = (nameCount[a.name] || 0) + 1;
                const otherAgents = agentList
                  .filter((a) => a.id !== activeAgentId)
                  .map((a) => ({
                    ...a,
                    label: nameCount[a.name] > 1 ? `${a.name} (…${a.id.slice(0, 8)})` : a.name,
                  }));

                return (
              <select
                value={activeAgentId || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id === '__new') { window.dispatchEvent(new CustomEvent('vibeful:create-agent-modal', { detail: { template: 'minimal' } })); e.target.value = activeAgentId || ''; return; }
                  if (id && id !== activeAgentId) switchToAgent(id);
                }}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500"
              >
                {activeAgentId ? (
                  <option value={activeAgentId}>{agentName || 'Unnamed Agent'}</option>
                ) : (
                  <option value="">(select agent)</option>
                )}
                {otherAgents.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
                <option value="__new">＋ Create New</option>
              </select>
                );
              })()}
              <button onClick={() => setActiveModal('styling')} className="px-2 py-0.5 text-xs text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <Palette size={12} /> Styling
              </button>
              <button onClick={() => setActiveModal('knowledge')} className="px-2 py-0.5 text-xs text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <BookOpen size={12} /> Knowledge
              </button>
              <button onClick={() => setActiveModal('personality')} className="px-2 py-0.5 text-xs text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <Smile size={12} /> Personality
              </button>
              <button onClick={() => setActiveModal('mcp')} className="px-2 py-0.5 text-xs text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <Server size={12} /> MCP
              </button>
              <button onClick={() => setActiveModal('guardrails')} className="px-2 py-0.5 text-xs text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <Shield size={12} /> Guardrails
              </button>
              <button onClick={() => setActiveModal('test')} className="px-2 py-0.5 text-xs text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors flex items-center gap-1">
                <TestTube size={12} /> Test
              </button>
            </div>
            <div className="flex-1 flex overflow-hidden relative">
              <div className="relative h-full">
                <NodePalette />
                {(activeModal === 'personality' || activeModal === 'styling' || activeModal === 'knowledge' || activeModal === 'mcp' || activeModal === 'guardrails' || activeModal === 'page-editor') && (
                  <div className="absolute inset-0 bg-slate-950/80 z-50 rounded" />
                )}
              </div>
              <div className="flex-1 min-w-0 relative">
                <FlowCanvas />
                 {activeModal === 'styling' && (
                   <StylingModal
                     agentId={activeAgentId}
                     initialPreset={stylingPresetRef.current}
                     initialFont={stylingFontRef.current}
                     onClose={() => { setActiveModal(null); stylingPresetRef.current = undefined; stylingFontRef.current = undefined; }}
                   />
                 )}
                  {activeModal === 'personality' && (
                    <PersonalityModal
                      agentId={activeAgentId}
                      onClose={() => setActiveModal(null)}
                    />
                  )}
                  {activeModal === 'knowledge' && (
                    <KnowledgeAttachModal
                      activeAgentId={activeAgentId}
                      contextList={contextList}
                      onClose={() => setActiveModal(null)}
                      onNavigate={(tab: string) => navigateTo(tab as TabName)}
                      onRefresh={fetchContexts}
                    />
                  )}
                  {activeModal === 'mcp' && (
                    <McpAttachModal
                      activeAgentId={activeAgentId}
                      mcpServers={mcpServerList}
                      onClose={() => setActiveModal(null)}
                      onNavigate={(tab: string) => navigateTo(tab as TabName)}
                      onRefresh={fetchMcpServers}
                    />
                  )}
                  {activeModal === 'guardrails' && (
                    <GuardrailsModal
                      agentId={activeAgentId}
                      onClose={() => setActiveModal(null)}
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
            <AgentList onSelect={(id) => { setActiveAgentId(id); navigateTo('designer'); }} />
          </div>
        ) : activeTab === 'tokens' ? (
          <div className="flex-1 overflow-y-auto">
            <TokenDashboard />
          </div>
        ) : activeTab === 'contexts' ? (
          <div className="flex-1 overflow-y-auto">
            <ContextManager />
          </div>
        ) : activeTab === 'mcp' ? (
          <div className="flex-1 overflow-y-auto">
            <McpServers />
            <div className="p-6 max-w-4xl mx-auto border-t border-slate-800 mt-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-300">Server Catalog</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Browse and install pre-built MCP servers</p>
                </div>
              </div>
              <McpCatalog
                installedIds={mcpServerList.map((s) => s.id)}
                onInstall={async (srv) => {
                  await fetch('/v1/mcp-servers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: srv.id, name: srv.name, url: srv.url, transport: 'http' }),
                  });
                }}
                onRefresh={fetchMcpServers}
              />
            </div>
          </div>
        ) : activeTab === 'pages' ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">Pages</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Build standalone pages for your agents — landing pages, dashboards, forms, and more
                  </p>
                </div>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('vibeful:create-agent-modal', { detail: {} }))}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors"
                >
                  <FileText size={14} />
                  New Page
                </button>
              </div>
              <PageList activeAgentId={activeAgentId} onEdit={(id) => { setEditingPageId(id); setActiveModal('page-editor'); }} />
            </div>
            {activeModal === 'page-editor' && editingPageId && (
              <PageEditorModal
                pageId={editingPageId}
                onClose={() => { setActiveModal(null); setEditingPageId(null); }}
                onSaved={() => {}}
              />
            )}
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
                  onClick={() => { loadTemplateFromYaml(tpl.name); navigateTo('designer'); }}
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
            agents={agentList}
            contexts={contextList}
            activeTab={activeTab}
            activeAgentId={activeAgentId}
            onNavigate={(tab: string) => navigateTo(tab as TabName)}
            onAgentsChanged={fetchAgents}
            onContextsChanged={fetchContexts}
          />
        </div>
      </div>
      <ToastContainer />
      {activeModal === 'create' && (
        <CreateAgentModal
          defaultName={createModalDefaults.name}
          defaultTemplate={createModalDefaults.template}
          onConfirm={handleCreateAgent}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'test' && (
        <TestChatModal agentId={activeAgentId} agentName={agentName || 'My Agent'} onClose={() => setActiveModal(null)} />
      )}

    </ReactFlowProvider>
  );
}
