import { useMemo } from 'react';
import { Network } from 'lucide-react';
import { ROLE_TITLES } from './roles';
import type { AgentRole, ProjectSnapshot, Task } from '../../../../shared/types';

const W = 980;
const NODE_W = 200;
const NODE_H = 66;
const PER_ROW = 3;
const ROW_GAP = 116;
const TOP = 52;

type NodeState = 'working' | 'failed' | 'blocked' | 'review' | 'idle' | 'absent';

const STATE_STYLE: Record<NodeState, { stroke: string; label: string }> = {
  working: { stroke: '#818cf8', label: 'Working' },
  failed: { stroke: '#fb7185', label: 'Failed' },
  blocked: { stroke: '#fbbf24', label: 'Blocked' },
  review: { stroke: '#a78bfa', label: 'In review' },
  idle: { stroke: '#30363d', label: 'Idle' },
  absent: { stroke: '#30363d', label: 'Not on team' },
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

interface MapNode { role: AgentRole; x: number; y: number; state: NodeState; current?: Task; assigned: number; onTeam: boolean }

/**
 * Agent mission map. Everything drawn comes from the snapshot:
 * - one node per team member (plus roles that have tasks but are not on the team, dashed);
 * - a solid line from the leader to each agent that has assigned tasks (label = task count);
 * - dashed curves for persisted handoff messages (activity type "agent.handoff"), with counts.
 * Tasks run sequentially in planner order; there is no dependency graph to draw.
 */
export function MissionMap({ s }: { s: ProjectSnapshot }) {
  const { nodes, handoffs } = useMemo(() => {
    const roles: AgentRole[] = [...s.agents.map((a) => a.role)];
    for (const t of s.tasks) if (!roles.includes(t.role)) roles.push(t.role);
    const nodes: MapNode[] = roles.map((role, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, roles.length - row * PER_ROW);
      const col = i % PER_ROW;
      const gap = (W - inRow * NODE_W) / (inRow + 1);
      const x = gap + NODE_W / 2 + col * (NODE_W + gap);
      const y = TOP + 40 + ROW_GAP * (row + 1) - 20;
      const mine = s.tasks.filter((t) => t.role === role);
      const onTeam = s.agents.some((a) => a.role === role);
      const working = mine.find((t) => t.status === 'IN_PROGRESS');
      const state: NodeState = !onTeam ? 'absent'
        : working ? 'working'
        : mine.some((t) => t.status === 'FAILED' && !t.blockedReason) ? 'failed'
        : mine.some((t) => t.status === 'BLOCKED') ? 'blocked'
        : mine.some((t) => t.status === 'REVIEW') ? 'review' : 'idle';
      const lastRun = s.runs.filter((r) => r.role === role).at(-1);
      const current = working ?? (lastRun ? s.tasks.find((t) => t.id === lastRun.taskId) : undefined);
      return { role, x, y, state, current, assigned: mine.length, onTeam };
    });

    const taskRole = new Map(s.tasks.map((t) => [t.id, t.role]));
    const counts = new Map<string, number>();
    for (const e of s.activity) {
      if (e.type !== 'agent.handoff' || !e.data) continue;
      const from = taskRole.get(String(e.data.fromTaskId));
      const to = e.data.toRole as AgentRole | undefined;
      if (!from || !to) continue;
      const k = `${from}>${to}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const handoffs = [...counts].map(([k, n]) => { const [from, to] = k.split('>') as [AgentRole, AgentRole]; return { from, to, n }; });
    return { nodes, handoffs };
  }, [s]);

  const byRole = new Map(nodes.map((n) => [n.role, n]));
  const rows = Math.max(1, Math.ceil(nodes.length / PER_ROW));
  const H = TOP + 40 + ROW_GAP * rows + 76; // room below the last row for same-row handoff arcs
  const leader = { x: W / 2, y: TOP };
  const working = nodes.filter((n) => n.state === 'working');
  const summary = nodes.length === 0
    ? 'No agents on the team yet.'
    : `${nodes.length} agents. ${working.length ? `Working: ${working.map((n) => `${ROLE_TITLES[n.role]} on "${n.current?.title}"`).join('; ')}.` : 'Nobody is working right now.'} ${handoffs.reduce((a, h) => a + h.n, 0)} handoff messages recorded.`;

  return (
    <section className="card" aria-labelledby="map-h" data-testid="mission-map">
      <div className="panel-head">
        <Network className="h-4 w-4 text-mute" aria-hidden />
        <h2 id="map-h" className="text-sm font-medium">Mission map</h2>
        <span className="ml-auto hidden items-center gap-3 font-mono text-2xs text-mute sm:flex">
          <span className="flex items-center gap-1"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="#94a3b8" strokeWidth="1.5" /></svg>assigned</span>
          <span className="flex items-center gap-1"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="#a5b4fc" strokeWidth="1.5" strokeDasharray="4 3" /></svg>handoff</span>
        </span>
      </div>
      {nodes.length === 0 ? (
        <p className="p-6 text-center text-sm text-mute">Add teammates to see them here.</p>
      ) : (
        <>
          <p className="sr-only">{summary}</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={summary}>
            {/* leader → agent assignments */}
            {nodes.filter((n) => n.assigned > 0).map((n) => {
              const x1 = leader.x, y1 = leader.y + 30, x2 = n.x, y2 = n.y - NODE_H / 2;
              const my = (y1 + y2) / 2;
              return (
                <g key={`a-${n.role}`}>
                  <path d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`} fill="none" stroke={n.state === 'working' ? '#818cf8' : '#3b4450'} strokeWidth={n.state === 'working' ? 1.75 : 1.25} />
                  <text x={x2 - NODE_W / 2} y={y2 - 8} className="fill-mute font-mono" fontSize="11">{n.assigned} task{n.assigned === 1 ? '' : 's'}</text>
                </g>
              );
            })}
            {/* persisted handoffs */}
            {handoffs.map((h) => {
              const a = byRole.get(h.from), b = byRole.get(h.to);
              if (!a || !b) return null;
              if (a === b) {
                const x = a.x + NODE_W / 2, y = a.y;
                return (
                  <g key={`h-${h.from}-${h.to}`}>
                    <path d={`M ${x} ${y - 14} C ${x + 34} ${y - 26}, ${x + 34} ${y + 26}, ${x} ${y + 14}`} fill="none" stroke="#a5b4fc" strokeWidth="1.25" strokeDasharray="4 3" markerEnd="url(#arrow)" />
                    <text x={x} y={y - NODE_H / 2 - 8} textAnchor="end" className="font-mono" fill="#a5b4fc" fontSize="11">↻ {h.n} to same role</text>
                  </g>
                );
              }
              const x1 = a.x, y1 = a.y + (b.y >= a.y ? NODE_H / 2 : -NODE_H / 2), x2 = b.x, y2 = b.y + (a.y > b.y ? NODE_H / 2 : -NODE_H / 2);
              const sameRow = a.y === b.y;
              const cy = sameRow ? a.y + NODE_H / 2 + 36 : (y1 + y2) / 2;
              const path = sameRow ? `M ${x1} ${a.y + NODE_H / 2} Q ${(x1 + x2) / 2} ${cy + 20} ${x2} ${b.y + NODE_H / 2}` : `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
              return (
                <g key={`h-${h.from}-${h.to}`}>
                  <path d={path} fill="none" stroke="#a5b4fc" strokeWidth="1.25" strokeDasharray="4 3" markerEnd="url(#arrow)" />
                  <text x={(x1 + x2) / 2} y={sameRow ? cy + 14 : cy - 4} textAnchor="middle" className="font-mono" fill="#a5b4fc" fontSize="11">{h.n} handoff{h.n === 1 ? '' : 's'}</text>
                </g>
              );
            })}
            <defs>
              <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill="#a5b4fc" />
              </marker>
            </defs>
            {/* leader */}
            <g>
              <rect x={leader.x - 70} y={leader.y - 30} width="140" height="60" rx="8" fill="#1b222c" stroke="#6366f1" strokeWidth="1.25" />
              <text x={leader.x} y={leader.y - 6} textAnchor="middle" fill="#e6edf3" fontSize="13" fontWeight="600">Team leader</text>
              <text x={leader.x} y={leader.y + 13} textAnchor="middle" className="font-mono" fill="#94a3b8" fontSize="11">you · approve plans</text>
            </g>
            {/* agents */}
            {nodes.map((n) => {
              const st = STATE_STYLE[n.state];
              return (
                <g key={n.role} data-map-agent={n.role} data-map-state={n.state}>
                  <rect x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} rx="8" fill="#131922" stroke={st.stroke} strokeWidth={n.state === 'idle' || n.state === 'absent' ? 1 : 1.75} strokeDasharray={n.state === 'absent' ? '5 4' : undefined} />
                  {n.state === 'working' && <circle cx={n.x - NODE_W / 2 + 12} cy={n.y - NODE_H / 2 + 14} r="3.5" fill="#818cf8" className="animate-pulse" />}
                  <text x={n.x - NODE_W / 2 + (n.state === 'working' ? 22 : 12)} y={n.y - NODE_H / 2 + 18} fill="#e6edf3" fontSize="14" fontWeight="600">{ROLE_TITLES[n.role]}</text>
                  <text x={n.x - NODE_W / 2 + 12} y={n.y - NODE_H / 2 + 36} className="font-mono" fill={n.state === 'idle' || n.state === 'absent' ? '#94a3b8' : st.stroke} fontSize="11" letterSpacing="0.08em">{st.label.toUpperCase()}</text>
                  <text x={n.x - NODE_W / 2 + 12} y={n.y - NODE_H / 2 + 54} fill="#94a3b8" fontSize="12">{n.current ? clip(n.current.title, 28) : n.onTeam ? 'No tasks yet' : 'Tasks wait for this role'}</text>
                </g>
              );
            })}
          </svg>
          <p className="border-t border-line-soft px-4 py-2 text-2xs text-mute">Tasks run one at a time in planner order. Lines show real assignments and recorded handoff messages only.</p>
        </>
      )}
    </section>
  );
}
