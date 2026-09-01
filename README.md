# AI Customer Request Triage

A production-ready AI-powered customer support triage and routing platform. Automatically classify, validate, route, and manage customer support requests with AI-assisted human review workflows.

## Features

- **AI-Powered Triage**: Automatic classification into billing, technical, sales, or other categories
- **Risk Assessment**: Confidence scoring and risk level detection
- **Smart Routing**: Automatic routing to appropriate teams or human review
- **Human Review Queue**: Dedicated queue for high-risk or low-confidence requests
- **Ticket Lifecycle**: Full ticket management from creation to resolution
- **Collaboration**: Comments and assignment on review tickets
- **Organization Isolation**: Multi-tenant architecture with strict data isolation
- **Authentication**: Secure JWT-based authentication with refresh tokens
- **Audit Logging**: Complete audit trail of all important actions
- **Statistics Dashboard**: Real-time operational metrics
- **REST API**: Clean, documented API for all operations
- **Professional Dashboard**: Responsive web interface for agents and admins

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   FastAPI       │────▶│   SQLite        │
│   (Vanilla JS)  │◀────│   Backend       │◀────│   Database      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   AI Classifier │
                        │   (Mock/OpenAI) │
                        └─────────────────┘
```

### Core Components

- **Backend**: FastAPI with Pydantic validation
- **Database**: SQLite with organization-scoped tables
- **Authentication**: JWT tokens with bcrypt password hashing
- **Frontend**: Vanilla JavaScript dashboard
- **AI Layer**: Mock classifier for testing, OpenAI GPT-4o-mini for production

## Project Structure

```
├── src/
│   ├── api.py           # FastAPI application and endpoints
│   ├── auth.py          # Authentication utilities
│   ├── audit.py         # Audit logging system
│   ├── classifier.py    # AI/mock classifier
│   ├── config.py        # Configuration management
│   ├── db.py            # Database operations
│   ├── evaluation.py    # Checkpoint 2 evaluation
│   ├── main.py          # Legacy test runner
│   ├── models.py        # Data models
│   ├── routes.py        # Routing logic
│   └── workflow.py      # Core triage workflow
├── frontend/
│   ├── index.html       # Dashboard page
│   ├── styles.css       # Dashboard styles
│   └── app.js           # Dashboard logic
├── tests/
│   ├── test_api.py      # API endpoint tests
│   ├── test_auth.py     # Authentication tests
│   ├── test_comments.py # Comment system tests
│   ├── test_evaluation.py # Evaluation tests
│   ├── test_history.py  # History and persistence tests
│   ├── test_tickets.py  # Ticket lifecycle tests
│   └── test_workflow.py # Core workflow tests
├── exports/             # Workflow evidence and logs
├── data/                # SQLite database
├── requirements.txt     # Python dependencies
├── runbook.md           # Operational runbook
└── README.md            # This file
```

## Setup

### Prerequisites

- Python 3.10+
- Virtual environment (included as `venv/`)

### Installation

```bash
# Activate virtual environment
# Windows PowerShell:
venv\Scripts\Activate.ps1

# Windows Command Prompt:
venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Critical**: Change `SECRET_KEY` in production.

## Running the Application

### Start the backend server

```bash
uvicorn src.api:app --reload
```

### Access the application

- **Dashboard**: http://127.0.0.1:8000/
- **API Documentation**: http://127.0.0.1:8000/docs
- **Health Check**: http://127.0.0.1:8000/health

### Run tests

```bash
pytest
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user and organization |
| POST | `/auth/login` | Login and get access/refresh tokens |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/me` | Get current user info |

### Requests (Tickets)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/requests` | Submit customer request for triage |
| GET | `/requests` | List requests (paginated) |
| GET | `/requests/{id}` | Get request details |
| PATCH | `/requests/{id}/status` | Update ticket status |
| GET | `/requests/review` | Get human review queue |
| POST | `/requests/{id}/comments` | Add comment to ticket |
| GET | `/requests/{id}/comments` | List ticket comments |

### Statistics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Get dashboard statistics |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit/logs` | Get audit log entries (admin) |

## Authentication

The API uses JWT (JSON Web Tokens) for authentication:

1. Register or login to get `access_token` and `refresh_token`
2. Include the access token in the `Authorization` header: `Bearer <token>`
3. Refresh tokens when they expire using `/auth/refresh`

### Roles

- **admin**: Full access to organization settings and users
- **agent**: Can process tickets and add comments

## Ticket Lifecycle

```
┌─────┐    ┌───────┐    ┌─────────┐    ┌──────────┐    ┌────────┐
│ new │───▶│triaged│───▶│assigned │───▶│in_review │───▶│resolved│
└─────┘    └───────┘    └─────────┘    └──────────┘    └────────┘
    │                                                  ▲
    └──────────────────────────────────────────────────┘
```

### Status Values

- `new`: Ticket created, awaiting classification
- `triaged`: AI classification complete
- `assigned`: Ticket assigned to an agent
- `in_review`: Agent is actively reviewing
- `resolved`: Ticket is resolved
- `human_review`: Requires human attention (legacy, mapped to in_review)

## AI Classification

The system uses AI to classify customer requests:

- **Categories**: billing, technical, sales, other
- **Risk Levels**: low, medium, high
- **Confidence**: 0.0 to 1.0
- **Summary**: Concise description (≤20 words)

### Policy Rules

- High risk → Human review
- Confidence < 0.80 → Human review
- Invalid AI output → Error handling
- Malformed input → Safe rejection
- JSON parsing failure → Parse error
- Prompt injection → Ignored (system instructions protected)

### Mock Classifier

When `OPENAI_API_KEY` is not set, the system uses a deterministic mock classifier for testing and development.

## Data Isolation

- Every request belongs to an organization
- Users can only access their organization's data
- All endpoints enforce organization-level access control
- Audit logs are organization-scoped

## Security

- Passwords hashed with bcrypt
- JWT tokens with configurable expiration
- Refresh token rotation
- CORS configuration
- Input validation on all endpoints
- Organization-scoped data access
- Audit logging for all actions
- No plain-text credentials in responses

## Testing

Current test status: **59 passed**

### Test Coverage

- Authentication flows
- Organization isolation
- Ticket lifecycle
- AI triage scenarios
- Safety edge cases
- API validation
- Statistics accuracy
- Comment system
- Audit logging

## Production Considerations

Before deploying to production:

1. **Secrets**: Set strong `SECRET_KEY` and `OPENAI_API_KEY` via environment variables
2. **Database**: Consider migrating from SQLite to PostgreSQL for concurrent access
3. **CORS**: Restrict `CORS_ORIGINS` to your actual frontend domain
4. **HTTPS**: Always use HTTPS in production
5. **Rate Limiting**: Enable `RATE_LIMIT_ENABLED` for production
6. **Monitoring**: Add application monitoring and alerting
7. **Backups**: Implement database backup strategy
8. **Logging**: Forward audit logs to a centralized logging system

## Docker Deployment

### Build and run with Docker Compose

```bash
docker-compose up -d --build
```

### Access the application

- **Dashboard**: http://localhost:8000/
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Readiness Check**: http://localhost:8000/health/ready

### Environment variables for Docker

Set via `.env` file or environment:
- `SECRET_KEY` - Required for production
- `OPENAI_API_KEY` - For real AI classification
- `CORS_ORIGINS` - Allowed frontend origins
- `DATABASE_PATH` - Database file path (default: `/data/requests.db`)

### Volumes

- `./data:/data` - Persists SQLite database

## Known Limitations

- SQLite is used for simplicity; PostgreSQL recommended for production
- No email notifications (future enhancement)
- No password reset flow (future enhancement)
- No role-based UI differentiation (future enhancement)
- In-memory rate limiting (future: Redis-backed)
- No automated test coverage for frontend (future: Playwright)

## License

Proprietary - All rights reserved.
