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
  { id: 'query', x: 16, y: 32, meta: 'query()', active: true },
  { id: 'parse', x: 32, y: 38, meta: 'parse()', active: true },
  { id: 'embed', x: 50, y: 42, meta: 'embed()', active: true },
  { id: 'rank', x: 66, y: 50, meta: 'rank()', active: true },
  { id: 'scope', x: 78, y: 60, meta: 'scope()', active: true },
  { id: 'authz', x: 88, y: 72, meta: 'auth()', active: true },
  { id: 'cache', x: 28, y: 58, meta: 'cache' },
  { id: 'hydration', x: 46, y: 68, meta: 'hydrate' },
  { id: 'rpc', x: 72, y: 32, meta: 'rpc' },
  { id: 'audit', x: 60, y: 24, meta: 'audit' },
  { id: 'token', x: 92, y: 52, meta: 'token' },
];

const CONNECTIONS: Array<[string, string]> = [
  ['query', 'parse'],
  ['parse', 'embed'],
  ['embed', 'rank'],
  ['rank', 'scope'],
  ['scope', 'authz'],
  ['cache', 'embed'],
  ['hydration', 'rank'],
  ['rpc', 'rank'],
  ['audit', 'embed'],
  ['token', 'authz'],
];

interface SemanticExcavationProps {
  className?: string;
}

const SemanticExcavation = ({ className }: SemanticExcavationProps) => {
  const formatLabel = (meta?: string) => {
    if (!meta) {
      return '';
    }
    const cleaned = meta.trim();
    if (!cleaned || /^[^a-zA-Z0-9]+$/.test(cleaned)) {
      return 'anon()';
    }
    return cleaned;
  };

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
            {NODES.map((node) => {
              const label = formatLabel(node.meta);
              if (!label) {
                return null;
              }
              return (
                <span
                  key={`label-${node.id}`}
                  className={`vector-plane__label${node.active ? ' vector-plane__label--active' : ''}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  {label}
                </span>
              );
            })}
          </div>
          <div className="vector-plane__blur" />
        </div>
      </div>
    </div>
  );
};

export default SemanticExcavation;
