# Fuel Management System

A full-stack fuel management system for tracking nozzle readings, sales, and discrepancies with OCR validation.

## Technology Stack

### Backend
- Python 3.11+
- FastAPI (async web framework)
- PostgreSQL (database)
- SQLAlchemy (ORM with async support)
- Alembic (database migrations)
- Pydantic (data validation)

### Frontend
- Next.js 14
- React 18
- TypeScript
- SWR (data fetching)

## Project Structure

```
fuel-management/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── models/      # Database models
│   │   ├── services/    # Business logic
│   │   └── main.py      # Application entry point
│   ├── alembic/         # Database migrations
│   └── requirements.txt
├── frontend/            # Next.js frontend
│   ├── pages/          # Next.js pages
│   ├── lib/            # Utilities and API clients
│   └── package.json
├── docker-compose.yml   # PostgreSQL container
└── README.md
```

## Quick Start

### 1. Database Setup

Start PostgreSQL using Docker:
```bash
docker-compose up -d
```

Or install PostgreSQL locally and create database:
```bash
createdb fuel_management
```

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy environment file
cp ../.env.example .env

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

Backend will be available at: http://localhost:8000
API docs at: http://localhost:8000/docs

### 3. Frontend Setup

```bash
cd frontend
npm install

# Copy environment file
cp ../.env.example .env.local

# Start development server
npm run dev
```

Frontend will be available at: http://localhost:3000

## Features

- **User Authentication**: Role-based access (Admin, Manager, Attendant)
- **Nozzle Management**: Track fuel nozzles and readings
- **Reading Validation**: OCR + manual entry with discrepancy detection
- **Sales Tracking**: Record and validate fuel sales
- **Reporting**: Daily summaries and analytics
- **Discrepancy Management**: Flag and review anomalies

## Development

### Database Migrations

Create new migration:
```bash
cd backend
alembic revision --autogenerate -m "description"
```

Apply migrations:
```bash
alembic upgrade head
```

Rollback migration:
```bash
alembic downgrade -1
```

### Running Tests

Backend:
```bash
cd backend
pytest
```

Frontend:
```bash
cd frontend
npm test
```

## Environment Variables

See `.env.example` for required environment variables.

## License

Proprietary
