import { readFile } from 'fs/promises';
import path from 'path';

export interface UIAnalysis {
  timestamp: string;
  screenshotPath: string;
  issues: UIIssue[];
  suggestions: string[];
  score: number; // 0-100
}

export interface UIIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'color' | 'spacing' | 'typography' | 'layout' | 'accessibility' | 'performance';
  description: string;
  location?: { x: number; y: number; width: number; height: number };
}

/**
 * Analyzes a screenshot for UI/UX issues
 */
export async function analyzeScreenshot(screenshotPath: string): Promise<UIAnalysis> {
  const issues: UIIssue[] = [];
  const suggestions: string[] = [];

  // Basic file analysis
  const stats = await getImageStats(screenshotPath);

  // Check for common UI issues
  if (stats.fileSize > 1024 * 1024) { // > 1MB
    issues.push({
      severity: 'warning',
      category: 'performance',
      description: `Large screenshot size (${(stats.fileSize / 1024 / 1024).toFixed(2)}MB). Consider optimizing images.`
    });
  }

  // Analyze dimensions
  if (stats.width && stats.height) {
    const aspectRatio = stats.width / stats.height;

    if (aspectRatio < 0.4 || aspectRatio > 0.6) {
      issues.push({
        severity: 'info',
        category: 'layout',
        description: `Unusual aspect ratio (${aspectRatio.toFixed(2)}). Check if content is properly responsive.`
      });
    }

    // Check for mobile-friendly sizes
    if (stats.width < 320) {
      issues.push({
        severity: 'warning',
        category: 'layout',
        description: 'Viewport width is very small. Ensure minimum touch targets are 44x44px.'
      });
    }
  }

  // Generate suggestions based on issues
  if (issues.length === 0) {
    suggestions.push('UI looks good! No major issues detected.');
  } else {
    suggestions.push('Review the detected issues and prioritize fixes based on severity.');

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    if (criticalCount > 0) {
      suggestions.push(`${criticalCount} critical issue(s) require immediate attention.`);
    }
  }

  // Calculate score (100 - penalties)
  const criticalPenalty = issues.filter(i => i.severity === 'critical').length * 20;
  const warningPenalty = issues.filter(i => i.severity === 'warning').length * 10;
  const infoPenalty = issues.filter(i => i.severity === 'info').length * 5;

  const score = Math.max(0, 100 - criticalPenalty - warningPenalty - infoPenalty);

  return {
    timestamp: new Date().toISOString(),
    screenshotPath,
    issues,
    suggestions,
    score
  };
}

async function getImageStats(filePath: string) {
  const stats = await import('fs').then(fs => fs.promises.stat(filePath));

  // Try to get image dimensions from filename or metadata
  // For PNG files, we can read basic metadata
  const buffer = await readFile(filePath);

  let width: number | undefined;
  let height: number | undefined;

  // PNG signature check
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    // Read IHDR chunk for dimensions
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  }

  return {
    fileSize: stats.size,
    width,
    height,
    created: stats.birthtime
  };
}

/**
 * Compare two screenshots and identify differences
 */
export async function compareScreenshots(
  beforePath: string,
  afterPath: string
): Promise<{
  different: boolean;
  percentDiff: number;
  message: string;
}> {
  const beforeStats = await getImageStats(beforePath);
  const afterStats = await getImageStats(afterPath);

  // Simple size-based comparison
  const sizeDiff = Math.abs(beforeStats.fileSize - afterStats.fileSize);
  const percentDiff = (sizeDiff / beforeStats.fileSize) * 100;

  return {
    different: percentDiff > 1,
    percentDiff,
    message: percentDiff > 10
      ? `Significant UI changes detected (${percentDiff.toFixed(1)}% different)`
      : percentDiff > 1
      ? `Minor UI changes detected (${percentDiff.toFixed(1)}% different)`
      : 'UI appears unchanged'
  };
}

/**
 * Generate a detailed report from analysis
 */
export function generateReport(analysis: UIAnalysis): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('           UI SCREENSHOT ANALYSIS REPORT');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`📸 Screenshot: ${path.basename(analysis.screenshotPath)}`);
  lines.push(`⏰ Analyzed: ${new Date(analysis.timestamp).toLocaleString()}`);
  lines.push(`📊 Quality Score: ${analysis.score}/100 ${getScoreEmoji(analysis.score)}`);
  lines.push('');

  if (analysis.issues.length > 0) {
    lines.push('🔍 ISSUES DETECTED:');
    lines.push('───────────────────────────────────────────────────────');

    const grouped = groupBy(analysis.issues, i => i.category);

    for (const [category, categoryIssues] of Object.entries(grouped)) {
      lines.push('');
      lines.push(`  ${getCategoryIcon(category)} ${category.toUpperCase()}`);

      for (const issue of categoryIssues) {
        const icon = getSeverityIcon(issue.severity);
        lines.push(`    ${icon} ${issue.description}`);
      }
    }
  } else {
    lines.push('✅ NO ISSUES DETECTED');
    lines.push('   Your UI is looking great!');
  }

  if (analysis.suggestions.length > 0) {
    lines.push('');
    lines.push('💡 SUGGESTIONS:');
    lines.push('───────────────────────────────────────────────────────');
    analysis.suggestions.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s}`);
    });
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');

  return lines.join('\n');
}

function getScoreEmoji(score: number): string {
  if (score >= 90) return '🌟';
  if (score >= 75) return '✨';
  if (score >= 60) return '⚠️';
  return '❌';
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'warning': return '🟡';
    case 'info': return '🔵';
    default: return '⚪';
  }
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case 'color': return '🎨';
    case 'spacing': return '📏';
    case 'typography': return '📝';
    case 'layout': return '📐';
    case 'accessibility': return '♿';
    case 'performance': return '⚡';
    default: return '📋';
  }
}

function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
