import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface Issue {
  category: 'Critical' | 'Warning' | 'Info';
  type: string;
  message: string;
}

interface PageResult {
  url: string;
  name: string;
  passed: boolean;
  loadTime: number;
  issues: Issue[];
  metrics: {
    elementCount: number;
    overflowElements: number;
    hiddenElements: number;
    interactiveElements: number;
  };
}

const DESKTOP_VIEWPORT = { width: 1920, height: 1080 }; // Full HD Desktop
const BASE_URL = 'http://localhost:4000';

const PAGES_TO_TEST = [
  { path: '/', name: 'index' },
  { path: '/projects', name: 'projects' },
  { path: '/projects.html', name: 'projects-alt' },
  { path: '/harmonizer.html', name: 'harmonizer' },
  { path: '/ourspace.html', name: 'ourspace' },
  { path: '/eldrichify.html', name: 'eldrichify' },
  { path: '/codesniff.html', name: 'codesniff' },
  { path: '/sand.html', name: 'sand' },
  { path: '/notebook.html', name: 'notebook' },
  { path: '/contact/index.html', name: 'contact' }
];

class DesktopAuditor {
  private browser!: Browser;
  private page!: Page;
  private results: PageResult[] = [];
  private consoleErrors: string[] = [];

  async init() {
    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    this.page = await context.newPage();

    // Capture console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text());
      }
    });

    this.page.on('pageerror', error => {
      this.consoleErrors.push(error.message);
    });
  }

  async testPage(pagePath: string, pageName: string): Promise<PageResult> {
    const url = `${BASE_URL}${pagePath}`;
    console.log(`\n🔍 Testing: ${pageName} (${url})`);

    this.consoleErrors = [];
    const startTime = Date.now();

    try {
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      console.log(`⚠️  Page load warning: ${e}`);
    }

    const loadTime = Date.now() - startTime;

    // Wait for any animations
    await this.page.waitForTimeout(1000);

    const issues: Issue[] = [];

    // 1. Check for horizontal overflow
    const overflow = await this.checkHorizontalOverflow();
    if (overflow.hasOverflow) {
      issues.push({
        category: 'Critical',
        type: 'Layout',
        message: `Horizontal overflow detected: ${overflow.elements.join(', ')}`
      });
    }

    // 2. Check navigation
    const hasNav = await this.page.evaluate(() => {
      return document.querySelector('nav') !== null;
    });
    if (!hasNav) {
      issues.push({
        category: 'Warning',
        type: 'Navigation',
        message: 'No navigation element found'
      });
    }

    // 3. Check text readability (desktop: 14px minimum)
    const textIssues = await this.checkTextSizes(14);
    issues.push(...textIssues);

    // 4. Check for responsive images
    const imageIssues = await this.checkImages();
    issues.push(...imageIssues);

    // 5. Check interactive element sizes (desktop: mouse targets should be comfortable)
    const interactiveIssues = await this.checkInteractiveElements();
    issues.push(...interactiveIssues);

    // 6. Check form inputs
    const formIssues = await this.checkForms();
    issues.push(...formIssues);

    // 7. Check for elements that might cause scrolling issues
    const scrollIssues = await this.checkScrollBehavior();
    issues.push(...scrollIssues);

    // 8. Desktop-specific: Check for layout efficiency
    const layoutIssues = await this.checkLayoutEfficiency();
    issues.push(...layoutIssues);

    // Get metrics
    const metrics = await this.getPageMetrics();

    // Take screenshot
    await this.takeScreenshot(pageName);

    // Log console errors
    if (this.consoleErrors.length > 0) {
      this.consoleErrors.slice(0, 3).forEach(err => {
        console.log(`❌ Console Error: ${err.substring(0, 100)}`);
      });
    }

    const criticalIssues = issues.filter(i => i.category === 'Critical');
    const passed = criticalIssues.length === 0;

    return {
      url,
      name: pageName,
      passed,
      loadTime,
      issues,
      metrics
    };
  }

  private async checkHorizontalOverflow(): Promise<{ hasOverflow: boolean; elements: string[] }> {
    return await this.page.evaluate(() => {
      const elements: string[] = [];
      const viewportWidth = window.innerWidth;

      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();

        // Skip if element is not visible
        if (rect.width === 0 || rect.height === 0) return;

        // Check if element extends beyond viewport (with 5px tolerance)
        if (rect.right > viewportWidth + 5 || rect.left < -5) {
          let identifier = el.tagName.toLowerCase();
          if (el.id) identifier += `#${el.id}`;
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) identifier += `.${classes[0]}`;
          }

          // Only report if it's a significant overflow (more than 10px)
          if (Math.abs(rect.right - viewportWidth) > 10 || rect.left < -10) {
            elements.push(identifier);
          }
        }
      });

      return {
        hasOverflow: elements.length > 0,
        elements: [...new Set(elements)].slice(0, 10)
      };
    });
  }

  private async checkTextSizes(minSize: number): Promise<Issue[]> {
    return await this.page.evaluate((min) => {
      const issues: Issue[] = [];
      const checked = new Set<Element>();

      document.querySelectorAll('*').forEach((el) => {
        if (checked.has(el)) return;

        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);

        // Only check elements with text content
        if (el.textContent && el.textContent.trim().length > 0) {
          // Skip if element is hidden
          if (style.display === 'none' || style.visibility === 'hidden') return;

          // Check if text node is directly in this element
          const hasDirectText = Array.from(el.childNodes).some(
            node => node.nodeType === 3 && node.textContent && node.textContent.trim().length > 0
          );

          if (hasDirectText && fontSize < min) {
            let identifier = el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.split(' ').filter(c => c.trim());
              if (classes.length > 0) identifier += `.${classes[0]}`;
            }

            issues.push({
              category: 'Warning' as const,
              type: 'Readability',
              message: `Text too small on desktop: ${identifier} (${fontSize.toFixed(2)}px)`
            });
            checked.add(el);
          }
        }
      });

      return issues.slice(0, 20);
    }, minSize);
  }

  private async checkImages(): Promise<Issue[]> {
    return await this.page.evaluate(() => {
      const issues: Issue[] = [];

      document.querySelectorAll('img').forEach((img) => {
        // Check for alt text
        if (!img.alt && !img.getAttribute('aria-label')) {
          issues.push({
            category: 'Warning' as const,
            type: 'Accessibility',
            message: `Image missing alt text: ${img.src.substring(0, 50)}`
          });
        }

        // Check for oversized images
        const naturalWidth = (img as HTMLImageElement).naturalWidth;
        const displayWidth = img.getBoundingClientRect().width;

        if (naturalWidth > displayWidth * 2) {
          issues.push({
            category: 'Info' as const,
            type: 'Performance',
            message: `Image could be optimized: ${img.src.substring(0, 50)} (${naturalWidth}px served for ${Math.round(displayWidth)}px display)`
          });
        }
      });

      return issues.slice(0, 10);
    });
  }

  private async checkInteractiveElements(): Promise<Issue[]> {
    return await this.page.evaluate(() => {
      const issues: Issue[] = [];
      const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [tabindex]';

      document.querySelectorAll(interactiveSelectors).forEach((el) => {
        const style = window.getComputedStyle(el);

        // Skip hidden elements
        if (style.display === 'none' || style.visibility === 'hidden') {
          issues.push({
            category: 'Info' as const,
            type: 'Interactive',
            message: `Interactive element is hidden: ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`
          });
        }
      });

      return issues.slice(0, 20);
    });
  }

  private async checkForms(): Promise<Issue[]> {
    return await this.page.evaluate(() => {
      const issues: Issue[] = [];

      document.querySelectorAll('input, select, textarea').forEach((input) => {
        const el = input as HTMLInputElement;

        // Skip hidden inputs
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || el.type === 'hidden') return;

        // Check for labels (ignore aria-labels per user preference)
        const hasLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
        const hasAriaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');

        if (!hasLabel && !hasAriaLabel) {
          issues.push({
            category: 'Warning' as const,
            type: 'Forms',
            message: `${el.type}: Input missing label or aria-label`
          });
        }
      });

      return issues.slice(0, 15);
    });
  }

  private async checkScrollBehavior(): Promise<Issue[]> {
    return await this.page.evaluate(() => {
      const issues: Issue[] = [];
      const overflowElements: string[] = [];

      document.querySelectorAll('*').forEach((el) => {
        const style = window.getComputedStyle(el);

        if (style.overflowX === 'scroll' || style.overflowX === 'auto') {
          let identifier = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) identifier += `.${classes[0]}`;
          }
          overflowElements.push(identifier);
        }
      });

      if (overflowElements.length > 0) {
        issues.push({
          category: 'Warning' as const,
          type: 'Scrolling',
          message: `Elements with horizontal scroll: ${[...new Set(overflowElements)].slice(0, 5).join(', ')}`
        });
      }

      return issues;
    });
  }

  private async checkLayoutEfficiency(): Promise<Issue[]> {
    return await this.page.evaluate(() => {
      const issues: Issue[] = [];
      const viewportWidth = window.innerWidth;

      // Check for wasted horizontal space (content too narrow for desktop)
      const mainContent = document.querySelector('main') || document.body;
      const contentWidth = mainContent.getBoundingClientRect().width;

      if (contentWidth < viewportWidth * 0.5) {
        issues.push({
          category: 'Info' as const,
          type: 'Layout',
          message: `Content width (${Math.round(contentWidth)}px) is less than 50% of viewport (${viewportWidth}px) - consider using more horizontal space on desktop`
        });
      }

      // Check for too many fixed/sticky elements
      const fixedElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.position === 'fixed' || style.position === 'sticky';
      });

      if (fixedElements.length > 5) {
        issues.push({
          category: 'Info' as const,
          type: 'Layout',
          message: `Many fixed/sticky elements detected (${fixedElements.length}), may cause layout issues`
        });
      }

      return issues;
    });
  }

  private async getPageMetrics() {
    return await this.page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const overflowElements = Array.from(allElements).filter(el => {
        const style = window.getComputedStyle(el);
        return style.overflow === 'scroll' || style.overflow === 'auto' ||
               style.overflowX === 'scroll' || style.overflowX === 'auto';
      });

      const hiddenElements = Array.from(allElements).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      });

      const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');

      return {
        elementCount: allElements.length,
        overflowElements: overflowElements.length,
        hiddenElements: hiddenElements.length,
        interactiveElements: interactiveElements.length
      };
    });
  }

  private async takeScreenshot(pageName: string) {
    const dir = path.join(process.cwd(), 'artifacts', 'desktop-audit');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await this.page.screenshot({
      path: path.join(dir, `${pageName}-initial.png`),
      fullPage: true
    });
  }

  async runAudit() {
    console.log('🚀 Starting comprehensive desktop audit...\n');
    console.log(`🖥️  Testing viewport: ${DESKTOP_VIEWPORT.width}x${DESKTOP_VIEWPORT.height} (Full HD Desktop)`);
    console.log(`🌐 Base URL: ${BASE_URL}\n`);

    await this.init();

    for (const page of PAGES_TO_TEST) {
      const result = await this.testPage(page.path, page.name);
      this.results.push(result);
    }

    await this.browser.close();
    await this.generateReport();
  }

  private async generateReport() {
    const passedPages = this.results.filter(r => r.passed).length;
    const failedPages = this.results.filter(r => !r.passed).length;

    const allIssues = this.results.flatMap(r => r.issues);
    const criticalCount = allIssues.filter(i => i.category === 'Critical').length;
    const warningCount = allIssues.filter(i => i.category === 'Warning').length;
    const infoCount = allIssues.filter(i => i.category === 'Info').length;

    console.log('\n\n================================================================================');
    console.log(`🖥️  DESKTOP AUDIT REPORT - VIEWPORT: ${DESKTOP_VIEWPORT.width}x${DESKTOP_VIEWPORT.height} (Full HD)`);
    console.log('================================================================================\n');

    console.log('📊 SUMMARY');
    console.log(`  Total Pages Tested: ${this.results.length}`);
    console.log(`  Passed: ${passedPages}`);
    console.log(`  Failed: ${failedPages}`);
    console.log(`  🔴 Critical Issues: ${criticalCount}`);
    console.log(`  ⚠️  Warnings: ${warningCount}`);
    console.log(`  ℹ️  Info: ${infoCount}\n`);

    console.log('\n📄 DETAILED RESULTS\n');

    for (const result of this.results) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name.toUpperCase()}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Load Time: ${result.loadTime}ms`);
      console.log(`   Elements: ${result.metrics.elementCount}`);
      console.log(`   Interactive: ${result.metrics.interactiveElements}`);
      console.log(`   Issues Found: ${result.issues.length}`);

      result.issues.forEach(issue => {
        const icon = issue.category === 'Critical' ? '🔴' : issue.category === 'Warning' ? '⚠️' : 'ℹ️';
        console.log(`     ${icon} [${issue.type}] ${issue.message}`);
      });
      console.log();
    }

    // Group issues by category
    console.log('\n📋 ISSUES BY CATEGORY\n');
    const issuesByType = new Map<string, number>();
    allIssues.forEach(issue => {
      issuesByType.set(issue.type, (issuesByType.get(issue.type) || 0) + 1);
    });

    Array.from(issuesByType.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });

    // Save JSON report
    const reportPath = path.join(process.cwd(), 'artifacts', 'desktop-audit', 'desktop-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      viewport: DESKTOP_VIEWPORT,
      timestamp: new Date().toISOString(),
      summary: {
        totalPages: this.results.length,
        passed: passedPages,
        failed: failedPages,
        critical: criticalCount,
        warnings: warningCount,
        info: infoCount
      },
      results: this.results
    }, null, 2));

    console.log(`\n💾 Full report saved to: ${reportPath}`);
    console.log('================================================================================\n');
    console.log('✅ Desktop audit complete!\n');
  }
}

// Run the audit
const auditor = new DesktopAuditor();
auditor.runAudit().catch(console.error);
