from fastapi import FastAPI

from app.config import settings


MAIN_CSP = "; ".join((
    "default-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
))

DOCS_CSP = "; ".join((
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: https://fastapi.tiangolo.com",
    "font-src 'self' data: https://cdn.jsdelivr.net",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
))


def security_headers(path, docs_paths):
    if not settings.security_headers_enabled:
        return {}
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    }
    if settings.csp_mode == "off":
        return headers
    if settings.csp_mode == "enforce":
        name = "Content-Security-Policy"
    elif settings.csp_mode == "report-only":
        name = "Content-Security-Policy-Report-Only"
    else:
        raise ValueError("Invalid CSP_MODE")
    policy = DOCS_CSP if path in docs_paths else MAIN_CSP
    if settings.csp_report_uri:
        policy += f"; report-uri {settings.csp_report_uri}"
    headers[name] = policy
    return headers


class SecurityHeadersMiddleware:
    def __init__(self, app, docs_paths):
        self.app = app
        self.docs_paths = docs_paths

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        configured = security_headers(scope.get("path", ""), self.docs_paths)

        async def secured_send(message):
            if configured and message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                if settings.csp_mode != "off":
                    headers = [(key, value) for key, value in headers if key.lower() not in {b"content-security-policy", b"content-security-policy-report-only"}]
                present = {key.lower() for key, _ in headers}
                for name, value in configured.items():
                    key = name.lower().encode("ascii")
                    if key not in present:
                        headers.append((key, value.encode("ascii")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, secured_send)


class SecurityHeadersFastAPI(FastAPI):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        docs_paths = set()
        if self.openapi_url:
            if self.docs_url:
                docs_paths.add(self.docs_url)
                if self.swagger_ui_oauth2_redirect_url:
                    docs_paths.add(self.swagger_ui_oauth2_redirect_url)
            if self.redoc_url:
                docs_paths.add(self.redoc_url)
        self.security_middleware = SecurityHeadersMiddleware(super().__call__, docs_paths)

    async def __call__(self, scope, receive, send):
        await self.security_middleware(scope, receive, send)
