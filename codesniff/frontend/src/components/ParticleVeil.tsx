import { useEffect, useRef } from 'react';

const FLUID_COLOR = '#3f37c9'; // borrowed from particles/Aurora palette
const TRAIL_COLOR = '#4cc9f0';

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
}

const ParticleVeil = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    /* particle veil animation */
    let width = 0;
    let height = 0;
    const particles: Particle[] = Array.from({ length: 15 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.5 + Math.random() * 0.9,
      alpha: 0.1 + Math.random() * 0.18,
      speed: 0.0003 + Math.random() * 0.0009,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width || 1;
      height = rect.height || 1;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    let animationFrame = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((particle) => {
        particle.y = particle.y - particle.speed;
        if (particle.y < -0.12) {
          particle.y = 1.1;
          particle.x = Math.random();
        }

        const px = particle.x * width;
        const py = particle.y * height;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, particle.size * 14);
        gradient.addColorStop(0, `rgba(76, 201, 240, ${particle.alpha})`);
        gradient.addColorStop(1, 'rgba(8, 12, 20, 0)');
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(px, py, particle.size * 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(63, 55, 201, ${particle.alpha * 0.25})`;
        ctx.fillRect(px - 0.5, py + particle.size * 3, 1, particle.size * 22);
      });

      ctx.strokeStyle = `${TRAIL_COLOR}06`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width * 0.38, 0);
      ctx.lineTo(width * 0.44, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = `${FLUID_COLOR}05`;
      ctx.moveTo(width * 0.6, 0);
      ctx.lineTo(width * 0.54, height);
      ctx.stroke();

      animationFrame = requestAnimationFrame(render);
    };

    resize();
    animationFrame = requestAnimationFrame(render);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-veil" aria-hidden="true" />;
};

export default ParticleVeil;
