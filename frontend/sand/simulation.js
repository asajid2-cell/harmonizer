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
        // Global simulation tuning
        this.gravity = 0.35;      // Per-frame acceleration for powders/liquids
        this.maxVelocity = 4;     // Max falling speed in cells/frame
        this.fireIntensity = 1.0; // Scales burning / fire spread
        this.windX = 0;           // Horizontal wind component (-1 to 1)
        this.stepsPerFrame = 1;   // How many updates per render
        this.rainEnabled = false;
        this.snowEnabled = false;
        this.portals = {
            portal_blue: null,
            portal_orange: null
        };
        this.temperatureEnabled = true;
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

        // Simple weather systems
        if (this.rainEnabled) {
            this.spawnRain();
        }
        if (this.snowEnabled) {
            this.spawnSnow();
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

        // Basic temperature diffusion and cooling
        if (this.temperatureEnabled && typeof particle.temperature === 'number') {
            const neighbors = this.grid.getNeighbors(x, y);
            let sumT = particle.temperature;
            let countT = 1;
            for (const key of ['top', 'bottom', 'left', 'right']) {
                const n = neighbors[key];
                if (n && typeof n.temperature === 'number') {
                    sumT += n.temperature;
                    countT++;
                }
            }
            const avgT = sumT / countT;
            const conductivity = typeDef.conductivity ?? 0.15;
            particle.temperature += (avgT - particle.temperature) * conductivity * 0.25;

            const ambient = 20;
            const cooling = 0.01;
            particle.temperature += (ambient - particle.temperature) * cooling;
        }

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

        // Handle special behaviors at the final position
        const finalX = particle.x ?? x;
        const finalY = particle.y ?? y;
        this.handleReactions(particle, finalX, finalY);
    }

    // Powder physics (sand, gunpowder, rust, ash)
    updatePowder(particle, x, y) {
        const g = this.gravity || 0;
        particle.velocityY = Math.min(
            (particle.velocityY || 0) + g,
            this.maxVelocity
        );

        const steps = Math.max(1, Math.round(Math.abs(particle.velocityY)));
        let cx = particle.x ?? x;
        let cy = particle.y ?? y;

        for (let i = 0; i < steps; i++) {
            // Try to move straight down
            if (this.tryMove(particle, cx, cy, cx, cy + 1)) {
                cy += 1;
                continue;
            }

            // Try to move diagonally down
            const dir = Math.random() < 0.5 ? -1 : 1;
            if (this.tryMove(particle, cx, cy, cx + dir, cy + 1)) {
                cx += dir;
                cy += 1;
                continue;
            }
            if (this.tryMove(particle, cx, cy, cx - dir, cy + 1)) {
                cx -= dir;
                cy += 1;
                continue;
            }

            // Try to displace lighter particles below
            const below = this.grid.get(cx, cy + 1);
            if (below && canDisplace(particle.type, below.type)) {
                this.grid.swap(cx, cy, cx, cy + 1);
                cx = particle.x;
                cy = particle.y;
                continue;
            }

            // Blocked – settle
            particle.velocityY = 0;
            break;
        }

        // Wind can move very light powders (e.g. ash)
        const def = ParticleTypes[particle.type];
        const wind = this.windX || 0;
        if (def && def.density < 1.0 && wind !== 0) {
            const fx = particle.x ?? cx;
            const fy = particle.y ?? cy;
            if (Math.random() < Math.abs(wind) * 0.6) {
                const dir = wind > 0 ? 1 : -1;
                this.tryMove(particle, fx, fy, fx + dir, fy);
            }
        }
    }

    // Liquid physics (water, oil, acid, lava, molten_metal)
    updateLiquid(particle, x, y) {
        const typeDef = ParticleTypes[particle.type];
        const dispersion = typeDef.dispersion || 3;

        // Liquids accelerate more gently than powders
        const g = this.gravity || 0;
        const liquidMaxVelocity = this.maxVelocity * 0.7;
        particle.velocityY = Math.min(
            (particle.velocityY || 0) + g * 0.7,
            liquidMaxVelocity
        );

        const steps = Math.max(1, Math.round(Math.abs(particle.velocityY)));
        let cx = particle.x ?? x;
        let cy = particle.y ?? y;

        for (let i = 0; i < steps; i++) {
            // Try to move down
            if (this.tryMove(particle, cx, cy, cx, cy + 1)) {
                cy += 1;
                continue;
            }

            // Try to move diagonally down
            const dir = Math.random() < 0.5 ? -1 : 1;
            if (this.tryMove(particle, cx, cy, cx + dir, cy + 1)) {
                cx += dir;
                cy += 1;
                continue;
            }
            if (this.tryMove(particle, cx, cy, cx - dir, cy + 1)) {
                cx -= dir;
                cy += 1;
                continue;
            }

            // Try to displace lighter particles below
            const below = this.grid.get(cx, cy + 1);
            if (below && canDisplace(particle.type, below.type)) {
                this.grid.swap(cx, cy, cx, cy + 1);
                cx = particle.x;
                cy = particle.y;
                continue;
            }

            // Blocked – settle
            particle.velocityY = 0;
            break;
        }

        // Spread horizontally from the final position
        cx = particle.x ?? cx;
        cy = particle.y ?? cy;
        const spreadDir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 1; i <= dispersion; i++) {
            if (this.tryMove(particle, cx, cy, cx + spreadDir * i, cy)) return;
        }
        for (let i = 1; i <= dispersion; i++) {
            if (this.tryMove(particle, cx, cy, cx - spreadDir * i, cy)) return;
        }
    }

    // Gas physics (fire, smoke, steam, spark)
    updateGas(particle, x, y) {
        // Gases rise
        if (this.tryMove(particle, x, y, x, y - 1)) return;

        // Try diagonal up
        const dir = Math.random() < 0.5 ? -1 : 1;
        if (this.tryMove(particle, x, y, x + dir, y - 1)) return;
        if (this.tryMove(particle, x, y, x - dir, y - 1)) return;

        // Drift sideways (random + wind)
        const baseDriftChance = 0.25;
        const wind = this.windX || 0;
        if (Math.random() < baseDriftChance) {
            const driftDir = Math.random() < 0.5 ? -1 : 1;
            this.tryMove(particle, x, y, x + driftDir, y);
        }
        if (wind !== 0 && Math.random() < Math.abs(wind)) {
            const windDir = wind > 0 ? 1 : -1;
            this.tryMove(particle, x, y, x + windDir, y);
        }

        // Swap with heavier particles above
        const above = this.grid.get(x, y - 1);
        if (above && canDisplace(above.type, particle.type)) {
            this.grid.swap(x, y, x, y - 1);
            particle.updated = true;
            above.updated = true;
        }
    }

    // Solid physics (stone, wood, ice, metal, glass, ember)
    updateSolid(particle, x, y) {
        const typeDef = ParticleTypes[particle.type];

        // Melting
        if (typeDef.meltPoint && particle.temperature >= typeDef.meltPoint) {
            if (particle.type === 'ice') {
                this.transformParticle(x, y, 'water');
            } else if (particle.type === 'stone') {
                this.transformParticle(x, y, 'lava');
            } else if (particle.type === 'metal') {
                this.transformParticle(x, y, 'molten_metal');
            } else if (particle.type === 'glass') {
                this.transformParticle(x, y, 'lava');
            }
        }
    }

    // Handle chemical reactions and interactions
    handleReactions(particle, x, y) {
        const neighbors = this.grid.getNeighbors(x, y);

        switch (particle.type) {
            case 'sand':
                this.handleSand(particle, x, y, neighbors);
                break;
            case 'snow':
                this.handleSnow(particle, x, y, neighbors);
                break;
            case 'mud':
                this.handleMud(particle, x, y, neighbors);
                break;
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
            case 'metal':
                this.handleMetal(particle, x, y, neighbors);
                break;
            case 'molten_metal':
                this.handleMoltenMetal(particle, x, y, neighbors);
                break;
            case 'uranium':
                this.handleUranium(particle, x, y, neighbors);
                break;
            case 'ember':
                this.handleEmber(particle, x, y, neighbors);
                break;
            case 'spark':
                this.handleSpark(particle, x, y, neighbors);
                break;
            case 'void':
                this.handleVoid(particle, x, y);
                break;
            case 'fan_left':
                this.handleFan(particle, x, y, -1, 0);
                break;
            case 'fan_right':
                this.handleFan(particle, x, y, 1, 0);
                break;
            case 'fan_up':
                this.handleFan(particle, x, y, 0, -1);
                break;
            case 'fan_down':
                this.handleFan(particle, x, y, 0, 1);
                break;
        }
    }

    handleSand(particle, x, y, neighbors) {
        const temp = particle.temperature || 20;
        const nearLava = this.grid.hasNearbyType(x, y, 'lava', 1);

        // Under intense heat, sand can fuse into stone or glass
        if ((nearLava || temp > 800) && Math.random() < 0.003) {
            if (temp > 1100 && Math.random() < 0.6) {
                this.transformParticle(x, y, 'glass');
            } else {
                this.transformParticle(x, y, 'stone');
            }
        }
    }

    handleFire(particle, x, y, neighbors) {
        // Chance to create smoke or sparks above
        if (this.grid.isEmpty(x, y - 1)) {
            if (Math.random() < 0.08) {
                this.grid.set(x, y - 1, createParticle('smoke', x, y - 1));
            } else if (Math.random() < 0.04) {
                this.grid.set(x, y - 1, createParticle('spark', x, y - 1));
            }
        }

        // Spread fire to flammable neighbors
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        for (const { p, nx, ny } of neighborList) {
            if (!p) continue;
            const def = ParticleTypes[p.type];

            // Heat up neighboring materials
            if (typeof p.temperature === 'number') {
                const conductivity = def?.conductivity ?? 0.2;
                p.temperature += 10 * conductivity;
            }

            if (def?.flammable) {
                const baseChance = 0.03;
                const flashPoint = def.flashPoint ?? 200;
                const heatFactor = Math.min(1, (particle.temperature || 600) / flashPoint);
                const spreadChance = baseChance * heatFactor * this.fireIntensity;

                if (Math.random() < spreadChance) {
                    if (p.type === 'gunpowder') {
                        this.explode(nx, ny, 5);
                    } else if (p.type === 'c4') {
                        const radius = ParticleTypes.c4?.explosionRadius ?? 9;
                        this.explode(nx, ny, radius);
                    } else if (p.type === 'wood' || p.type === 'plant') {
                        // Combustion of organic material leaves embers
                        if (Math.random() < 0.6) {
                            this.transformParticle(nx, ny, 'ember');
                        } else {
                            this.transformParticle(nx, ny, 'fire');
                        }
                    } else {
                        this.transformParticle(nx, ny, 'fire');
                    }
                }
            }
        }
    }

    handleWater(particle, x, y, neighbors) {
        const neighborList = [neighbors.top, neighbors.bottom, neighbors.left, neighbors.right];

        // Boil into steam near very hot things
        for (const n of neighborList) {
            if (n && (n.type === 'fire' || n.type === 'lava' || n.type === 'molten_metal')) {
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

        // Slowly rust nearby metal in contact with water
        const nearbyMetals = this.grid.getNearbyOfType(x, y, 'metal', 1);
        if (nearbyMetals.length && Math.random() < 0.02) {
            const target = nearbyMetals[Math.floor(Math.random() * nearbyMetals.length)];
            this.transformParticle(target.x, target.y, 'rust');
        }

        // Erode sand into mud where water seeps through
        const nearbySand = this.grid.getNearbyOfType(x, y, 'sand', 1);
        if (nearbySand.length && Math.random() < 0.01) {
            const target = nearbySand[Math.floor(Math.random() * nearbySand.length)];
            this.transformParticle(target.x, target.y, 'mud');
        }
    }

    handleLava(particle, x, y, neighbors) {
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        for (const { p, nx, ny } of neighborList) {
            if (!p) continue;

            // Heat all neighbors
            if (typeof p.temperature === 'number') {
                const conductivity = ParticleTypes[p.type]?.conductivity ?? 0.3;
                p.temperature += 25 * conductivity;
            }

            if (p.type === 'water') {
                // Lava + water = stone + steam
                this.transformParticle(x, y, 'stone');
                this.transformParticle(nx, ny, 'steam');
                return;
            }
            if (p.type === 'ice') {
                this.transformParticle(nx, ny, 'water');
            }
            if (p.type === 'metal') {
                if (Math.random() < 0.4) {
                    this.transformParticle(nx, ny, 'molten_metal');
                }
                continue;
            }
            if (p.type === 'glass') {
                if (Math.random() < 0.3) {
                    this.transformParticle(nx, ny, 'lava');
                }
            }

            if (ParticleTypes[p.type]?.flammable) {
                if (Math.random() < 0.2) {
                    if (p.type === 'gunpowder') {
                        this.explode(nx, ny, 5);
                    } else if (p.type === 'c4') {
                        const radius = ParticleTypes.c4?.explosionRadius ?? 9;
                        this.explode(nx, ny, radius);
                    } else {
                        this.transformParticle(nx, ny, 'fire');
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
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        for (const { p, nx, ny } of neighborList) {
            if (p && ParticleTypes[p.type]?.corrodible) {
                if (Math.random() < 0.1) {
                    if (p.type === 'metal') {
                        this.transformParticle(nx, ny, 'rust');
                    } else {
                        this.grid.remove(nx, ny);
                    }
                    if (Math.random() < 0.3) {
                        this.grid.remove(x, y);
                        return;
                    }
                }
            }
        }
    }

    handleIce(particle, x, y, neighbors) {
        const neighborList = [neighbors.top, neighbors.bottom, neighbors.left, neighbors.right];

        for (const n of neighborList) {
            if (n && (n.type === 'fire' || n.type === 'lava' || n.type === 'molten_metal')) {
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
        // Condense back to water if high up
        if (y < this.height * 0.3 && Math.random() < 0.01) {
            this.transformParticle(x, y, 'water');
        }
    }

    handleSnow(particle, x, y, neighbors) {
        // Melt near heat sources
        if (this.grid.hasNearbyType(x, y, 'fire', 2) ||
            this.grid.hasNearbyType(x, y, 'lava', 2) ||
            this.grid.hasNearbyType(x, y, 'molten_metal', 2)) {
            if (Math.random() < 0.05) {
                this.transformParticle(x, y, 'water');
                return;
            }
        }

        // Slowly melt if temperature rises above freezing
        const temp = particle.temperature || -5;
        if (temp > 0 && Math.random() < 0.01) {
            this.transformParticle(x, y, 'water');
            return;
        }

        // Compaction: deep snow can become ice
        if (this.grid.hasNearbyType(x, y, 'snow', 1) &&
            this.grid.hasNearbyType(x, y + 1, 'snow', 0)) {
            if (Math.random() < 0.003) {
                this.transformParticle(x, y, 'ice');
            }
        }
    }

    handleMud(particle, x, y, neighbors) {
        // Mud slowly dries into sand when away from water
        const nearWater = this.grid.hasNearbyType(x, y, 'water', 2);
        if (!nearWater && Math.random() < 0.002) {
            this.transformParticle(x, y, 'sand');
            return;
        }

        // If deep and compacted, mud can harden into stone
        const nearMud = this.grid.hasNearbyType(x, y, 'mud', 1);
        if (nearMud && !nearWater && Math.random() < 0.0008) {
            this.transformParticle(x, y, 'stone');
        }
    }

    handleUranium(particle, x, y, neighbors) {
        // Uranium continuously heats itself a little
        particle.temperature = (particle.temperature || 20) + 0.1;

        const neighborList = [
            neighbors.top,
            neighbors.bottom,
            neighbors.left,
            neighbors.right
        ];

        for (const n of neighborList) {
            if (!n) continue;
            const def = ParticleTypes[n.type];
            if (!def) continue;

            // Irradiate neighbors: raise temperature
            if (typeof n.temperature === 'number') {
                n.temperature += 0.5;
            } else {
                n.temperature = 30;
            }

            // Occasional ignition of flammables
            if (def.flammable && Math.random() < 0.002) {
                if (n.type === 'gunpowder' || n.type === 'c4') {
                    this.explode(n.x, n.y, n.type === 'c4' ? 9 : 5);
                } else {
                    this.transformParticle(n.x, n.y, 'fire');
                }
            }

            // Sand near uranium can slowly vitrify into glass
            if (n.type === 'sand' && Math.random() < 0.0008) {
                this.transformParticle(n.x, n.y, 'glass');
            }

            // Plants near uranium wither into ash
            if (n.type === 'plant' && Math.random() < 0.002) {
                this.transformParticle(n.x, n.y, 'ash');
            }
        }
    }

    handleMetal(particle, x, y, neighbors) {
        const neighborList = [neighbors.top, neighbors.bottom, neighbors.left, neighbors.right];

        for (const n of neighborList) {
            if (!n) continue;
            if (n.type === 'water' || n.type === 'steam') {
                const isHot = (particle.temperature || 20) > 80;
                const chance = isHot ? 0.05 : 0.01;
                if (Math.random() < chance) {
                    this.transformParticle(x, y, 'rust');
                    return;
                }
            }
        }
    }

    handleMoltenMetal(particle, x, y, neighbors) {
        const neighborList = [
            { p: neighbors.top, nx: x, ny: y - 1 },
            { p: neighbors.bottom, nx: x, ny: y + 1 },
            { p: neighbors.left, nx: x - 1, ny: y },
            { p: neighbors.right, nx: x + 1, ny: y },
        ];

        // Quench in contact with water
        for (const { p, nx, ny } of neighborList) {
            if (p && p.type === 'water') {
                if (Math.random() < 0.5) {
                    this.transformParticle(x, y, 'metal');
                    this.transformParticle(nx, ny, 'steam');
                    return;
                }
            }
        }

        // Cool back into solid metal over time
        if ((particle.temperature || 20) < 400) {
            this.transformParticle(x, y, 'metal');
        }
    }

    handleEmber(particle, x, y, neighbors) {
        // Embers slowly shed ash below
        if (this.grid.isEmpty(x, y + 1) && Math.random() < 0.05) {
            this.grid.set(x, y + 1, createParticle('ash', x, y + 1));
        }

        // When cooled sufficiently, become ash
        if ((particle.temperature || 20) < 180) {
            this.transformParticle(x, y, 'ash');
        }
    }

    handleSpark(particle, x, y, neighbors) {
        const neighborList = [
            neighbors.top,
            neighbors.bottom,
            neighbors.left,
            neighbors.right
        ];

        for (const n of neighborList) {
            if (!n) continue;
            const def = ParticleTypes[n.type];
            if (def?.flammable) {
                if (n.type === 'gunpowder') {
                    this.explode(n.x, n.y, 4);
                } else if (n.type === 'c4') {
                    const radius = ParticleTypes.c4?.explosionRadius ?? 9;
                    this.explode(n.x, n.y, radius);
                } else {
                    this.transformParticle(n.x, n.y, 'fire');
                }
                // Spark is consumed after igniting something
                this.grid.remove(x, y);
                return;
            }
        }
    }

    // Directional fan that pushes nearby light materials along a straight path
    handleFan(particle, x, y, dirX, dirY) {
        const maxDistance = 6;

        for (let i = 1; i <= maxDistance; i++) {
            const tx = x + dirX * i;
            const ty = y + dirY * i;

            if (!this.grid.inBounds(tx, ty)) break;

            const target = this.grid.get(tx, ty);
            if (!target) continue;

            const def = ParticleTypes[target.type];
            if (!def) continue;

            // Push light powders, gases and liquids
            if (
                def.state === ParticleState.POWDER ||
                def.state === ParticleState.GAS ||
                def.state === ParticleState.LIQUID
            ) {
                const nx = tx + dirX;
                const ny = ty + dirY;

                if (!this.grid.inBounds(nx, ny)) continue;
                if (!this.grid.isEmpty(nx, ny)) continue;

                this.grid.move(tx, ty, nx, ny);
                target.updated = true;
            }
        }
    }

    // Singularity-style gravity well that pulls in nearby matter
    handleVoid(particle, x, y) {
        const radius = 8;
        const radius2 = radius * radius;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0) continue;
                const dist2 = dx * dx + dy * dy;
                if (dist2 > radius2) continue;

                const tx = x + dx;
                const ty = y + dy;
                if (!this.grid.inBounds(tx, ty)) continue;

                const target = this.grid.get(tx, ty);
                if (!target) continue;
                if (target.type === 'void') continue;

                // Close particles are simply consumed
                if (dist2 <= 2) {
                    this.grid.remove(tx, ty);
                    continue;
                }

                // With some probability, pull the particle one step toward the void
                if (Math.random() < 0.35) {
                    const stepX = x - tx;
                    const stepY = y - ty;
                    let nx = tx;
                    let ny = ty;

                    if (Math.abs(stepX) > Math.abs(stepY)) {
                        nx += stepX > 0 ? 1 : -1;
                    } else {
                        ny += stepY > 0 ? 1 : -1;
                    }

                    if (!this.grid.inBounds(nx, ny)) continue;
                    if (!this.grid.isEmpty(nx, ny)) continue;

                    this.grid.move(tx, ty, nx, ny);
                }
            }
        }
    }

    // Trigger a lightning strike at a given x-coordinate
    strikeLightning(startX) {
        let x = Math.floor(startX);
        if (x < 0 || x >= this.width) {
            x = Math.max(0, Math.min(this.width - 1, x));
        }

        let hitX = x;
        let hitY = null;

        for (let y = 0; y < this.height; y++) {
            if (!this.grid.inBounds(x, y)) break;

            const particle = this.grid.get(x, y);

            // Draw a visual spark along the path through empty space
            if (!particle && this.grid.isEmpty(x, y)) {
                this.grid.set(x, y, createParticle('spark', x, y));
            }

            if (particle) {
                hitX = x;
                hitY = y;
                this.zapCell(hitX, hitY, particle);
                break;
            }
        }

        // If nothing was hit, no further effect
        if (hitY === null) return;
    }

    // Apply lightning effects to a single impacted cell
    zapCell(x, y, particle) {
        const def = ParticleTypes[particle.type];
        if (!def) return;

        // Strong heating
        if (typeof particle.temperature === 'number') {
            particle.temperature += 400;
        } else {
            particle.temperature = 400;
        }

        // Flammables can ignite or explode
        if (def.flammable) {
            if (particle.type === 'gunpowder') {
                this.explode(x, y, 6);
            } else if (particle.type === 'c4') {
                const radius = ParticleTypes.c4?.explosionRadius ?? 9;
                this.explode(x, y, radius);
            } else {
                this.transformParticle(x, y, 'fire');
            }
        }

        // Conductive materials propagate a small arc network
        const conductivity = def.conductivity ?? 0;
        if (conductivity > 0.4) {
            this.zapConductorNetwork(x, y);
        }

        // Water rapidly vaporizes
        if (particle.type === 'water' && Math.random() < 0.7) {
            this.transformParticle(x, y, 'steam');
        }
    }

    // Spread lightning along connected conductors (metal, water, etc.)
    zapConductorNetwork(startX, startY) {
        const queue = [{ x: startX, y: startY }];
        const visited = new Set();
        const key = (xx, yy) => `${xx},${yy}`;
        const maxNodes = 80;
        let processed = 0;

        while (queue.length && processed < maxNodes) {
            const { x, y } = queue.shift();
            const k = key(x, y);
            if (visited.has(k)) continue;
            visited.add(k);
            processed++;

            const p = this.grid.get(x, y);
            if (!p) continue;
            const def = ParticleTypes[p.type];
            if (!def) continue;

            const conductivity = def.conductivity ?? 0;
            if (conductivity <= 0.4) continue;

            // Heat conductor
            if (typeof p.temperature === 'number') {
                p.temperature += 250 * conductivity;
            } else {
                p.temperature = 250;
            }

            // Small chance to melt metal
            if (p.type === 'metal' && Math.random() < 0.15) {
                this.transformParticle(x, y, 'molten_metal');
            }

            // Ignite nearby flammables around each conductor
            const neighbors = this.grid.getNeighbors(x, y);
            for (const [nx, ny] of [
                [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]
            ]) {
                if (!this.grid.inBounds(nx, ny)) continue;
                const n = this.grid.get(nx, ny);
                if (!n) continue;
                const nDef = ParticleTypes[n.type];
                if (!nDef) continue;
                if (nDef.flammable && Math.random() < 0.08) {
                    if (n.type === 'gunpowder') {
                        this.explode(nx, ny, 4);
                    } else {
                        this.transformParticle(nx, ny, 'fire');
                    }
                }
            }

            // Enqueue neighboring conductors
            for (const [nx, ny] of [
                [x, y - 1], [x, y + 1],
                [x - 1, y], [x + 1, y]
            ]) {
                if (!this.grid.inBounds(nx, ny)) continue;
                const nn = this.grid.get(nx, ny);
                if (!nn) continue;
                const nnDef = ParticleTypes[nn.type];
                if (!nnDef) continue;
                const nnCond = nnDef.conductivity ?? 0;
                if (nnCond > 0.4 && !visited.has(key(nx, ny))) {
                    queue.push({ x: nx, y: ny });
                }
            }
        }
    }

    // Try to move particle to new position
    tryMove(particle, fromX, fromY, toX, toY) {
        if (!this.grid.inBounds(toX, toY)) return false;

        const target = this.grid.get(toX, toY);

        // Teleport through portals instead of blocking movement
        if (target && (target.type === 'portal_blue' || target.type === 'portal_orange')) {
            return this.teleportThroughPortal(particle, fromX, fromY, toX, toY, target);
        }

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

                    if (dist < radius * 0.5) {
                        this.grid.remove(px, py);
                        if (Math.random() < 0.5) {
                            this.grid.set(px, py, createParticle('fire', px, py));
                        }
                    } else if (particle) {
                        if (ParticleTypes[particle.type]?.flammable) {
                            if (particle.type === 'gunpowder') {
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

        if (type === 'portal_blue' || type === 'portal_orange') {
            this.portals[type] = { x, y };
        }
    }

    // Spawn rain from the top of the world
    spawnRain() {
        const drops = Math.max(1, Math.floor(this.width * 0.04));
        for (let i = 0; i < drops; i++) {
            const x = Math.floor(Math.random() * this.width);
            const y = 0;
            if (this.grid.isEmpty(x, y)) {
                this.grid.set(x, y, createParticle('water', x, y));
            }
        }
    }

    // Spawn snowflakes from the top
    spawnSnow() {
        const flakes = Math.max(1, Math.floor(this.width * 0.03));
        for (let i = 0; i < flakes; i++) {
            const x = Math.floor(Math.random() * this.width);
            const y = 0;
            if (this.grid.isEmpty(x, y)) {
                this.grid.set(x, y, createParticle('snow', x, y));
            }
        }
    }

    // Add particles in a brush area
    addBrush(centerX, centerY, type, size) {
        for (let dx = -size; dx <= size; dx++) {
            for (let dy = -size; dy <= size; dy++) {
                if (dx * dx + dy * dy <= size * size) {
                    const x = centerX + dx;
                    const y = centerY + dy;

                    if (Math.random() < 0.7) {
                        this.addParticle(x, y, type);
                    }
                }
            }
        }
    }

    // Capture a lightweight snapshot of the current scene (type grid only)
    captureSnapshot() {
        const types = new Array(this.grid.cells.length);
        for (let i = 0; i < this.grid.cells.length; i++) {
            const p = this.grid.cells[i];
            types[i] = p ? p.type : null;
        }
        return {
            width: this.width,
            height: this.height,
            types
        };
    }

    // Restore a snapshot created by captureSnapshot
    restoreSnapshot(snapshot) {
        if (!snapshot) return;
        if (snapshot.width !== this.width || snapshot.height !== this.height) return;
        if (!Array.isArray(snapshot.types) || snapshot.types.length !== this.grid.cells.length) return;

        this.clear();

        let index = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const type = snapshot.types[index++];
                if (type) {
                    this.addParticle(x, y, type);
                }
            }
        }
    }

    // Simple preset scenes to quickly showcase behaviors without heavy cost
    loadPreset(name) {
        this.clear();

        if (name === 'volcano') {
            const baseY = Math.floor(this.height * 0.75);
            const centerX = Math.floor(this.width / 2);
            const radius = Math.floor(this.width * 0.12);

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = 0; dy <= radius; dy++) {
                    const x = centerX + dx;
                    const y = baseY + dy;
                    if (!this.grid.inBounds(x, y)) continue;
                    if (Math.abs(dx) + dy < radius * 1.1) {
                        this.grid.set(x, y, createParticle('stone', x, y));
                    }
                }
            }

            for (let y = baseY - 4; y < baseY; y++) {
                for (let x = centerX - 4; x <= centerX + 4; x++) {
                    if (this.grid.inBounds(x, y)) {
                        this.grid.set(x, y, createParticle('lava', x, y));
                    }
                }
            }
        } else if (name === 'waterfall') {
            const ledgeY = Math.floor(this.height * 0.3);
            const ledgeXEnd = Math.floor(this.width * 0.6);

            for (let x = 0; x <= ledgeXEnd; x++) {
                for (let h = 0; h < 3; h++) {
                    const y = ledgeY + h;
                    this.grid.set(x, y, createParticle('stone', x, y));
                }
            }

            for (let x = Math.floor(this.width * 0.65); x < this.width; x++) {
                for (let y = this.height - 6; y < this.height; y++) {
                    this.grid.set(x, y, createParticle('stone', x, y));
                }
            }

            for (let y = ledgeY - 8; y < ledgeY - 2; y++) {
                for (let x = 2; x < 10; x++) {
                    this.grid.set(x, y, createParticle('water', x, y));
                }
            }
        }
    }

    // Erase particles in a brush area
    eraseBrush(centerX, centerY, size) {
        for (let dx = -size; dx <= size; dx++) {
            for (let dy = -size; dy <= size; dy++) {
                if (dx * dx + dy * dy <= size * size) {
                    const x = centerX + dx;
                    const y = centerY + dy;
                    const particle = this.grid.get(x, y);

                    // Keep portal bookkeeping in sync when erased
                    if (particle && (particle.type === 'portal_blue' || particle.type === 'portal_orange')) {
                        const info = this.portals[particle.type];
                        if (info && info.x === x && info.y === y) {
                            this.portals[particle.type] = null;
                        }
                    }

                    this.grid.remove(x, y);
                }
            }
        }
    }

    // Clear all particles
    clear() {
        this.grid.clear();
        this.portals.portal_blue = null;
        this.portals.portal_orange = null;
    }

    // Adjust global intensity (gravity + fire)
    setIntensity(multiplier) {
        const m = Math.max(0.2, Math.min(multiplier, 3));
        this.fireIntensity = m;
        this.gravity = 0.25 * m;
    }

    // Set global wind (-1 to 1)
    setWind(amount) {
        this.windX = Math.max(-1, Math.min(1, amount || 0));
    }

    // Adjust simulation speed (steps per frame)
    setSpeed(multiplier) {
        const m = Math.max(0.25, Math.min(multiplier, 4));
        const steps = Math.round(m * 1);
        this.stepsPerFrame = Math.max(1, steps);
    }

    // Toggle weather systems
    setRainEnabled(enabled) {
        this.rainEnabled = !!enabled;
    }

    setSnowEnabled(enabled) {
        this.snowEnabled = !!enabled;
    }

    setTemperatureEnabled(enabled) {
        this.temperatureEnabled = !!enabled;
    }

    // Compute a surface normal for a portal tile based on nearby solids
    getPortalNormal(x, y) {
        const neighbors = this.grid.getNeighbors(x, y);

        // Prefer a solid "wall" tile and point away from it
        if (neighbors.top && ParticleTypes[neighbors.top.type]?.state === ParticleState.SOLID) {
            return { x: 0, y: 1 }; // wall above, portal faces down
        }
        if (neighbors.bottom && ParticleTypes[neighbors.bottom.type]?.state === ParticleState.SOLID) {
            return { x: 0, y: -1 }; // wall below, portal faces up
        }
        if (neighbors.left && ParticleTypes[neighbors.left.type]?.state === ParticleState.SOLID) {
            return { x: 1, y: 0 }; // wall left, portal faces right
        }
        if (neighbors.right && ParticleTypes[neighbors.right.type]?.state === ParticleState.SOLID) {
            return { x: -1, y: 0 }; // wall right, portal faces left
        }

        // Default orientation: facing up
        return { x: 0, y: -1 };
    }

    // Teleport a moving particle through a portal, preserving velocity with orientation
    teleportThroughPortal(particle, fromX, fromY, portalX, portalY, portalTile) {
        const type = portalTile.type;
        const otherType = type === 'portal_blue' ? 'portal_orange' : 'portal_blue';
        const exitInfo = this.portals[otherType];

        // Need a matching portal to teleport
        if (!exitInfo) return false;

        const exitPortal = this.grid.get(exitInfo.x, exitInfo.y);
        if (!exitPortal || exitPortal.type !== otherType) return false;

        // Entry / exit orientation
        const entryNormal = this.getPortalNormal(portalX, portalY);
        const exitNormal = this.getPortalNormal(exitInfo.x, exitInfo.y);
        const entryTangent = { x: -entryNormal.y, y: entryNormal.x };
        const exitTangent = { x: -exitNormal.y, y: exitNormal.x };

        // Map velocity into portal's local frame and back out
        const vx = particle.velocityX || 0;
        const vy = particle.velocityY || 0;
        const vN = vx * entryNormal.x + vy * entryNormal.y;
        const vT = vx * entryTangent.x + vy * entryTangent.y;

        const outVx = vN * exitNormal.x + vT * exitTangent.x;
        const outVy = vN * exitNormal.y + vT * exitTangent.y;

        particle.velocityX = outVx;
        particle.velocityY = outVy;

        // Spawn position just outside the exit portal along its facing direction
        let outX = exitInfo.x + exitNormal.x;
        let outY = exitInfo.y + exitNormal.y;

        if (!this.grid.inBounds(outX, outY) || !this.grid.isEmpty(outX, outY)) {
            // If blocked, try the portal cell itself as a last resort
            outX = exitInfo.x;
            outY = exitInfo.y;
            if (!this.grid.isEmpty(outX, outY)) {
                return false;
            }
        }

        // Move the particle directly to the exit
        this.grid.remove(fromX, fromY);
        this.grid.set(outX, outY, particle);
        particle.updated = true;
        return true;
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
