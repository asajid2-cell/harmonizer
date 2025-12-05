"""Simple HTML/CSS parser using regex patterns"""

import re
from typing import List, Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class ParsedHTMLElement:
    """Represents a parsed HTML element (component, template, etc)"""
    name: str
    code: str
    start_line: int
    end_line: int
    element_type: str  # 'component', 'section', 'template'
    file_path: str = ""


@dataclass
class ParsedCSSRule:
    """Represents a parsed CSS rule"""
    selector: str
    code: str
    start_line: int
    end_line: int
    file_path: str = ""


@dataclass
class ParsedHTMLCSSFile:
    """Represents a fully parsed HTML/CSS file"""
    file_path: str
    elements: List[ParsedHTMLElement]
    css_rules: List[ParsedCSSRule]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class HTMLCSSParser:
    """Simple parser for HTML and CSS using regex"""

    def __init__(self):
        """Initialize HTML/CSS parser"""
        # HTML component patterns (Vue, React JSX components in .html, custom elements)
        self.component_patterns = [
            # Vue component: <template id="...">
            r'<template\s+(?:id|name)=["\']([^"\']+)["\']',
            # Custom elements: <my-component>
            r'<([\w-]+(?:-[\w-]+)+)',
        ]

        # CSS selector patterns
        self.css_class_pattern = r'\.([\w-]+)\s*\{'
        self.css_id_pattern = r'#([\w-]+)\s*\{'
        self.css_element_pattern = r'^([\w-]+)\s*\{'

        logger.info("HTMLCSSParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedHTMLCSSFile]:
        """
        Parse an HTML or CSS file

        Args:
            file_path: Path to HTML/CSS file

        Returns:
            ParsedHTMLCSSFile or None if parsing fails
        """
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as f:
                code = f.read()

            lines = code.split('\n')
            total_lines = len(lines)

            is_css = file_path.endswith('.css')

            elements = []
            css_rules = []

            if is_css:
                css_rules = self._parse_css_rules(code, lines, file_path)
            else:
                # Parse HTML elements/components
                elements = self._parse_html_elements(code, lines, file_path)
                # Also parse inline styles/CSS
                css_rules = self._parse_inline_css(code, lines, file_path)

            return ParsedHTMLCSSFile(
                file_path=file_path,
                elements=elements,
                css_rules=css_rules,
                total_lines=total_lines
            )

        except Exception as e:
            logger.error(f"Failed to parse {file_path}: {e}")
            return None

    def _parse_html_elements(self, code: str, lines: List[str], file_path: str) -> List[ParsedHTMLElement]:
        """Parse HTML elements and components"""
        elements = []

        # Find template/component sections
        template_pattern = r'<template[^>]*id=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</template>'
        for match in re.finditer(template_pattern, code, re.MULTILINE):
            template_id = match.group(1)
            template_code = match.group(0)

            # Find line numbers
            start_pos = match.start()
            end_pos = match.end()
            start_line = code[:start_pos].count('\n') + 1
            end_line = code[:end_pos].count('\n') + 1

            elements.append(ParsedHTMLElement(
                name=template_id,
                code=template_code,
                start_line=start_line,
                end_line=end_line,
                element_type='template',
                file_path=file_path
            ))

        # Find significant sections (header, main, footer, nav, etc.)
        section_pattern = r'<(header|main|footer|nav|aside|section)[^>]*>([\s\S]*?)</\1>'
        for match in re.finditer(section_pattern, code, re.MULTILINE):
            tag_name = match.group(1)
            section_code = match.group(0)

            start_pos = match.start()
            end_pos = match.end()
            start_line = code[:start_pos].count('\n') + 1
            end_line = code[:end_pos].count('\n') + 1

            # Extract id or class for better naming
            id_match = re.search(r'id=["\']([^"\']+)["\']', section_code)
            class_match = re.search(r'class=["\']([^"\']+)["\']', section_code)

            name = tag_name
            if id_match:
                name = f"{tag_name}#{id_match.group(1)}"
            elif class_match:
                name = f"{tag_name}.{class_match.group(1).split()[0]}"

            elements.append(ParsedHTMLElement(
                name=name,
                code=section_code,
                start_line=start_line,
                end_line=end_line,
                element_type='section',
                file_path=file_path
            ))

        return elements

    def _parse_css_rules(self, code: str, lines: List[str], file_path: str) -> List[ParsedCSSRule]:
        """Parse CSS rules"""
        css_rules = []

        # Match CSS rules: selector { ... }
        rule_pattern = r'([^{}]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'

        for match in re.finditer(rule_pattern, code):
            selector = match.group(1).strip()
            rule_code = match.group(0)

            # Skip @-rules except @media
            if selector.startswith('@') and not selector.startswith('@media'):
                continue

            # Find line numbers
            start_pos = match.start()
            end_pos = match.end()
            start_line = code[:start_pos].count('\n') + 1
            end_line = code[:end_pos].count('\n') + 1

            # Only index substantial rules (more than just one line)
            if end_line - start_line >= 2 or len(rule_code) > 50:
                css_rules.append(ParsedCSSRule(
                    selector=selector,
                    code=rule_code,
                    start_line=start_line,
                    end_line=end_line,
                    file_path=file_path
                ))

        return css_rules

    def _parse_inline_css(self, code: str, lines: List[str], file_path: str) -> List[ParsedCSSRule]:
        """Parse inline CSS in <style> tags"""
        css_rules = []

        # Find <style> blocks
        style_pattern = r'<style[^>]*>([\s\S]*?)</style>'

        for match in re.finditer(style_pattern, code, re.MULTILINE):
            style_content = match.group(1)
            style_start = match.start()

            # Parse CSS within this style block
            rule_pattern = r'([^{}]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'

            for rule_match in re.finditer(rule_pattern, style_content):
                selector = rule_match.group(1).strip()
                rule_code = rule_match.group(0)

                # Calculate actual line numbers in file
                rule_start_in_style = rule_match.start()
                absolute_pos = style_start + len('<style>') + rule_start_in_style
                start_line = code[:absolute_pos].count('\n') + 1
                end_line = code[:absolute_pos + len(rule_code)].count('\n') + 1

                if end_line - start_line >= 1:
                    css_rules.append(ParsedCSSRule(
                        selector=selector,
                        code=rule_code,
                        start_line=start_line,
                        end_line=end_line,
                        file_path=file_path
                    ))

        return css_rules
