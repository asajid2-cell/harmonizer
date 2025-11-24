// Grid system for particle simulation
// Uses a flat array for performance with helper methods for 2D access

export class Grid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.cells = new Array(width * height).fill(null);
        this.updateOrder = []; // Randomized update order to prevent directional bias
        this.dirtyRegions = new Set(); // Track which chunks need re-rendering
        this.chunkSize = 16;

        this.initUpdateOrder();
    }

    initUpdateOrder() {
        // Create array of all indices
        this.updateOrder = [];
        for (let i = 0; i < this.width * this.height; i++) {
            this.updateOrder.push(i);
        }
    }

    // Shuffle update order to prevent bias (Fisher-Yates)
    shuffleUpdateOrder() {
        for (let i = this.updateOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.updateOrder[i], this.updateOrder[j]] = [this.updateOrder[j], this.updateOrder[i]];
        }
    }

    // Convert 2D coords to 1D index
    getIndex(x, y) {
        return y * this.width + x;
    }

    // Convert 1D index to 2D coords
    getCoords(index) {
        return {
            x: index % this.width,
            y: Math.floor(index / this.width)
        };
    }

    // Check if coordinates are within bounds
    inBounds(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    // Get particle at position
    get(x, y) {
        if (!this.inBounds(x, y)) return null;
        return this.cells[this.getIndex(x, y)];
    }

    // Set particle at position
    set(x, y, particle) {
        if (!this.inBounds(x, y)) return false;
        const index = this.getIndex(x, y);
        this.cells[index] = particle;
        if (particle) {
            particle.x = x;
            particle.y = y;
        }
        this.markDirty(x, y);
        return true;
    }

    // Check if cell is empty
    isEmpty(x, y) {
        if (!this.inBounds(x, y)) return false;
        return this.cells[this.getIndex(x, y)] === null;
    }

    // Swap two particles
    swap(x1, y1, x2, y2) {
        if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) return false;

        const idx1 = this.getIndex(x1, y1);
        const idx2 = this.getIndex(x2, y2);

        const temp = this.cells[idx1];
        this.cells[idx1] = this.cells[idx2];
        this.cells[idx2] = temp;

        // Update particle positions
        if (this.cells[idx1]) {
            this.cells[idx1].x = x1;
            this.cells[idx1].y = y1;
        }
        if (this.cells[idx2]) {
            this.cells[idx2].x = x2;
            this.cells[idx2].y = y2;
        }

        this.markDirty(x1, y1);
        this.markDirty(x2, y2);

        return true;
    }

    // Move particle from one position to another
    move(fromX, fromY, toX, toY) {
        if (!this.inBounds(fromX, fromY) || !this.inBounds(toX, toY)) return false;
        if (!this.isEmpty(toX, toY)) return false;

        const particle = this.get(fromX, fromY);
        if (!particle) return false;

        this.set(fromX, fromY, null);
        this.set(toX, toY, particle);

        return true;
    }

    // Remove particle at position
    remove(x, y) {
        if (!this.inBounds(x, y)) return;
        this.cells[this.getIndex(x, y)] = null;
        this.markDirty(x, y);
    }

    // Mark a chunk as dirty for re-rendering
    markDirty(x, y) {
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkY = Math.floor(y / this.chunkSize);
        this.dirtyRegions.add(`${chunkX},${chunkY}`);
    }

    // Clear all dirty regions
    clearDirty() {
        this.dirtyRegions.clear();
    }

    // Get all dirty chunk coordinates
    getDirtyChunks() {
        return Array.from(this.dirtyRegions).map(key => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });
    }

    // Clear entire grid
    clear() {
        this.cells.fill(null);
        // Mark everything as dirty
        for (let x = 0; x < Math.ceil(this.width / this.chunkSize); x++) {
            for (let y = 0; y < Math.ceil(this.height / this.chunkSize); y++) {
                this.dirtyRegions.add(`${x},${y}`);
            }
        }
    }

    // Count total particles
    countParticles() {
        let count = 0;
        for (let i = 0; i < this.cells.length; i++) {
            if (this.cells[i] !== null) count++;
        }
        return count;
    }

    // Get neighbors of a cell
    getNeighbors(x, y) {
        return {
            top: this.get(x, y - 1),
            bottom: this.get(x, y + 1),
            left: this.get(x - 1, y),
            right: this.get(x + 1, y),
            topLeft: this.get(x - 1, y - 1),
            topRight: this.get(x + 1, y - 1),
            bottomLeft: this.get(x - 1, y + 1),
            bottomRight: this.get(x + 1, y + 1)
        };
    }

    // Check if there's a particle of specific type nearby
    hasNearbyType(x, y, type, radius = 1) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0) continue;
                const particle = this.get(x + dx, y + dy);
                if (particle && particle.type === type) return true;
            }
        }
        return false;
    }

    // Get all particles of a specific type nearby
    getNearbyOfType(x, y, type, radius = 1) {
        const results = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0) continue;
                const particle = this.get(x + dx, y + dy);
                if (particle && particle.type === type) {
                    results.push({ particle, x: x + dx, y: y + dy });
                }
            }
        }
        return results;
    }
}
