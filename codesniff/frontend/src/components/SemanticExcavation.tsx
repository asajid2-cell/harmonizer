import { motion } from 'framer-motion';
import ParticleVeil from './ParticleVeil';

type Node = {
  id: string;
  x: number;
  y: number;
  meta?: string;
  active?: boolean;
};

const NODES: Node[] = [
  { id: 'query', x: 14, y: 24, meta: 'input()', active: true },
  { id: 'intent', x: 32, y: 34, meta: 'fn()', active: true },
  { id: 'graph', x: 50, y: 40, meta: 'AST', active: true },
  { id: 'resolver', x: 66, y: 52, meta: '{}', active: true },
  { id: 'guard', x: 81, y: 64, meta: 'auth', active: true },
  { id: 'emit', x: 92, y: 78, meta: 'lock', active: true },
  { id: 'noise-1', x: 26, y: 58, meta: 'cache' },
  { id: 'noise-2', x: 43, y: 74, meta: 'batch' },
  { id: 'noise-3', x: 60, y: 22, meta: 'index' },
  { id: 'noise-4', x: 72, y: 34, meta: 'rpc' },
  { id: 'noise-5', x: 87, y: 44, meta: 'token' },
];

const CONNECTIONS: Array<[string, string]> = [
  ['query', 'intent'],
  ['intent', 'graph'],
  ['graph', 'resolver'],
  ['resolver', 'guard'],
  ['guard', 'emit'],
  ['noise-1', 'graph'],
  ['noise-2', 'resolver'],
  ['noise-3', 'intent'],
  ['noise-4', 'graph'],
  ['noise-5', 'guard'],
];

interface SemanticExcavationProps {
  className?: string;
}

const SemanticExcavation = ({ className }: SemanticExcavationProps) => {
  const lookup = NODES.reduce<Record<string, Node>>((acc, node) => {
    acc[node.id] = node;
    return acc;
  }, {});

  return (
    <div className={`semantic-excavation${className ? ` ${className}` : ''}`} aria-hidden="true">
      <ParticleVeil />
      <div className="vector-plane">
        <div className="vector-plane__surface">
          <div className="vector-plane__rim" />
          <svg viewBox="0 0 100 100" className="vector-plane__map">
            <defs>
              <linearGradient id="activeEdge" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8cd1ff" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#8cd1ff" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            {CONNECTIONS.map(([startId, endId]) => {
              const start = lookup[startId];
              const end = lookup[endId];
              if (!start || !end) {
                return null;
              }
              const isActive = Boolean(start.active && end.active);
              return (
                <line
                  key={`${startId}-${endId}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  className={`vector-plane__edge${isActive ? ' vector-plane__edge--active' : ''}`}
                  stroke={isActive ? 'url(#activeEdge)' : undefined}
                />
              );
            })}
            {NODES.map((node) => (
              <motion.circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={node.active ? 2.5 : 1.4}
                className={`vector-plane__node${node.active ? ' vector-plane__node--active' : ''}`}
                animate={
                  node.active
                    ? { opacity: [0.7, 1, 0.7], r: [2.5, 3.4, 2.5] }
                    : undefined
                }
                transition={node.active ? { duration: 3.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
              />
            ))}
          </svg>
          <div className="vector-plane__labels">
            {NODES.filter((node) => node.meta).map((node) => (
              <span
                key={`label-${node.id}`}
                className={`vector-plane__label${node.active ? ' vector-plane__label--active' : ''}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
              >
                {node.meta}
              </span>
            ))}
          </div>
          <div className="vector-plane__blur" />
        </div>
      </div>
    </div>
  );
};

export default SemanticExcavation;
