from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi import status as http_status
from pathlib import Path
from pydantic import BaseModel, EmailStr, ValidationError
from datetime import datetime
from typing import Optional
import os

class NoCacheStaticFiles(StaticFiles):
    """StaticFiles with cache-busting headers for development."""
    def file_response(self, *args, **kwargs) -> Response:
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

from src.workflow import run_workflow, export_workflow
from src.db import (
    init_db,
    save_request,
    get_requests,
    count_requests,
    get_request_by_id,
    get_stats,
    create_organization,
    create_user,
    create_membership,
    get_user_by_email,
    get_user_by_id,
    get_membership,
    get_organization_by_id,
    get_review_requests,
    update_request_status,
    create_comment,
    get_comments_for_request,
)
from src.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_active_user,
    require_admin,
    TokenData,
    UserRegister,
    UserLogin,
    TokenResponse,
    UserResponse,
    RefreshTokenRequest,
)
from src.config import (
    CORS_ORIGINS,
    DEFAULT_PAGE_LIMIT,
    MAX_PAGE_LIMIT,
    MIN_PASSWORD_LENGTH,
    DEBUG,
    APP_NAME,
    DATABASE_PATH,
    utcnow_iso,
)
from src.audit import record_audit_log
from src.logging_config import setup_logging

setup_logging()

init_db()

app = FastAPI(
    title=f"{APP_NAME} API",
    description="API for AI-powered customer request triage and routing.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", NoCacheStaticFiles(directory=str(frontend_dir)), name="static")


def _get_frontend_api_base() -> str:
    return os.getenv("FRONTEND_API_BASE", "")


@app.get("/")
def serve_frontend():
    html_path = frontend_dir / "index.html"
    api_base = _get_frontend_api_base()
    content = html_path.read_text(encoding="utf-8")
    if api_base:
        script = f'<script>window.API_BASE="{api_base}";</script>'
        content = content.replace("</head>", f"{script}</head>")
    
    from fastapi.responses import Response
    return Response(
        content=content,
        media_type="text/html",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


class AIOutputResponse(BaseModel):
    category: str | None
    confidence: float | None
    summary: str | None
    risk: str | None
    needs_human: bool | None


class WorkflowResultResponse(BaseModel):
    id: int | None = None
    input_text: str
    normalized_text: str
    ai_output: AIOutputResponse | None
    route_to: str
    status: str
    error_reason: str | None
    assigned_to: int | None = None
    updated_at: str | None = None
    timestamp: str


class RequestSubmission(BaseModel):
    text: str


class HealthResponse(BaseModel):
    status: str
    environment: str


class ReadinessResponse(BaseModel):
    ready: bool
    database: str
    environment: str


class RequestHistoryItem(BaseModel):
    id: int
    input_text: str
    category: str | None
    risk: str | None
    route_to: str
    status: str
    assigned_to: int | None
    updated_at: str | None
    timestamp: str


class PaginatedRequestHistoryResponse(BaseModel):
    results: list[RequestHistoryItem]
    total: int
    limit: int
    offset: int


class StatsResponse(BaseModel):
    total: int
    human_review: int
    high_risk: int
    routed: int


class StatusUpdateRequest(BaseModel):
    status: str
    assigned_to: int | None = None


class BatchStatusUpdateRequest(BaseModel):
    request_ids: list[int]
    status: str
    assigned_to: int | None = None


class BatchStatusUpdateResponse(BaseModel):
    updated: int
    failed: int
    results: list[dict]


class CommentCreate(BaseModel):
    content: str


class CommentResponse(BaseModel):
    id: int
    request_id: int
    user_id: int
    user_name: str | None
    content: str
    created_at: str


class CommentsResponse(BaseModel):
    results: list[CommentResponse]


class ReviewTicketResponse(RequestHistoryItem):
    confidence: float | None
    summary: str | None
    needs_human: bool | None
    error_reason: str | None


class OrganizationCreate(BaseModel):
    name: str


class OrganizationResponse(BaseModel):
    id: int
    name: str
    created_at: str


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return Response(
        content={"detail": "Invalid request data", "errors": exc.errors()},
        status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
        media_type="application/json",
    )


def _get_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "healthy", "environment": "development" if DEBUG else "production"}


@app.get("/health/ready", response_model=ReadinessResponse)
def readiness():
    try:
        from src.db import _connection
        conn = _connection()
        conn.execute("SELECT 1")
        conn.close()
        db_status = "ok"
    except Exception:
        db_status = "error"

    return {
        "ready": db_status == "ok",
        "database": db_status,
        "environment": "development" if DEBUG else "production",
    }


@app.post("/auth/register", response_model=TokenResponse)
def register(request: Request, payload: UserRegister):
    if len(payload.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    existing = get_user_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    password_hash = hash_password(payload.password)
    user_id = create_user(payload.name, payload.email, password_hash)

    org_id = create_organization(f"{payload.name}'s Workspace")
    create_membership(user_id, org_id, role="admin")

    access_token = create_access_token({"sub": str(user_id), "org_id": str(org_id), "role": "admin"})
    refresh_token = create_refresh_token({"sub": str(user_id), "org_id": str(org_id), "role": "admin"})

    record_audit_log(
        organization_id=org_id,
        user_id=user_id,
        action="register",
        resource_type="user",
        resource_id=user_id,
        details=f"User {payload.name} registered",
        ip_address=_get_client_ip(request),
    )

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@app.post("/auth/login", response_model=TokenResponse)
def login(request: Request, payload: UserLogin):
    user = get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    membership = get_membership(user["id"])
    if membership is None:
        raise HTTPException(status_code=403, detail="User does not belong to an organization")

    access_token = create_access_token({"sub": str(user["id"]), "org_id": str(membership["organization_id"]), "role": membership["role"]})
    refresh_token = create_refresh_token({"sub": str(user["id"]), "org_id": str(membership["organization_id"]), "role": membership["role"]})

    record_audit_log(
        organization_id=membership["organization_id"],
        user_id=user["id"],
        action="login",
        resource_type="user",
        resource_id=user["id"],
        ip_address=_get_client_ip(request),
    )

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@app.post("/auth/refresh", response_model=TokenResponse)
def refresh_token(request: Request, payload: RefreshTokenRequest):
    try:
        token_data = decode_token(payload.refresh_token, expected_type="refresh")
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    membership = get_membership(token_data.user_id)
    if membership is None:
        raise HTTPException(status_code=403, detail="User does not belong to an organization")

    access_token = create_access_token({"sub": str(token_data.user_id), "org_id": str(membership["organization_id"]), "role": membership["role"]})
    refresh_token = create_refresh_token({"sub": str(token_data.user_id), "org_id": str(membership["organization_id"]), "role": membership["role"]})

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@app.get("/auth/me", response_model=UserResponse)
def get_me(current_user: TokenData = Depends(get_current_active_user)):
    user = get_user_by_id(current_user.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    org = get_organization_by_id(current_user.organization_id)
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "organization_id": current_user.organization_id,
        "role": current_user.role,
        "created_at": user["created_at"],
    }


@app.post("/requests", response_model=WorkflowResultResponse)
def submit_request(request: Request, payload: RequestSubmission, current_user: TokenData = Depends(get_current_active_user)):
    if len(payload.text) > 10000:
        raise HTTPException(status_code=400, detail="Request text exceeds maximum length of 10000 characters")

    result = run_workflow(payload.text)
    export_workflow(result)
    request_id = save_request(result, organization_id=current_user.organization_id)

    record_audit_log(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="create",
        resource_type="request",
        resource_id=request_id,
        details=f"Category: {result.ai_output.category if result.ai_output else 'N/A'}, Status: {result.status}",
        ip_address=_get_client_ip(request),
    )

    ai_output_response = None
    if result.ai_output is not None:
        ai_output_response = AIOutputResponse(
            category=result.ai_output.category,
            confidence=result.ai_output.confidence,
            summary=result.ai_output.summary,
            risk=result.ai_output.risk,
            needs_human=result.ai_output.needs_human,
        )

    return WorkflowResultResponse(
        id=request_id,
        input_text=result.input_text,
        normalized_text=result.normalized_text,
        ai_output=ai_output_response,
        route_to=result.route_to,
        status=result.status,
        error_reason=result.error_reason,
        assigned_to=None,
        updated_at=utcnow_iso(),
        timestamp=result.timestamp,
    )


@app.get("/requests", response_model=PaginatedRequestHistoryResponse)
def list_requests(
    request: Request,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
    search: str | None = None,
    current_user: TokenData = Depends(get_current_active_user),
):
    if limit > MAX_PAGE_LIMIT:
        limit = MAX_PAGE_LIMIT
    if limit < 1:
        limit = DEFAULT_PAGE_LIMIT
    if offset < 0:
        offset = 0

    results = get_requests(limit=limit, search=search, organization_id=current_user.organization_id, offset=offset)
    total = count_requests(organization_id=current_user.organization_id, search=search)

    record_audit_log(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="list",
        resource_type="request",
        details=f"Listed requests: limit={limit}, offset={offset}, search={search or ''}",
        ip_address=_get_client_ip(request),
    )

    return {
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/stats", response_model=StatsResponse)
def get_dashboard_stats(current_user: TokenData = Depends(get_current_active_user)):
    return get_stats(organization_id=current_user.organization_id)


@app.get("/requests/review", response_model=PaginatedRequestHistoryResponse)
def get_review_queue(
    request: Request,
    limit: int = DEFAULT_PAGE_LIMIT,
    offset: int = 0,
    current_user: TokenData = Depends(get_current_active_user),
):
    if limit > MAX_PAGE_LIMIT:
        limit = MAX_PAGE_LIMIT
    if limit < 1:
        limit = DEFAULT_PAGE_LIMIT
    if offset < 0:
        offset = 0

    results = get_review_requests(organization_id=current_user.organization_id)
    total = len(results)
    results = results[offset:offset + limit]

    return {
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/requests/{request_id}", response_model=RequestHistoryItem)
def get_request(request: Request, request_id: int, current_user: TokenData = Depends(get_current_active_user)):
    record = get_request_by_id(request_id, organization_id=current_user.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Request not found")

    record_audit_log(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="view",
        resource_type="request",
        resource_id=request_id,
        ip_address=_get_client_ip(request),
    )

    return record


@app.patch("/requests/{request_id}/status", response_model=ReviewTicketResponse)
def update_ticket_status(request: Request, request_id: int, payload: StatusUpdateRequest, current_user: TokenData = Depends(get_current_active_user)):
    valid_statuses = {"new", "triaged", "assigned", "in_review", "resolved", "human_review"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}")

    # Check if trying to resolve a high-risk ticket - admin only
    if payload.status == "resolved":
        existing = get_request_by_id(request_id, organization_id=current_user.organization_id)
        if existing and existing.get("risk") == "high" and current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin privileges required to resolve high-risk tickets"
            )

    updated = update_request_status(
        request_id=request_id,
        organization_id=current_user.organization_id,
        new_status=payload.status,
        assigned_to=payload.assigned_to,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Request not found")

    record_audit_log(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="status_update",
        resource_type="request",
        resource_id=request_id,
        details=f"Status changed to {payload.status}, assigned_to={payload.assigned_to}",
        ip_address=_get_client_ip(request),
    )

    return updated


@app.patch("/requests/batch/status", response_model=BatchStatusUpdateResponse)
def batch_update_ticket_status(request: Request, payload: BatchStatusUpdateRequest, current_user: TokenData = Depends(require_admin)):
    valid_statuses = {"new", "triaged", "assigned", "in_review", "resolved", "human_review"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}")
    
    if not payload.request_ids:
        raise HTTPException(status_code=400, detail="request_ids cannot be empty")
    
    if len(payload.request_ids) > 100:
        raise HTTPException(status_code=400, detail="Cannot update more than 100 requests at once")

    updated_count = 0
    failed_count = 0
    results = []

    for request_id in payload.request_ids:
        try:
            updated = update_request_status(
                request_id=request_id,
                organization_id=current_user.organization_id,
                new_status=payload.status,
                assigned_to=payload.assigned_to,
            )
            if updated is None:
                failed_count += 1
                results.append({"request_id": request_id, "success": False, "error": "Not found"})
            else:
                updated_count += 1
                results.append({"request_id": request_id, "success": True})
        except Exception as e:
            failed_count += 1
            results.append({"request_id": request_id, "success": False, "error": str(e)})

    if updated_count > 0:
        record_audit_log(
            organization_id=current_user.organization_id,
            user_id=current_user.user_id,
            action="batch_status_update",
            resource_type="request",
            resource_id=None,
            details=f"Batch updated {updated_count} requests to {payload.status}, assigned_to={payload.assigned_to}",
            ip_address=_get_client_ip(request),
        )

    return {
        "updated": updated_count,
        "failed": failed_count,
        "results": results
    }


@app.post("/requests/{request_id}/comments", response_model=CommentResponse)
def create_ticket_comment(request: Request, request_id: int, payload: CommentCreate, current_user: TokenData = Depends(get_current_active_user)):
    record = get_request_by_id(request_id, organization_id=current_user.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Request not found")

    if not payload.content or not payload.content.strip():
        raise HTTPException(status_code=400, detail="Comment content is required")

    comment_id = create_comment(
        request_id=request_id,
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        content=payload.content.strip(),
    )

    user = get_user_by_id(current_user.user_id)
    user_name = user["name"] if user else None

    record_audit_log(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="comment",
        resource_type="request",
        resource_id=request_id,
        details=f"Comment added: {payload.content[:100]}",
        ip_address=_get_client_ip(request),
    )

    return {
        "id": comment_id,
        "request_id": request_id,
        "user_id": current_user.user_id,
        "user_name": user_name,
        "content": payload.content.strip(),
        "created_at": utcnow_iso(),
    }


@app.get("/requests/{request_id}/comments", response_model=CommentsResponse)
def list_ticket_comments(request: Request, request_id: int, current_user: TokenData = Depends(get_current_active_user)):
    record = get_request_by_id(request_id, organization_id=current_user.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Request not found")

    comments = get_comments_for_request(request_id, organization_id=current_user.organization_id)

    results = []
    for comment in comments:
        user = get_user_by_id(comment["user_id"])
        results.append({
            "id": comment["id"],
            "request_id": comment["request_id"],
            "user_id": comment["user_id"],
            "user_name": user["name"] if user else None,
            "content": comment["content"],
            "created_at": comment["created_at"],
        })

    record_audit_log(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="view_comments",
        resource_type="request",
        resource_id=request_id,
        ip_address=_get_client_ip(request),
    )

    return {"results": results}


@app.get("/audit/logs")
def get_audit_logs(
    request: Request,
    limit: int = 100,
    offset: int = 0,
    resource_type: str | None = None,
    current_user: TokenData = Depends(get_current_active_user),
):
    from src.audit import get_audit_logs as get_audit_logs_db
    logs = get_audit_logs_db(
        organization_id=current_user.organization_id,
        limit=limit,
        offset=offset,
        resource_type=resource_type,
    )
    return {"results": logs, "limit": limit, "offset": offset}
