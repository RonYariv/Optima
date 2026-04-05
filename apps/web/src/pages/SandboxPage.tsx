import { useState, useRef, useEffect, useCallback } from 'react'
import { PROVIDER_DEFAULTS, type LLMProvider } from '@agent-optima/agentic'
import { tokenStore } from '../lib/token-store.js'

// ─── Config persistence ────────────────────────────────────────────────────────

const STORAGE_KEY = 'sandbox_config_v2'

interface SandboxConfig {
  provider: LLMProvider
  apiKey: string
  model: string
  baseUrl: string
  serverUrl: string
  controlApiUrl: string
}

function loadConfig(): SandboxConfig {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SandboxConfig
  } catch { /* ignore */ }
  return {
    provider: 'groq',
    apiKey: '',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    baseUrl: 'https://api.groq.com/openai/v1',
    serverUrl: 'http://localhost:8765',
    controlApiUrl: 'http://localhost:3001',
  }
}

function saveConfig(cfg: SandboxConfig) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AgentMeta {
  id: string
  name: string
  description: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DisplayMessage {
  role: 'user' | 'assistant' | 'error'
  content: string
}

type ServerStatus = 'checking' | 'online' | 'offline'

// ─── Static agent fallback ─────────────────────────────────────────────────────

const STATIC_AGENTS: AgentMeta[] = [
  { id: 'echo',             name: 'Echo Agent',         description: 'Repeats back what you say.' },
  { id: 'calculator',       name: 'Calculator Agent',   description: 'Solves math using a calculator tool.' },
  { id: 'optima-inspector', name: 'Optima Inspector',   description: 'Queries live traces, failures, and cost data.' },
  { id: 'research-bot',     name: 'Research Bot',       description: 'Uses mock web-search + summarizer.' },
  { id: 'full-demo',        name: 'Full Demo Agent',    description: 'All tools enabled.' },
]

// ─── Config panel ──────────────────────────────────────────────────────────────

function ConfigPanel({ config, onChange }: { config: SandboxConfig; onChange: (c: SandboxConfig) => void }) {
  const [open, setOpen] = useState(!config.apiKey)

  const setProvider = (provider: LLMProvider) => {
    const defaults = PROVIDER_DEFAULTS[provider]
    onChange({ ...config, provider, model: defaults.defaultModel, baseUrl: defaults.baseUrl })
  }

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-200 hover:bg-white/5 transition-colors"
      >
        <span>LLM Configuration</span>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {/* Provider */}
          <div className="flex flex-col gap-1 pt-3">
            <label className="text-xs text-slate-400">Provider</label>
            <div className="flex gap-2">
              {(['groq', 'openai', 'custom'] as LLMProvider[]).map(p => (
                <button key={p} onClick={() => setProvider(p)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${config.provider === p ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'}`}>
                  {p === 'groq' ? 'Groq' : p === 'openai' ? 'OpenAI' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">API Key</label>
            <input type="password" value={config.apiKey}
              onChange={e => onChange({ ...config, apiKey: e.target.value })}
              placeholder={config.provider === 'groq' ? 'gsk_...' : config.provider === 'openai' ? 'sk-...' : 'api-key'}
              className="w-full px-3 py-2 rounded text-sm text-slate-200 border outline-none focus:border-indigo-500 transition-colors"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }} />
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Model</label>
            <input type="text" value={config.model}
              onChange={e => onChange({ ...config, model: e.target.value })}
              placeholder={PROVIDER_DEFAULTS[config.provider].defaultModel || 'model-name'}
              className="w-full px-3 py-2 rounded text-sm text-slate-200 border outline-none focus:border-indigo-500 transition-colors"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }} />
            {config.provider === 'groq' && (
              <p className="text-[11px] text-slate-500">
                Recommended: <code className="text-slate-400">meta-llama/llama-4-scout-17b-16e-instruct</code> (best tool use on Groq).
              </p>
            )}
          </div>

          {/* Base URL (custom only) */}
          {config.provider === 'custom' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Base URL</label>
              <input type="text" value={config.baseUrl}
                onChange={e => onChange({ ...config, baseUrl: e.target.value })}
                placeholder="https://your-llm-endpoint/v1"
                className="w-full px-3 py-2 rounded text-sm text-slate-200 border outline-none focus:border-indigo-500 transition-colors"
                style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }} />
            </div>
          )}

          {/* Sandbox server section */}
          <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs text-slate-400 font-medium mb-2">Sandbox Server</p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Server URL</label>
                <input type="text" value={config.serverUrl}
                  onChange={e => onChange({ ...config, serverUrl: e.target.value.replace(/\/$/, '') })}
                  placeholder="http://localhost:8765"
                  className="w-full px-3 py-2 rounded text-sm text-slate-200 border outline-none focus:border-indigo-500 transition-colors"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Optima Control API</label>
                <input type="text" value={config.controlApiUrl}
                  onChange={e => onChange({ ...config, controlApiUrl: e.target.value.replace(/\/$/, '') })}
                  placeholder="http://localhost:3001"
                  className="w-full px-3 py-2 rounded text-sm text-slate-200 border outline-none focus:border-indigo-500 transition-colors"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Start: <code className="text-slate-400">cd sandbox/python && uvicorn server:app --port 8765 --reload</code>
            </p>
          </div>

          <p className="text-xs text-slate-500">API keys stored in <code>localStorage</code> — dev only.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [config, setConfig] = useState<SandboxConfig>(loadConfig)
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking')
  const [agents, setAgents] = useState<AgentMeta[]>(STATIC_AGENTS)
  const [selectedAgentId, setSelectedAgentId] = useState(STATIC_AGENTS[0]!.id)
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([])
  const [serverHistory, setServerHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { saveConfig(config) }, [config])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [displayMessages])

  const pingServer = useCallback(async (serverUrl: string) => {
    setServerStatus('checking')
    try {
      const [healthRes, agentsRes] = await Promise.all([
        fetch(`${serverUrl}/healthz`, { signal: AbortSignal.timeout(3000) }),
        fetch(`${serverUrl}/v1/agents`, { signal: AbortSignal.timeout(3000) }),
      ])
      if (healthRes.ok && agentsRes.ok) {
        const list = await agentsRes.json() as AgentMeta[]
        setAgents(list)
        setServerStatus('online')
      } else {
        setServerStatus('offline')
      }
    } catch {
      setServerStatus('offline')
      setAgents(STATIC_AGENTS)
    }
  }, [])

  useEffect(() => { void pingServer(config.serverUrl) }, [config.serverUrl, pingServer])

  const handleAgentChange = (id: string) => {
    setSelectedAgentId(id)
    setDisplayMessages([])
    setServerHistory([])
  }

  const configValid = config.apiKey.trim().length > 0 && config.model.trim().length > 0

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !configValid || serverStatus !== 'online') return

    const historyWithUser = [...serverHistory, { role: 'user' as const, content: text }]

    setInput('')
    setDisplayMessages(prev => [...prev, { role: 'user', content: text }])
    setLoading(true)

    try {
      const res = await fetch(`${config.serverUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          messages: historyWithUser,
          llm_config: { api_key: config.apiKey, model: config.model, base_url: config.baseUrl },
          optima_config: { control_api_url: config.controlApiUrl, token: tokenStore.get() },
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Server ${res.status}: ${err}`)
      }

      const data = await res.json() as { text: string; messages: ChatMessage[] }
      setServerHistory(data.messages)
      setDisplayMessages(prev => [...prev, { role: 'assistant', content: data.text }])
    } catch (e) {
      setDisplayMessages(prev => [...prev, { role: 'error', content: e instanceof Error ? e.message : String(e) }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, configValid, serverStatus, serverHistory, selectedAgentId, config])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  const selectedAgent = agents.find(a => a.id === selectedAgentId)
  const canSend = configValid && serverStatus === 'online' && !loading && input.trim().length > 0

  return (
    <div className="flex flex-col gap-4 h-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white">Sandbox</h1>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">dev only</span>
        <div className={`flex items-center gap-1.5 text-xs ml-auto ${serverStatus === 'online' ? 'text-emerald-400' : serverStatus === 'offline' ? 'text-red-400' : 'text-slate-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'online' ? 'bg-emerald-400' : serverStatus === 'offline' ? 'bg-red-400' : 'bg-slate-500 animate-pulse'}`} />
          {serverStatus === 'online' ? 'Server online' : serverStatus === 'offline' ? 'Server offline' : 'Connecting…'}
          {serverStatus !== 'online' && (
            <button onClick={() => void pingServer(config.serverUrl)} className="ml-1 underline hover:text-slate-200">retry</button>
          )}
        </div>
      </div>

      {/* Offline banner */}
      {serverStatus === 'offline' && (
        <div className="px-4 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs font-mono">
          Start the sandbox server: <strong>cd sandbox/python && uvicorn server:app --port 8765 --reload</strong>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-4">
          <div className="rounded-lg border p-4 flex flex-col gap-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Agent <span className="text-slate-600 normal-case font-normal">(MS Agent Framework)</span>
            </p>
            {agents.map(agent => (
              <button key={agent.id} onClick={() => handleAgentChange(agent.id)}
                className={`text-left px-3 py-2.5 rounded-md border transition-colors ${selectedAgentId === agent.id ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{agent.description}</p>
              </button>
            ))}
          </div>
          <ConfigPanel config={config} onChange={setConfig} />
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col rounded-lg border overflow-hidden min-h-0" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {displayMessages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                {serverStatus === 'offline' ? 'Start the sandbox server to chat.' :
                 !configValid ? 'Configure your LLM API key on the left.' :
                 `Chat with ${selectedAgent?.name ?? 'agent'} — powered by MS Agent Framework`}
              </div>
            )}
            {displayMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' :
                    msg.role === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-sm font-mono text-xs' :
                    'text-slate-200 border rounded-bl-sm'
                  }`}
                  style={msg.role === 'assistant' ? { backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' } : undefined}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl rounded-bl-sm border text-slate-500 text-sm animate-pulse"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t p-3 flex gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <textarea rows={1} value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              disabled={loading || serverStatus !== 'online' || !configValid}
              placeholder={serverStatus === 'offline' ? 'Sandbox server offline…' : !configValid ? 'Set your API key first…' : 'Message (Enter to send)'}
              className="flex-1 px-3 py-2 rounded-lg text-sm text-slate-200 border outline-none focus:border-indigo-500 resize-none transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }} />
            <button onClick={() => void send()} disabled={!canSend}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
