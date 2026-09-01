# Runbook: AI Customer Request Triage & Routing System

## 1. Project Purpose

The AI Customer Request Triage & Routing System is a production-ready SaaS platform for automatically classifying, validating, routing, and managing customer support requests using AI. It provides:

- Automated AI classification of customer messages
- Risk and confidence assessment
- Automatic routing to appropriate teams or human review
- Complete ticket lifecycle management
- Multi-tenant organization isolation
- Audit logging and compliance tracking
- Professional agent dashboard

## 2. Setup

### Virtual Environment
A Python virtual environment is included in the project at `venv/`.

**Windows (PowerShell):**
```powershell
venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
venv\Scripts\activate.bat
```

### Install Requirements
```bash
pip install -r requirements.txt
```

### Environment Configuration
1. Copy `.env.example` to `.env`
2. Configure required environment variables
3. **Critical**: Change `SECRET_KEY` in production

## 3. Run the Project and Tests

### Start the development server
```bash
uvicorn src.api:app --reload
```

### Run the full test suite
```bash
pytest
```

### Run a single workflow from Python
```python
from src.workflow import run_workflow, export_workflow
result = run_workflow("I was charged twice for my subscription.")
export_workflow(result)
```

## 4. Workflow

1. **Receive input** — Accept a raw customer message string.
2. **Normalize** — Lowercase, trim, and collapse whitespace.
3. **AI classification** — Call the classifier (mock or real) to produce structured output.
4. **Parse JSON** — The real classifier returns JSON; `json.loads()` is wrapped to catch malformed JSON.
5. **Validate structured output** — Check category, confidence, risk, needs_human, and summary against allowed values and business rules.
6. **Apply confidence/risk policy** — Low confidence (< 0.80) or high risk routes to `human_review`.
7. **Route request** — Send to the correct team or `human_review`.
8. **Human review when required** — If `needs_human` is true, or risk is high, or confidence is low, the request is routed to `human_review`.
9. **Persist and export** — Store in database and export evidence for audit.

## 5. Ticket Lifecycle

### Statuses
- `new` — Ticket created
- `triaged` — AI classification complete
- `assigned` — Assigned to an agent
- `in_review` — Agent actively reviewing
- `resolved` — Ticket resolved
- `human_review` — Requires human attention (legacy)

### Transitions
- Any ticket can be assigned to an agent
- Agents can move tickets through the lifecycle
- Resolved tickets exit the active review queue
- All status changes are logged to the audit trail

## 6. Human Review Queue

Agents can:
- View all tickets requiring review via `GET /requests/review`
- Inspect complete ticket details
- See why human review was triggered (high risk, low confidence, needs_human)
- Assign tickets to themselves or other agents
- Move tickets to `in_review` or `resolved`
- Add comments to tickets
- Search and filter tickets

## 7. Safety Behavior

- **High-risk requests** — Any request with `risk == "high"` is automatically routed to human review.
- **Low-confidence requests** — Any request with `confidence < 0.80` is automatically routed to human review.
- **Empty/malformed input** — Produces a `WorkflowResult` with `route_to="error"`, `status="error"`.
- **Invalid JSON** — If the real AI classifier returns invalid JSON, `json.loads()` does not produce an uncontrolled exception. The workflow identifies this as a parse failure.
- **Invalid AI output** — If the classifier output fails schema or business-rule validation, the workflow returns a validation error.
- **Untrusted input** — Customer messages are treated as untrusted input. The classifier prompt explicitly instructs the model not to follow embedded instructions and not to contact the customer.
- **Prompt-injection attempts** — Customer messages that contain prompt-injection attempts are classified normally by the AI. The workflow does not execute embedded instructions.

## 8. Security Model

- **Authentication**: JWT-based with bcrypt password hashing
- **Authorization**: Role-based (admin, agent)
- **Data Isolation**: Organization-scoped all data access
- **Audit Logging**: All important actions logged with user, timestamp, and IP
- **Input Validation**: Pydantic models validate all API inputs
- **CORS**: Configurable origin restrictions
- **Rate Limiting**: Optional in-memory rate limiting (enable in production)
- **Secrets**: Environment variable configuration, no hard-coded credentials

## 9. Database

- **SQLite** for simplicity and portability
- Organization-scoped tables with foreign key relationships
- Indexed on organization_id for performance
- Audit log with resource-type indexing
- Automatic schema migration for new columns

### Tables
- `organizations` — Workspace/organization data
- `users` — User accounts with password hashes
- `memberships` — User-organization relationships with roles
- `requests` — Customer support tickets
- `comments` — Ticket comments and collaboration
- `audit_log` — Action audit trail

## 10. API Quality

- **Request/response schemas**: Pydantic models for validation
- **HTTP status codes**: Appropriate codes for all responses
- **Error handling**: Standardized error responses
- **Pagination**: Limit/offset on all list endpoints
- **Validation**: Input validation with clear error messages
- **Documentation**: Auto-generated OpenAPI/Swagger docs

## 11. Testing

Current successful test result:

```
59 passed
```

All tests use the mock classifier by default (`USE_MOCK_CLASSIFIER = True` when `OPENAI_API_KEY` is not set), ensuring deterministic, repeatable local test runs.

### Test Categories
- **Auth**: Registration, login, token refresh, protected endpoints
- **Tenancy**: Organization isolation, cross-organization access rejection
- **Triage**: Billing, technical, sales, other categories; risk and confidence
- **Safety**: Empty input, malformed input, invalid JSON, prompt injection
- **Tickets**: Creation, history, detail, assignment, status transitions, review queue, resolution
- **Comments**: Creation, listing, cross-organization isolation
- **API**: Validation, correct status codes, error handling
- **Statistics**: Organization-scoped statistics accuracy
- **Audit**: Audit log creation and retrieval

## 12. Production Deployment

### Required Configuration

```bash
# .env
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=<strong-random-key>
OPENAI_API_KEY=<your-openai-key>
CORS_ORIGINS=https://yourdomain.com
DATABASE_PATH=/var/lib/triage/requests.db
```

### Recommended Stack
- **WSGI Server**: Uvicorn with Gunicorn
- **Database**: PostgreSQL (replace SQLite)
- **Cache/Queue**: Redis for rate limiting and background tasks
- **Monitoring**: Prometheus + Grafana or similar
- **Logging**: Structured JSON logging to centralized system

### Docker Deployment

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f api

# Stop
docker-compose down
```

### Docker Configuration

The project includes:
- `Dockerfile` - Multi-stage build with Python 3.12
- `docker-compose.yml` - Single-service deployment with volume mount
- `.dockerignore` - Excludes unnecessary files

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes (prod) | `CHANGE_ME...` | JWT signing secret |
| `OPENAI_API_KEY` | No | - | OpenAI API key for real classifier |
| `DATABASE_PATH` | No | `data/requests.db` | SQLite database path |
| `ENVIRONMENT` | No | `development` | `production` or `development` |
| `DEBUG` | No | `true` | Enable debug mode |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `FRONTEND_API_BASE` | No | - | Override API base URL for frontend |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | JWT access token TTL |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | No | `10080` | JWT refresh token TTL (7 days) |

### Health Checks

- `GET /health` - Application health
- `GET /health/ready` - Readiness check (includes database connectivity)

### Security Checklist

- [ ] Set strong `SECRET_KEY` in production
- [ ] Configure `CORS_ORIGINS` to specific domains
- [ ] Enable `DEBUG=false` in production
- [ ] Use HTTPS in production
- [ ] Set strong `OPENAI_API_KEY` if using real classifier
- [ ] Configure database backups
- [ ] Enable rate limiting (`RATE_LIMIT_ENABLED=true`)
- [ ] Restrict file permissions on `.env`

### Troubleshooting

#### Database locked
SQLite does not handle high-concurrency writes well. For production, migrate to PostgreSQL.

#### JWT token expired
Use the refresh token endpoint (`POST /auth/refresh`) to get a new access token.

#### CORS errors
Ensure `CORS_ORIGINS` includes your frontend domain.

#### Tests failing
Ensure the virtual environment is activated and dependencies are installed. Run `pytest` from the project root.

#### Docker health check failing
Check that the database volume is writable and the application has started correctly:
```bash
docker-compose logs api
```

