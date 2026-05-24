# Global Treasury Agent

Cross-border payment reconciliation for Malaysian SMEs. Matches foreign currency invoices against MYR bank transactions using **historical FX rates** from the invoice date.

---

## Quick Start

### 1. Database — Run SQL in Supabase

Go to your Supabase project → SQL Editor → paste `supabase_schema.sql` and run it.

### 2. Backend

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

# ⚠️ Windows: pdf2image requires Poppler
# Download: https://github.com/oschwartz10612/poppler-windows/releases
# Extract and add the bin/ folder to your PATH

# Run
uvicorn main:app --reload
# API docs: http://localhost:8000/docs
```

### 3. Frontend

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

### Backend (`backend/.env`)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Service role key (not anon) |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `CHUTES_API_KEY` | Chutes.ai API key |

### Frontend (`frontend/.env.local`)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_API_URL` | Backend URL (default: http://localhost:8000) |

---

## Sample Test Data

**Invoice:** INV-1023 · ABC Pte Ltd · USD 100 · 2026-05-20

**Bank CSV** (`sample_bank.csv`):
```
date,description,credit,debit
2026-05-20,IBFT CR ABC TRADING SDN BHD INV1023,468.20,
```

**Expected result:**
- FX rate ~4.68 → expected MYR ≈ 468.00
- Received MYR = 468.20 → variance +0.20 (<2%)
- Confidence ≥ 85% → **auto-matched** ✅

---

## Architecture

```
Upload Invoice (PDF/IMG)  →  Gemini 2.0 Flash  →  Extract fields
Upload Bank CSV           →  Pandas            →  Parse transactions
                                                         ↓
                          FX API (historical date)  →  expected_myr
                                                         ↓
                          DeepSeek-V3           →  Parse descriptions
                                                         ↓
                          Pure Python scoring   →  Confidence + status
                                                         ↓
                    ≥85%: Auto-match    <85%: DeepSeek-V3 explanation
                                                         ↓
                                        Human: Approve / Reject
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tools/extract-document` | Gemini invoice extraction |
| POST | `/tools/parse-bank-csv` | Parse bank CSV |
| POST | `/tools/convert-currency` | Historical FX conversion |
| POST | `/tools/parse-bank-description` | DeepSeek description parser |
| POST | `/tools/match-transaction` | Pure Python match scoring |
| POST | `/tools/classify-exception` | DeepSeek exception classifier |
| POST | `/reconcile` | Full orchestration pipeline |
| GET | `/dashboard` | Stats + all results |
| PATCH | `/results/{id}/decision` | Human approve/reject |

Interactive docs: http://localhost:8000/docs
# MCP-Matcher
# MCP-Matcher
