"""
Generate PDF from markdown lesson using multiple fallback methods
"""
import subprocess
import sys
import os

def try_pandoc():
    """Try using pandoc to convert markdown to PDF"""
    try:
        result = subprocess.run(
            ['pandoc', 'VAE_Lesson.md', '-o', 'VAE_Lesson.pdf',
             '--pdf-engine=xelatex',
             '-V', 'geometry:margin=1in',
             '-V', 'fontsize=11pt',
             '--toc',
             '--toc-depth=2'],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode == 0:
            print("✓ PDF generated successfully with pandoc")
            return True
        else:
            print(f"Pandoc failed: {result.stderr}")
            return False
    except FileNotFoundError:
        print("Pandoc not found, trying alternative...")
        return False
    except Exception as e:
        print(f"Pandoc error: {e}")
        return False

def try_markdown2():
    """Try using markdown2 + weasyprint"""
    try:
        import markdown2
        import weasyprint

        # Read markdown
        with open('VAE_Lesson.md', 'r', encoding='utf-8') as f:
            md_content = f.read()

        # Convert to HTML
        html_content = markdown2.markdown(md_content, extras=['tables', 'fenced-code-blocks'])

        # Add CSS styling
        styled_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: 'Segoe UI', Arial, sans-serif;
                    line-height: 1.6;
                    max-width: 800px;
                    margin: 40px auto;
                    padding: 0 20px;
                    color: #333;
                }}
                h1 {{
                    color: #2c3e50;
                    border-bottom: 3px solid #3498db;
                    padding-bottom: 10px;
                }}
                h2 {{
                    color: #34495e;
                    margin-top: 30px;
                    border-bottom: 2px solid #ecf0f1;
                    padding-bottom: 5px;
                }}
                h3 {{
                    color: #7f8c8d;
                    margin-top: 20px;
                }}
                code {{
                    background-color: #f8f9fa;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Courier New', monospace;
                    font-size: 0.9em;
                }}
                pre {{
                    background-color: #1e1e1e;
                    color: #d4d4d4;
                    padding: 15px;
                    border-radius: 5px;
                    overflow-x: auto;
                }}
                pre code {{
                    background-color: transparent;
                    padding: 0;
                    color: #d4d4d4;
                }}
                table {{
                    border-collapse: collapse;
                    width: 100%;
                    margin: 20px 0;
                }}
                th, td {{
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }}
                th {{
                    background-color: #3498db;
                    color: white;
                }}
                tr:nth-child(even) {{
                    background-color: #f8f9fa;
                }}
                blockquote {{
                    border-left: 4px solid #3498db;
                    padding-left: 20px;
                    margin-left: 0;
                    color: #555;
                }}
            </style>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """

        # Convert to PDF
        weasyprint.HTML(string=styled_html).write_pdf('VAE_Lesson.pdf')
        print("✓ PDF generated successfully with markdown2 + weasyprint")
        return True

    except ImportError:
        print("markdown2 or weasyprint not available, trying next method...")
        return False
    except Exception as e:
        print(f"markdown2/weasyprint error: {e}")
        return False

def try_pypandoc():
    """Try using pypandoc wrapper"""
    try:
        import pypandoc

        output = pypandoc.convert_file(
            'VAE_Lesson.md',
            'pdf',
            outputfile='VAE_Lesson.pdf',
            extra_args=['--pdf-engine=xelatex',
                       '-V', 'geometry:margin=1in',
                       '--toc']
        )
        print("✓ PDF generated successfully with pypandoc")
        return True
    except ImportError:
        print("pypandoc not available, trying next method...")
        return False
    except Exception as e:
        print(f"pypandoc error: {e}")
        return False

def install_and_retry():
    """Install required packages and retry"""
    print("\nAttempting to install required packages...")
    packages = ['markdown2', 'weasyprint']

    for pkg in packages:
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', pkg],
                         capture_output=True, check=True)
            print(f"Installed {pkg}")
        except:
            print(f"Could not install {pkg}")

    # Retry with markdown2
    return try_markdown2()

def main():
    print("=" * 60)
    print("VAE Lesson PDF Generator")
    print("=" * 60)

    # Try methods in order of preference
    if try_pandoc():
        return

    if try_pypandoc():
        return

    if try_markdown2():
        return

    # Last resort: install and retry
    if install_and_retry():
        return

    print("\n" + "=" * 60)
    print("Could not generate PDF automatically.")
    print("\nAlternative options:")
    print("1. Install pandoc: https://pandoc.org/installing.html")
    print("   Then run: pandoc VAE_Lesson.md -o VAE_Lesson.pdf")
    print("\n2. Use an online converter:")
    print("   - https://www.markdowntopdf.com/")
    print("   - Upload VAE_Lesson.md")
    print("\n3. Open VAE_Lesson.md in VS Code and:")
    print("   - Install 'Markdown PDF' extension")
    print("   - Right-click → 'Markdown PDF: Export (pdf)'")
    print("=" * 60)

if __name__ == '__main__':
    main()
