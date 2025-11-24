// Core physics simulation engine
import { Grid } from './grid.js';
import { ParticleTypes, ParticleState, createParticle, canDisplace } from './particles.js';

export class Simulation {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = new Grid(width, height);
        this.paused = false;
        this.frameCount = 0;
    }

    // Main update loop
    update() {
        if (this.paused) return;

        this.frameCount++;

        // Shuffle update order every few frames to reduce bias
        if (this.frameCount % 3 === 0) {
            this.grid.shuffleUpdateOrder();
        }

        // Reset updated flags
        for (let i = 0; i < this.grid.cells.length; i++) {
            if (this.grid.cells[i]) {
                this.grid.cells[i].updated = false;
            }
        }

        // Update from bottom to top for gravity-based particles
        // Alternate left-right direction each frame to reduce bias
        const leftToRight = this.frameCount % 2 === 0;

        for (let y = this.height - 1; y >= 0; y--) {
            const startX = leftToRight ? 0 : this.width - 1;
            const endX = leftToRight ? this.width : -1;
            const step = leftToRight ? 1 : -1;

            for (let x = startX; x !== endX; x += step) {
                const particle = this.grid.get(x, y);
                if (particle && !particle.updated) {
                    this.updateParticle(particle, x, y);
                }
            }
        }
    }

    // Update a single particle
    updateParticle(particle, x, y) {
        particle.updated = true;

        // Handle lifetime
        if (particle.lifetime > 0) {
            particle.lifetime--;
            if (particle.lifetime <= 0) {
                this.grid.remove(x, y);
                return;
            }
        }

        // Get particle type definition
        const typeDef = ParticleTypes[particle.type];
        if (!typeDef) return;

        // Handle different particle states
        switch (typeDef.state) {
            case ParticleState.POWDER:
                this.updatePowder(particle, x, y);
                break;
            case ParticleState.LIQUID:
                this.updateLiquid(particle, x, y);
                break;
            case ParticleState.GAS:
                this.updateGas(particle, x, y);
                break;
            case ParticleState.SOLID:
                this.updateSolid(particle, x, y);
                break;
        }

        // Handle special behaviors
        this.handleReactions(particle, x, y);
    }

    // Powder physics (sand, gunpowder)
    updatePowder(particle, x, y) {
        // Try to move down
        if (this.tryMove(particle, x, y, x, y + 1)) return;

        // Try to move diagonally down
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (this.tryMove(particle, x, y, x + dir, y + 1)) return;
        if (this.tryMove(particle, x, y, x - dir, y + 1)) return;

        // Try to displace lighter particles below
        const below = this.grid.get(x, y + 1);
        if (below && canDisplace(particle.type, below.type)) {
            this.grid.swap(x, y, x, y + 1);
            particle.updated = true;
            below.updated = true;
        }
    }

    // Liquid physics (water, oil, acid, lava)
    updateLiquid(particle, x, y) {
        const typeDef = ParticleTypes[particle.type];
        const dispersion = typeDef.dispersion || 3;

        // Try to move down
        if (this.tryMove(particle, x, y, x, y + 1)) return;

        // Try to move diagonally down
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (this.tryMove(particle, x, y, x + dir, y + 1)) return;
        if (this.tryMove(particle, x, y, x - dir, y + 1)) return;

        // Try to displace lighter particles below
        const below = this.grid.get(x, y + 1);
        if (below && canDisplace(particle.type, below.type)) {
            this.grid.swap(x, y, x, y + 1);
            particle.updated = true;
            below.updated = true;
            return;
        }

        // Spread horizontally
        const spreadDir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 1; i <= dispersion; i++) {
            if (this.tryMove(particle, x, y, x + spreadDir * i, y)) return;
        }
        for (let i = 1; i <= dispersion; i++) {
            if (this.tryMove(particle, x, y, x - spreadDir * i, y)) return;
        }
    }

    // Gas physics (fire, smoke, steam)
    updateGas(particle, x, y) {
        // Gases rise
        if (this.tryMove(particle, x, y, x, y - 1)) return;

        // Try diagonal up
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (this.tryMove(particle, x, y, x + dir, y - 1)) return;
        if (this.tryMove(particle, x, y, x - dir, y - 1)) return;

        // Drift sideways
        if (Math.random() < 0.3) {
            const driftDir = Math.random() < 0.5 ? -1 : 1;
            this.tryMove(particle, x, y, x + driftDir, y);
        }

        // Swap with heavier particles above
        const above = this.grid.get(x, y - 1);
        if (above && canDisplace(above.type, particle.type)) {
            this.grid.swap(x, y, x, y - 1);
            particle.updated = true;
            above.updated = true;
        }
    }

    // Solid physics (stone, wood, ice)
    updateSolid(particle, x, y) {
        // Solids don't move on their own
        // But handle temperature effects
        const typeDef = ParticleTypes[particle.type];

        // Melting
        if (typeDef.meltPoint && particle.temperature >= typeDef.meltPoint) {
            if (particle.type === 'ice') {
                this.transformParticle(x, y, 'water');
            } else if (particle.type === 'stone') {
                this.transformParticle(x, y, 'lava');
            }
        }
    }

    // Handle chemical reactions and interactions
    handleReactions(particle, x, y) {
        const typeDef = ParticleTypes[particle.type];
        const neighbors = this.grid.getNeighbors(x, y);

        switch (particle.type) {
            case 'fire':
                this.handleFire(particle, x, y, neighbors);
                break;
            case 'water':
                this.handleWater(particle, x, y, neighbors);
                break;
            case 'lava':
                this.handleLava(particle, x, y, neighbors);
                break;
            case 'acid':
                this.handleAcid(particle, x, y, neighbors);
                break;
            case 'ice':
                this.handleIce(particle, x, y, neighbors);
                break;
            case 'plant':
                this.handlePlant(particle, x, y, neighbors);
                break;
            case 'steam':
                this.handleSteam(particle, x, y, neighbors);
                break;
        }
    }

    handleFire(particle, x, y, neighbors) {
        // Chance to create smoke
        if (Math.random() < 0.1 && this.grid.isEmpty(x, y - 1)) {
            this.grid.set(x, y - 1, createParticle('smoke', x, y - 1));
        }

        // Spread fire to flammable neighbors
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        for (const { p, nx, ny } of neighborList) {
            if (p && ParticleTypes[p.type]?.flammable) {
                if (Math.random() < 0.05) {
                    // Gunpowder explodes
                    if (p.type === 'gunpowder') {
                        this.explode(nx, ny, 5);
                    } else {
                        this.transformParticle(nx, ny, 'fire');
                    }
                }
            }
        }
    }

    handleWater(particle, x, y, neighbors) {
        // Check for nearby hot things
        const neighborList = [neighbors.top, neighbors.bottom, neighbors.left, neighbors.right];

        for (const n of neighborList) {
            if (n && (n.type === 'fire' || n.type === 'lava')) {
                // Turn to steam
                if (Math.random() < 0.3) {
                    this.transformParticle(x, y, 'steam');
                    return;
                }
            }
        }

        // Extinguish fire
        for (const n of neighborList) {
            if (n && n.type === 'fire') {
                this.grid.remove(n.x, n.y);
            }
        }

        // Freeze if touching ice
        if (this.grid.hasNearbyType(x, y, 'ice', 1)) {
            if (Math.random() < 0.01) {
                this.transformParticle(x, y, 'ice');
            }
        }
    }

    handleLava(particle, x, y, neighbors) {
        // Ignite flammable things
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        for (const { p, nx, ny } of neighborList) {
            if (p) {
                if (p.type === 'water') {
                    // Lava + water = stone
                    this.transformParticle(x, y, 'stone');
                    this.transformParticle(nx, ny, 'steam');
                    return;
                }
                if (p.type === 'ice') {
                    this.transformParticle(nx, ny, 'water');
                }
                if (ParticleTypes[p.type]?.flammable) {
                    if (Math.random() < 0.2) {
                        if (p.type === 'gunpowder') {
                            this.explode(nx, ny, 5);
                        } else {
                            this.transformParticle(nx, ny, 'fire');
                        }
                    }
                }
            }
        }

        // Randomly emit fire particles
        if (Math.random() < 0.02 && this.grid.isEmpty(x, y - 1)) {
            this.grid.set(x, y - 1, createParticle('fire', x, y - 1));
        }
    }

    handleAcid(particle, x, y, neighbors) {
        // Corrode nearby particles
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        for (const { p, nx, ny } of neighborList) {
            if (p && ParticleTypes[p.type]?.corrodible) {
                if (Math.random() < 0.1) {
                    this.grid.remove(nx, ny);
                    // Acid gets consumed too
                    if (Math.random() < 0.3) {
                        this.grid.remove(x, y);
                        return;
                    }
                }
            }
        }
    }

    handleIce(particle, x, y, neighbors) {
        // Melt if near heat
        const neighborList = [neighbors.top, neighbors.bottom, neighbors.left, neighbors.right];

        for (const n of neighborList) {
            if (n && (n.type === 'fire' || n.type === 'lava')) {
                if (Math.random() < 0.1) {
                    this.transformParticle(x, y, 'water');
                    return;
                }
            }
        }
    }

    handlePlant(particle, x, y, neighbors) {
        // Grow if water nearby
        if (this.grid.hasNearbyType(x, y, 'water', 2)) {
            if (Math.random() < 0.005) {
                // Try to grow in a random direction
                const dirs = [
                    [0, -1], [0, 1], [-1, 0], [1, 0],
                    [-1, -1], [1, -1], [-1, 1], [1, 1]
                ];
                const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
                if (this.grid.isEmpty(x + dx, y + dy)) {
                    this.grid.set(x + dx, y + dy, createParticle('plant', x + dx, y + dy));
                }
            }
        }
    }

    handleSteam(particle, x, y, neighbors) {
        // Condense back to water if high up and cooling
        if (y < this.height * 0.3 && Math.random() < 0.01) {
            this.transformParticle(x, y, 'water');
        }
    }

    // Try to move particle to new position
    tryMove(particle, fromX, fromY, toX, toY) {
        if (!this.grid.inBounds(toX, toY)) return false;
        if (!this.grid.isEmpty(toX, toY)) return false;

        this.grid.move(fromX, fromY, toX, toY);
        return true;
    }

    // Transform particle to a different type
    transformParticle(x, y, newType) {
        const newParticle = createParticle(newType, x, y);
        newParticle.updated = true;
        this.grid.set(x, y, newParticle);
    }

    // Create an explosion
    explode(x, y, radius) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    const px = x + dx;
                    const py = y + dy;

                    if (!this.grid.inBounds(px, py)) continue;

                    const particle = this.grid.get(px, py);

                    // Remove or transform particles in explosion radius
                    if (dist < radius * 0.5) {
                        this.grid.remove(px, py);
                        // Create fire in inner radius
                        if (Math.random() < 0.5) {
                            this.grid.set(px, py, createParticle('fire', px, py));
                        }
                    } else if (particle) {
                        // Outer radius - just ignite flammables
                        if (ParticleTypes[particle.type]?.flammable) {
                            if (particle.type === 'gunpowder') {
                                // Chain reaction
                                setTimeout(() => this.explode(px, py, 3), 50);
                            } else {
                                this.transformParticle(px, py, 'fire');
                            }
                        }
                    }
                }
            }
        }

        // Create smoke ring
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const sx = Math.round(x + Math.cos(angle) * radius);
            const sy = Math.round(y + Math.sin(angle) * radius);
            if (this.grid.isEmpty(sx, sy)) {
                this.grid.set(sx, sy, createParticle('smoke', sx, sy));
            }
        }
    }

    // Add particle at position
    addParticle(x, y, type) {
        if (!this.grid.inBounds(x, y)) return;
        if (!this.grid.isEmpty(x, y)) return;

        const particle = createParticle(type, x, y);
        this.grid.set(x, y, particle);
    }

    // Add particles in a brush area
    addBrush(centerX, centerY, type, size) {
        for (let dx = -size; dx <= size; dx++) {
            for (let dy = -size; dy <= size; dy++) {
                if (dx * dx + dy * dy <= size * size) {
                    const x = centerX + dx;
                    const y = centerY + dy;

                    // Add some randomness to brush
                    if (Math.random() < 0.7) {
                        this.addParticle(x, y, type);
                    }
                }
            }
        }
    }

    // Erase particles in a brush area
    eraseBrush(centerX, centerY, size) {
        for (let dx = -size; dx <= size; dx++) {
            for (let dy = -size; dy <= size; dy++) {
                if (dx * dx + dy * dy <= size * size) {
                    this.grid.remove(centerX + dx, centerY + dy);
                }
            }
        }
    }

    // Clear all particles
    clear() {
        this.grid.clear();
    }

    // Toggle pause
    togglePause() {
        this.paused = !this.paused;
        return this.paused;
    }

    // Get particle count
    getParticleCount() {
        return this.grid.countParticles();
    }
}
