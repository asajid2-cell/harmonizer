// Particle type definitions and behaviors

// Particle states
export const ParticleState = {
    SOLID: 'solid',
    POWDER: 'powder',
    LIQUID: 'liquid',
    GAS: 'gas'
};

// Base particle class
export class Particle {
    constructor(type, x = 0, y = 0) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.updated = false; // Prevent multiple updates per frame
        this.lifetime = -1; // -1 = infinite
        this.temperature = 20; // Celsius
        this.velocityX = 0;
        this.velocityY = 0;
    }
}

// Particle type definitions
export const ParticleTypes = {
    sand: {
        name: 'Sand',
        state: ParticleState.POWDER,
        density: 1.5,
        color: () => {
            const base = [194, 178, 128];
            const variation = 20;
            return [
                base[0] + Math.random() * variation - variation/2,
                base[1] + Math.random() * variation - variation/2,
                base[2] + Math.random() * variation - variation/2
            ];
        },
        flammable: false,
        corrodible: true,
        conductivity: 0.1,
        meltPoint: 1700,
        boilPoint: 2230
    },

    water: {
        name: 'Water',
        state: ParticleState.LIQUID,
        density: 1.0,
        color: () => [74, 144, 226, 180],
        flammable: false,
        corrodible: false,
        conductivity: 0.6,
        freezePoint: 0,
        boilPoint: 100,
        dispersion: 5 // How far liquid spreads
    },

    stone: {
        name: 'Stone',
        state: ParticleState.SOLID,
        density: 2.5,
        color: () => {
            const gray = 100 + Math.random() * 40;
            return [gray, gray, gray];
        },
        flammable: false,
        corrodible: true,
        conductivity: 0.2,
        meltPoint: 1200
    },

    fire: {
        name: 'Fire',
        state: ParticleState.GAS,
        density: 0.1,
        color: () => {
            const colors = [
                [255, 100, 0],
                [255, 150, 0],
                [255, 200, 50],
                [255, 80, 0]
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        },
        flammable: false,
        lifetime: 30 + Math.random() * 30,
        temperature: 600,
        emitsLight: true,
        lightRadius: 16,
        lightIntensity: 1.0
    },

    smoke: {
        name: 'Smoke',
        state: ParticleState.GAS,
        density: 0.05,
        color: () => {
            const gray = 60 + Math.random() * 30;
            return [gray, gray, gray, 150];
        },
        flammable: false,
        lifetime: 100 + Math.random() * 100
    },

    oil: {
        name: 'Oil',
        state: ParticleState.LIQUID,
        density: 0.8,
        color: () => [74, 55, 40],
        flammable: true,
        flashPoint: 200,
        dispersion: 4
    },

    acid: {
        name: 'Acid',
        state: ParticleState.LIQUID,
        density: 1.2,
        color: () => [127, 255, 0, 200],
        flammable: false,
        corrosive: true,
        dispersion: 3
    },

    lava: {
        name: 'Lava',
        state: ParticleState.LIQUID,
        density: 3.0,
        color: () => {
            const colors = [
                [255, 69, 0],
                [255, 100, 0],
                [255, 50, 0],
                [200, 50, 0]
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        },
        flammable: false,
        temperature: 1000,
        emitsLight: true,
        dispersion: 2,
        lightRadius: 26,
        lightIntensity: 1.2
    },

    ice: {
        name: 'Ice',
        state: ParticleState.SOLID,
        density: 0.9,
        color: () => [165, 242, 243, 220],
        flammable: false,
        temperature: -10,
        meltPoint: 0
    },

    snow: {
        name: 'Snow',
        state: ParticleState.POWDER,
        density: 0.3,
        color: () => {
            const base = 235;
            const variation = 15;
            const v = base + Math.random() * variation - variation / 2;
            return [v, v, 255, 230];
        },
        flammable: false,
        temperature: -5
    },

    steam: {
        name: 'Steam',
        state: ParticleState.GAS,
        density: 0.02,
        color: () => [220, 220, 220, 100],
        flammable: false,
        condensationPoint: 100,
        lifetime: 200 + Math.random() * 100
    },

    mud: {
        name: 'Mud',
        state: ParticleState.LIQUID,
        density: 1.4,
        color: () => {
            const base = [110, 80, 55];
            return [
                base[0] + Math.random() * 20 - 10,
                base[1] + Math.random() * 20 - 10,
                base[2] + Math.random() * 10 - 5
            ];
        },
        flammable: false,
        corrodible: false,
        dispersion: 2,
        driesOut: true
    },

    gunpowder: {
        name: 'Gunpowder',
        state: ParticleState.POWDER,
        density: 1.3,
        color: () => {
            const gray = 40 + Math.random() * 20;
            return [gray, gray, gray];
        },
        flammable: true,
        explosive: true,
        flashPoint: 100
    },

    wood: {
        name: 'Wood',
        state: ParticleState.SOLID,
        density: 0.7,
        color: () => {
            const base = [139, 69, 19];
            return [
                base[0] + Math.random() * 30 - 15,
                base[1] + Math.random() * 20 - 10,
                base[2] + Math.random() * 10 - 5
            ];
        },
        flammable: true,
        flashPoint: 300,
        corrodible: true
    },

    plant: {
        name: 'Plant',
        state: ParticleState.SOLID,
        density: 0.5,
        color: () => {
            const base = [34, 139, 34];
            return [
                base[0] + Math.random() * 40 - 20,
                base[1] + Math.random() * 40 - 20,
                base[2] + Math.random() * 20 - 10
            ];
        },
        flammable: true,
        flashPoint: 200,
        grows: true
    },

    // Generic structural metal – heavy, conducts heat, corrodes in acid
    metal: {
        name: 'Metal',
        state: ParticleState.SOLID,
        density: 7.8,
        color: () => {
            const base = 150;
            const variation = 25;
            const v = base + Math.random() * variation - variation / 2;
            return [v, v + 5, v + 10];
        },
        flammable: false,
        corrodible: true,
        conductivity: 0.95,
        meltPoint: 1500
    },

    // Molten metal – created when metal is heated by lava/fire
    molten_metal: {
        name: 'Molten Metal',
        state: ParticleState.LIQUID,
        density: 7.2,
        color: () => {
            const colors = [
                [255, 230, 180],
                [255, 210, 140],
                [255, 200, 120]
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        },
        flammable: false,
        temperature: 1200,
        emitsLight: true,
        dispersion: 1,
        lightRadius: 22,
        lightIntensity: 1.1
    },

    // Rust – powdery byproduct of metal + water/acid
    rust: {
        name: 'Rust',
        state: ParticleState.POWDER,
        density: 2.5,
        color: () => {
            const base = [183, 65, 14];
            return [
                base[0] + Math.random() * 20 - 10,
                base[1] + Math.random() * 15 - 7,
                base[2] + Math.random() * 15 - 7
            ];
        },
        flammable: false,
        corrodible: false
    },

    // Glass – brittle solid that can melt near lava
    glass: {
        name: 'Glass',
        state: ParticleState.SOLID,
        density: 2.6,
        color: () => [210, 235, 255, 160],
        flammable: false,
        corrodible: false,
        meltPoint: 800
    },

    // Ember – glowing remnant of burned wood/plant
    ember: {
        name: 'Ember',
        state: ParticleState.SOLID,
        density: 0.6,
        color: () => {
            const base = [220, 80, 20];
            return [
                base[0] + Math.random() * 30 - 15,
                base[1] + Math.random() * 20 - 10,
                base[2] + Math.random() * 20 - 10
            ];
        },
        flammable: false,
        temperature: 500,
        emitsLight: true,
        lightRadius: 10,
        lightIntensity: 0.7,
        lifetime: 120 + Math.random() * 120
    },

    // Ash – lightweight powder left by combustion
    ash: {
        name: 'Ash',
        state: ParticleState.POWDER,
        density: 0.2,
        color: () => {
            const gray = 140 + Math.random() * 40;
            return [gray, gray, gray];
        },
        flammable: false,
        corrodible: false
    },

    // Sparks – brief hot gas that helps carry fire upward
    spark: {
        name: 'Spark',
        state: ParticleState.GAS,
        density: 0.01,
        color: () => [255, 230, 180],
        flammable: false,
        temperature: 900,
        emitsLight: true,
        lightRadius: 12,
        lightIntensity: 0.9,
        lifetime: 8 + Math.random() * 6
    }
};

// Create a new particle instance
export function createParticle(type, x, y) {
    const particle = new Particle(type, x, y);
    const typeDef = ParticleTypes[type];

    if (typeDef) {
        particle.color = typeDef.color();
        particle.density = typeDef.density;
        particle.state = typeDef.state;

        if (typeDef.lifetime !== undefined) {
            particle.lifetime = typeDef.lifetime;
        }
        if (typeDef.temperature !== undefined) {
            particle.temperature = typeDef.temperature;
        }
    }

    return particle;
}

// Get color as CSS string
export function getColorString(particle) {
    if (!particle || !particle.color) return 'transparent';
    const c = particle.color;
    if (c.length === 4) {
        return `rgba(${Math.floor(c[0])}, ${Math.floor(c[1])}, ${Math.floor(c[2])}, ${c[3] / 255})`;
    }
    return `rgb(${Math.floor(c[0])}, ${Math.floor(c[1])}, ${Math.floor(c[2])})`;
}

// Check if type A can displace type B (based on density and state)
export function canDisplace(typeA, typeB) {
    const defA = ParticleTypes[typeA];
    const defB = ParticleTypes[typeB];

    if (!defA || !defB) return false;

    // Gases rise through everything
    if (defA.state === ParticleState.GAS && defB.state !== ParticleState.GAS) {
        return false;
    }
    if (defB.state === ParticleState.GAS && defA.state !== ParticleState.GAS) {
        return true;
    }

    // Liquids and powders displace based on density
    if (defA.state !== ParticleState.SOLID && defB.state !== ParticleState.SOLID) {
        return defA.density > defB.density;
    }

    return false;
}
