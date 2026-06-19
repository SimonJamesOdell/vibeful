import { useState, useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from './components/FlowCanvas';
import NodePalette from './components/NodePalette';
import PropertyPanel from './components/PropertyPanel';
import CodePreview from './components/CodePreview';
import { useFlowStore } from './lib/flowStore';
import { generateYaml, parseGraphFromYaml } from './lib/yamlGenerator';
import { Play, Save, FolderOpen, FilePlus, PanelLeft, PanelRight, Download } from 'lucide-react';
import AIAssistantPanel from './components/AIAssistantPanel';
import VersionHistory from './components/VersionHistory';
import ABTestDashboard from './components/ABTestDashboard';
import RegressionMonitor from './components/RegressionMonitor';
import ProposalCard from './components/ProposalCard';
import GlyphManager from './components/GlyphManager';
import ConceptBrowser from './components/ConceptBrowser';
import GlobalMemoryExplorer from './components/GlobalMemoryExplorer';
import TokenDashboard from './components/TokenDashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<'designer' | 'templates' | 'versions' | 'proposals' | 'abtest' | 'monitor' | 'glyphs' | 'concepts' | 'memories' | 'tokens'>('designer');
  const {
    nodes, edges,
    agentName, setAgentName,
    agentDescription, setAgentDescription,
    codePreviewVisible, toggleCodePreview,
    propertiesVisible, toggleProperties,
    loadGraph, clearGraph,
  } = useFlowStore();

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
      const validTabs = ['designer', 'templates', 'versions', 'proposals', 'abtest', 'monitor', 'glyphs', 'concepts', 'memories', 'tokens'];
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
      <div className="h-screen flex flex-col bg-slate-950">
        {/* Header */}
        <header className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-slate-200">Vibeful Console</h1>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('designer')}
                className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'designer' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Designer
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
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent name…"
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 w-40 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={toggleProperties}
              className={`p-1.5 rounded transition-colors ${propertiesVisible ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
              title="Toggle properties"
            >
              <PanelRight size={14} />
            </button>
            <button
              onClick={toggleCodePreview}
              className={`p-1.5 rounded transition-colors ${codePreviewVisible ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
              title="Toggle YAML preview"
            >
              <PanelLeft size={14} />
            </button>
            <div className="w-px h-5 bg-slate-700" />
            <button onClick={handleSave} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
              <Download size={12} /> Save
            </button>
            <button onClick={handleDeploy} className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">
              <Play size={12} /> Deploy
            </button>
          </div>
        </header>

        {/* Body */}
        {activeTab === 'designer' ? (
          <div className="flex-1 flex overflow-hidden">
            <NodePalette />
            <FlowCanvas />
            {propertiesVisible && <PropertyPanel />}
            {codePreviewVisible && <CodePreview />}
          </div>
        ) : activeTab === 'versions' ? (
          <div className="flex-1 overflow-y-auto">
            <VersionHistory />
          </div>
        ) : activeTab === 'proposals' ? (
          <div className="flex-1 overflow-y-auto">
            <ProposalCard />
          </div>
        ) : activeTab === 'abtest' ? (
          <div className="flex-1 overflow-y-auto">
            <ABTestDashboard />
          </div>
        ) : activeTab === 'monitor' ? (
          <div className="flex-1 overflow-y-auto">
            <RegressionMonitor />
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
        ) : activeTab === 'tokens' ? (
          <div className="flex-1 overflow-y-auto">
            <TokenDashboard />
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
                  onClick={() => loadTemplateFromYaml(tpl.name)}
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
      <AIAssistantPanel />
    </ReactFlowProvider>
  );
}
