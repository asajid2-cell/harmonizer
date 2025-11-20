import { type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import ParticleVeil from './ParticleVeil';

const GHOST_LAYERS = [
  { rows: 6, offset: 0 },
  { rows: 5, offset: 0.4 },
  { rows: 4, offset: 0.8 },
];

const CODE_LINES = [
  { text: 'async def resolve_session(token: str):', accent: 'keyword' },
  { text: '    payload = await decode_jwt(token)', accent: 'cyan' },
  { text: '    if payload.expired:', accent: 'control' },
  { text: '        raise SessionExpired()', accent: 'error' },
  { text: '    guard = await load_guard(payload.scope)', accent: 'cyan' },
  { text: '    return guard.enforce(payload.user)', accent: 'keyword' },
];

interface SemanticExcavationProps {
  className?: string;
}

const SemanticExcavation = ({ className }: SemanticExcavationProps) => (
  <div className={`semantic-excavation${className ? ` ${className}` : ''}`} aria-hidden="true">
    <ParticleVeil />
    <div className="semantic-excavation__layers">
      {GHOST_LAYERS.map((layer, index) => (
        <div
          key={`layer-${index}`}
          className="semantic-layer"
          style={{ '--offset': layer.offset } as CSSProperties}
        >
          {Array.from({ length: layer.rows }).map((_, rowIndex) => (
            <div key={`row-${rowIndex}`} className="semantic-layer__row" />
          ))}
        </div>
      ))}
    </div>
    <div className="semantic-excavation__beam">
      <div className="semantic-excavation__beam-core" />
      <div className="semantic-excavation__beam-flare" />
    </div>
    <motion.div
      className="semantic-hero"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    >
      <div className="semantic-hero__glass">
        <div className="semantic-hero__header">
          <div className="semantic-chip">function</div>
          <div className="semantic-path">security/session/verify.py</div>
        </div>
        <div className="semantic-hero__code">
          {CODE_LINES.map((line) => (
            <div key={line.text} className={`semantic-code semantic-code--${line.accent}`}>
              {line.text}
            </div>
          ))}
        </div>
        <div className="semantic-hero__footer">
          <div>
            <span className="semantic-label">SIMILARITY</span>
            <span className="semantic-value">0.94 lock</span>
          </div>
          <div>
            <span className="semantic-label">DEPTH</span>
            <span className="semantic-value">Scope + intent</span>
          </div>
        </div>
      </div>
    </motion.div>
  </div>
);

export default SemanticExcavation;
