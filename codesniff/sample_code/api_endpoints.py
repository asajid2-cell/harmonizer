"""HTTP API endpoint handlers"""

from typing import Dict, Any, List
import json


def handle_get_request(path: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Handle HTTP GET request

    Args:
        path: Request path
        query_params: Query parameters

    Returns:
        Response dictionary
    """
    return {
        'method': 'GET',
        'path': path,
        'params': query_params,
        'status': 200
    }


def handle_post_request(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle HTTP POST request

    Args:
        path: Request path
        body: Request body data

    Returns:
        Response dictionary
    """
    return {
        'method': 'POST',
        'path': path,
        'body': body,
        'status': 201
    }


def parse_request_body(raw_body: str) -> Dict[str, Any]:
    """
    Parse JSON request body

    Args:
        raw_body: Raw request body string

    Returns:
        Parsed dictionary
    """
    try:
        return json.loads(raw_body)
    except json.JSONDecodeError:
        return {}


def format_response(data: Any, status_code: int = 200) -> str:
    """
    Format API response as JSON

    Args:
        data: Response data
        status_code: HTTP status code

    Returns:
        JSON string response
    """
    response = {
        'status': status_code,
        'data': data
    }

    return json.dumps(response)


class APIRouter:
    """HTTP API router"""

    def __init__(self):
        """Initialize API router"""
        self.routes = {}

    def register_route(self, method: str, path: str, handler: callable):
        """
        Register an API route

        Args:
            method: HTTP method (GET, POST, etc.)
            path: Route path
            handler: Handler function
        """
        key = f"{method}:{path}"
        self.routes[key] = handler

    def route(self, method: str, path: str):
        """
        Decorator to register routes

        Args:
            method: HTTP method
            path: Route path
        """
        def decorator(handler):
            self.register_route(method, path, handler)
            return handler

        return decorator

    def dispatch(self, method: str, path: str, **kwargs) -> Any:
        """
        Dispatch request to appropriate handler

        Args:
            method: HTTP method
            path: Request path
            **kwargs: Additional arguments

        Returns:
            Handler response
        """
        key = f"{method}:{path}"

        if key in self.routes:
            return self.routes[key](**kwargs)

        return {'error': 'Route not found', 'status': 404}
