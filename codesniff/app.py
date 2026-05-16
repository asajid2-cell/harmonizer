#!/usr/bin/env python3
"""
CodeSniff Application Launcher
Automates setup and runs both backend and frontend servers
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path
import time


class Colors:
    """ANSI color codes for terminal output"""
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'


def print_header(text):
    """Print colored header"""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")


def print_success(text):
    """Print success message"""
    print(f"{Colors.GREEN}✓ {text}{Colors.END}")


def print_error(text):
    """Print error message"""
    print(f"{Colors.RED}✗ {text}{Colors.END}")


def print_warning(text):
    """Print warning message"""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.END}")


def print_info(text):
    """Print info message"""
    print(f"{Colors.CYAN}→ {text}{Colors.END}")


def check_command(command):
    """Check if a command exists"""
    return shutil.which(command) is not None


def run_command(cmd, **kwargs):
    """Run command with proper shell handling for Windows"""
    is_windows = platform.system() == 'Windows'
    return subprocess.run(cmd, shell=is_windows, **kwargs)


def get_python_command():
    """Get the correct Python command"""
    # On Windows, prioritize 'python' over 'python3'
    is_windows = platform.system() == 'Windows'

    if is_windows:
        if check_command('python'):
            return 'python'
        elif check_command('python3'):
            return 'python3'
    else:
        if check_command('python3'):
            return 'python3'
        elif check_command('python'):
            return 'python'

    return None


def get_pip_command():
    """Get the correct pip command"""
    if check_command('pip3'):
        return 'pip3'
    elif check_command('pip'):
        return 'pip'
    else:
        return None


def check_prerequisites():
    """Check if all required software is installed"""
    print_header("Checking Prerequisites")

    issues = []

    # Check Python
    python_cmd = get_python_command()
    if python_cmd:
        result = run_command([python_cmd, '--version'], capture_output=True, text=True)
        version = result.stdout.strip()
        print_success(f"Python: {version}")
    else:
        print_error("Python not found")
        issues.append("Install Python 3.10+ from https://www.python.org/downloads/")

    # Check pip
    pip_cmd = get_pip_command()
    if pip_cmd:
        print_success(f"pip: Found")
    else:
        print_error("pip not found")
        issues.append("Install pip (usually comes with Python)")

    # Check Node.js
    if check_command('node'):
        result = run_command(['node', '--version'], capture_output=True, text=True)
        version = result.stdout.strip()
        print_success(f"Node.js: {version}")
    else:
        print_error("Node.js not found")
        issues.append("Install Node.js 18+ from https://nodejs.org/")

    # Check npm
    if check_command('npm'):
        result = run_command(['npm', '--version'], capture_output=True, text=True)
        version = result.stdout.strip()
        print_success(f"npm: {version}")
    else:
        print_error("npm not found")
        issues.append("Install npm (usually comes with Node.js)")

    # Check Git
    if check_command('git'):
        result = run_command(['git', '--version'], capture_output=True, text=True)
        version = result.stdout.strip()
        print_success(f"Git: {version}")
    else:
        print_warning("Git not found (optional, needed for GitHub cloning feature)")

    if issues:
        print_error("\nMissing prerequisites:")
        for issue in issues:
            print(f"  • {issue}")
        return False

    print_success("\nAll prerequisites satisfied!")
    return True


def setup_backend():
    """Set up backend environment"""
    print_header("Setting Up Backend")

    backend_dir = Path(__file__).parent / 'backend'
    os.chdir(backend_dir)

    # Check for .env file
    env_file = backend_dir / '.env'
    env_example = backend_dir / '.env.example'

    if not env_file.exists():
        if env_example.exists():
            print_warning(".env file not found")
            print_info("Copying .env.example to .env...")
            shutil.copy(env_example, env_file)
            print_success(".env file created")
            print_warning("\n⚠ IMPORTANT: Edit backend/.env and add your GROQ_API_KEY for chatbot feature")
            print_info("Get your API key from: https://console.groq.com")
        else:
            print_error(".env.example not found!")
    else:
        print_success(".env file exists")
        # Check if GROQ_API_KEY is set
        with open(env_file) as f:
            content = f.read()
            if 'GROQ_API_KEY=your_groq_api_key_here' in content or 'GROQ_API_KEY=' not in content:
                print_warning("GROQ_API_KEY not configured in .env")
                print_info("Chatbot feature will not work until you add your Groq API key")

    # Check if dependencies are installed
    requirements_file = backend_dir / 'requirements.txt'
    if requirements_file.exists():
        # Check if key packages are installed
        try:
            import fastapi
            import uvicorn
            print_success("Dependencies already installed")
        except ImportError:
            print_info("Installing backend dependencies...")
            pip_cmd = get_pip_command()
            result = run_command(
                [pip_cmd, 'install', '-r', 'requirements.txt'],
                capture_output=False
            )
            if result.returncode == 0:
                print_success("Dependencies installed successfully")
            else:
                print_error("Failed to install dependencies")
                raise RuntimeError("Backend setup failed")

    print_success("\nBackend ready!")


def setup_frontend():
    """Set up frontend environment"""
    print_header("Setting Up Frontend")

    frontend_dir = Path(__file__).parent / 'frontend'
    os.chdir(frontend_dir)

    # Check if node_modules exists
    node_modules = frontend_dir / 'node_modules'
    if not node_modules.exists():
        print_info("Installing frontend dependencies...")
        result = run_command(['npm', 'install'], capture_output=False)
        if result.returncode == 0:
            print_success("Dependencies installed successfully")
        else:
            print_error("Failed to install dependencies")
            raise RuntimeError("Frontend setup failed")
    else:
        print_success("Dependencies already installed")

    print_success("\nFrontend ready!")


def start_backend():
    """Start the backend server"""
    print_header("Starting Backend Server")

    backend_dir = Path(__file__).parent / 'backend'

    python_cmd = get_python_command()

    print_info("Starting FastAPI server on http://localhost:8000")
    print_info("Press Ctrl+C to stop both servers\n")

    # Start backend process using uvicorn
    is_windows = platform.system() == 'Windows'
    return subprocess.Popen(
        [python_cmd, '-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'],
        cwd=str(backend_dir),
        shell=is_windows
    )


def start_frontend():
    """Start the frontend dev server"""
    print_header("Starting Frontend Server")

    frontend_dir = Path(__file__).parent / 'frontend'

    print_info("Starting Vite dev server on http://localhost:5173")
    print_info("Opening browser in 5 seconds...\n")

    # Start frontend process
    is_windows = platform.system() == 'Windows'
    return subprocess.Popen(
        ['npm', 'run', 'dev'],
        cwd=str(frontend_dir),
        shell=is_windows
    )


def run_servers():
    """Run both backend and frontend servers"""
    print_header("Starting CodeSniff")

    backend_process = None
    frontend_process = None

    try:
        # Start backend
        backend_process = start_backend()

        # Wait a bit for backend to start
        print_info("Waiting for backend to initialize...")
        time.sleep(3)

        # Start frontend
        frontend_process = start_frontend()

        # Wait a bit then open browser
        time.sleep(5)

        # Open browser
        url = "http://localhost:5173"
        print_success(f"\nCodeSniff is running!")
        print_info(f"Frontend: {url}")
        print_info(f"Backend API: http://localhost:8000")
        print_info(f"API Docs: http://localhost:8000/docs")

        # Try to open browser
        try:
            import webbrowser
            webbrowser.open(url)
            print_success("Browser opened")
        except:
            print_warning("Could not open browser automatically")
            print_info(f"Please open {url} in your browser")

        print(f"\n{Colors.BOLD}{Colors.GREEN}Press Ctrl+C to stop servers{Colors.END}\n")

        # Monitor processes and print output
        while True:
            # Check if processes are still running
            if backend_process.poll() is not None:
                print_error("Backend process stopped unexpectedly")
                break
            if frontend_process.poll() is not None:
                print_error("Frontend process stopped unexpectedly")
                break

            time.sleep(1)

    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}Stopping servers...{Colors.END}")

    finally:
        # Clean up processes
        if backend_process:
            backend_process.terminate()
            try:
                backend_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                backend_process.kill()

        if frontend_process:
            frontend_process.terminate()
            try:
                frontend_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                frontend_process.kill()

        print_success("Servers stopped")
        print(f"\n{Colors.BOLD}Thanks for using CodeSniff!{Colors.END}\n")


def main():
    """Main application entry point"""
    print(f"""
{Colors.BOLD}{Colors.CYAN}
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                      CodeSniff                            ║
║          Semantic Code Search Engine                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
{Colors.END}
""")

    # Change to script directory
    os.chdir(Path(__file__).parent)

    # Check prerequisites
    if not check_prerequisites():
        print_error("\nPlease install missing prerequisites and try again")
        sys.exit(1)

    # Setup backend
    try:
        setup_backend()
    except Exception as e:
        print_error(f"Backend setup failed: {e}")
        sys.exit(1)

    # Setup frontend
    try:
        setup_frontend()
    except Exception as e:
        print_error(f"Frontend setup failed: {e}")
        sys.exit(1)

    # Run servers
    try:
        run_servers()
    except Exception as e:
        print_error(f"Error running servers: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
