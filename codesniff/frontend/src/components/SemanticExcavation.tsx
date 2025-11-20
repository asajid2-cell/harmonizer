import { useEffect, useRef } from 'react';

type GraphNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  type: 'auth' | 'db' | 'ui' | 'core';
};

const SemanticExcavation = ({ className }: { className?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      width = w || 800;
      height = h || 480;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const nodeCount = 42;
    const connectionDistance = 180;
    const mouseDistance = 200;
    const types: GraphNode['type'][] = ['auth', 'db', 'ui', 'core'];
    const nodes: GraphNode[] = [];

    const spawn = () => {
      nodes.length = 0;
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          size: Math.random() * 2.2 + 2,
          type: types[Math.floor(Math.random() * types.length)],
        });
      }
    };

    resize();
    spawn();

    let mouse = { x: -1e3, y: -1e3 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleResize = () => {
      resize();
      spawn();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);

    const getColor = (type: GraphNode['type'], alpha = 1) => {
      switch (type) {
        case 'auth':
          return `rgba(56, 189, 248, ${alpha})`;
        case 'db':
          return `rgba(168, 85, 247, ${alpha})`;
        case 'ui':
          return `rgba(236, 72, 153, ${alpha})`;
        default:
          return `rgba(148, 163, 184, ${alpha})`;
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      nodes.forEach((node, idx) => {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const dist = Math.hypot(dx, dy);

        if (dist < mouseDistance && dist > 0) {
          const force = (mouseDistance - dist) / mouseDistance;
          node.vx -= (dx / dist) * force * 0.05;
          node.vy -= (dy / dist) * force * 0.05;
        }

        for (let j = idx + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const ddx = node.x - other.x;
          const ddy = node.y - other.y;
          const distance = Math.hypot(ddx, ddy);

          if (distance < connectionDistance) {
            ctx.beginPath();
            const opacity = 1 - distance / connectionDistance;
            ctx.strokeStyle = getColor(node.type, opacity * 0.35);
            ctx.lineWidth = 0.8;
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
        ctx.fillStyle = getColor(node.type, 0.9);
        ctx.shadowBlur = 16;
        ctx.shadowColor = getColor(node.type, 0.8);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className={`semantic-excavation${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div className="neural-card">
        <div className="neural-card__header">
          <div className="neural-card__lights">
            <span />
            <span />
            <span />
          </div>
          <span className="neural-card__title">semantic_map.vis</span>
        </div>
        <div className="neural-card__glow" />
        <canvas ref={canvasRef} className="neural-card__canvas" />
        <div className="neural-card__grid" />
        <div className="neural-card__stats">
          <div>
            <p>Indexed Symbols</p>
            <strong>3,391</strong>
          </div>
          <div>
            <p>Vector Space</p>
            <strong>285 dims</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SemanticExcavation;
