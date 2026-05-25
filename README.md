# MCP-Matcher

AI-assisted reconciliation for cross-border payments. MCP-Matcher matches foreign currency invoices against MYR bank transactions using historical FX rates, scenario detection, and confidence scoring. Review and approve results from a clean, fast UI.

---

## Highlights

- Multi-invoice reconciliation with grouped scenarios (split, consolidated, complex).
- Historical FX conversion based on invoice date.
- Confidence scoring with per-signal breakdown (amount, date, reference).
- Background processing with live progress indicators.
- Human-in-the-loop review and approval workflow.

---

## Project Structure

```
backend/   FastAPI service, matching logic, OCR, FX, database
frontend/  Next.js UI for upload, review, and history
```

---

## Quick Start

### 1) Database (Supabase)

Open your Supabase project -> SQL Editor -> paste and run:

- supabase_schema.sql

Optional sample data scripts:

- supabase_migration_multi_scenario.sql

### 2) Backend

```bash
cd backend

# Create .env from example
cp .env.example .env
# Edit .env with your keys

# Create virtualenv
python -m venv venv
.\venv\Scripts\activate   # Windows
# source venv/bin/activate  # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Windows: pdf2image requires Poppler
# https://github.com/oschwartz10612/poppler-windows/releases
# Add Poppler bin/ to your PATH

# Run
uvicorn main:app --reload
# API docs: http://localhost:8000/docs
```

### 3) Frontend

```bash
cd frontend

# Create .env.local from example
cp .env.local.example .env.local
# Edit with your Supabase keys

# Install and run
npm install
npm run dev
# Open: http://localhost:3000
```

---

## Environment Variables

### Backend (backend/.env)

| Variable | Description |
| --- | --- |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_KEY | Service role key |
| GEMINI_API_KEY | Google AI Studio key |
| CHUTES_API_KEY | Chutes.ai key |

### Frontend (frontend/.env.local)

| Variable | Description |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon/public key |
| NEXT_PUBLIC_API_URL | Backend URL (default: http://localhost:8000) |

---

## Usage Flow

1) Upload invoices (PDF/PNG/JPG) and a bank CSV.
2) OCR extracts invoice fields.
3) Bank CSV is parsed into transactions.
4) Historical FX converts invoice amounts to MYR.
5) Scenario engine reconciles matches and scores confidence.
6) Review and approve/reject results in the UI.

---

## Sample Data

Invoice example:

- INV-1023
- ABC Pte Ltd
- USD 100
- 2026-05-20

Bank CSV (sample_bank.csv):

```
date,description,credit,debit
2026-05-20,IBFT CR ABC TRADING SDN BHD INV1023,468.20,
```

Expected result:

- FX rate ~4.68 -> expected MYR ~468.00
- Received MYR 468.20 -> variance +0.20 (< 2%)
- Confidence >= 85% -> auto-matched

---

## Architecture

```
Upload Invoice (PDF/IMG)  ->  Gemini 2.0 Flash  ->  Extract fields
Upload Bank CSV           ->  Pandas            ->  Parse transactions
                                                         |
                          FX API (historical date)  ->  expected_myr
                                                         |
                          Groq / DeepSeek models   ->  Parse descriptions
                                                         |
                          Python scoring engine    ->  Confidence + status
                                                         |
                 >=85%: Auto-match    <85%: Explanation
                                                         |
                                         Human: Approve / Reject
```

---

## API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | /tools/extract-document | OCR invoice extraction |
| POST | /tools/parse-bank-csv | Parse bank CSV |
| POST | /tools/convert-currency | Historical FX conversion |
| POST | /tools/parse-bank-description | Description parser |
| POST | /tools/match-transaction | Match scoring |
| POST | /tools/classify-exception | Exception classifier |
| POST | /reconcile | Single-invoice pipeline |
| POST | /reconcile/multi | Multi-invoice pipeline |
| GET | /reconcile/dashboard | Results + groups |
| PATCH | /results/{id}/decision | Human approve/reject |
| PATCH | /groups/{id}/decision | Group approve/reject |

Interactive docs: http://localhost:8000/docs

---

## Frontend Pages

- / : Upload invoices and bank CSV
- /review : Pending review queue and detail panels
- /history : Historical reconciliation results

---

## Troubleshooting

- Missing Poppler (Windows): install Poppler and add bin/ to PATH for pdf2image.
- CORS errors: set NEXT_PUBLIC_API_URL to your backend URL.
- No matches: verify bank CSV credits and invoice currency/amounts.

---

## License

TBD
