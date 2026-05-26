# 🏛 MCP-Matcher Global Treasury Agent

> **Cross-border payment reconciliation for Malaysian SMEs — powered by AI agents and MCP tools.**

Built for the **APU AIC Hackathon 2026** · Sponsored by [Chutes](https://chutes.ai) · [Morpheus](https://morpheus.network)

---

## 🎯 The Problem

Malaysian SMEs receive a bank notification: **MYR 468.20 received**. Their invoice was for **USD 100**. Manually reconciling this means:

- Converting USD → MYR using today's rate (which may be wrong — the customer paid 3 days ago at a different rate)
- Decoding the bank description: `IBFT CR 2605 MOHD RAZIF BIN AHMAD ABC TRADING INV1023`
- Logging the match, variance, and FX rate used — by hand, in Excel

Multiply this by 50–200 invoices per month. That's **3+ hours of manual work** every month-end, with no audit trail and constant false mismatches.

---

## 💡 Our Solution

**Global Treasury Agent** is an AI-powered reconciliation agent that:

1. **Reads invoices** (images or PDFs) using vision AI — any layout, any language
2. **Fetches the historical FX rate** from the exact payment date — not today's rate
3. **Decodes Malaysian bank descriptions** — DuitNow, IBFT, IBG, TT formats
4. **Scores each match** using amount tolerance, date proximity, and fuzzy reference matching
5. **Explains failures** in plain English and sends uncertain cases to a human reviewer
6. **Logs every agent action** with timestamps for full auditability

---

## 🆚 Why Not Just Use Excel / SQL Accounting / Xero?

| Feature | Excel | SQL Accounting | Xero / QuickBooks | **Global Treasury Agent** |
|---|---|---|---|---|
| Historical FX rate matching | ✗ Manual | ✗ None | ✗ Today's rate only | ✅ Payment date rate |
| Malaysian bank desc. parsing | ✗ Manual | ✗ Manual | ✗ Not supported | ✅ Auto-parsed (DuitNow, IBFT, IBG, TT) |
| Split payment detection | ✗ No | ✗ No | ✗ No | ✅ Flagged with explanation |
| Combined invoice detection | ✗ No | ✗ No | ✗ No | ✅ Flagged with explanation |
| Exception explanation | ✗ None | ✗ None | ✗ Binary only | ✅ Plain English reason |
| Full audit trail | ✗ None | ✗ Basic | ✓ Basic | ✅ Full agent timeline |
| Cost | Free | ~RM 1,800/yr | ~RM 2,400/yr | ✅ Free APIs |

**The core insight:** Xero creates false mismatches every time FX rates move between payment date and today. SQL Accounting makes your finance staff manually drag-and-match every single bank transaction. We solve both.

---

## 🏗 Architecture

```
Invoice (PDF/image)          Bank Statement (CSV)
        │                            │
        ▼                            ▼
┌─────────────────┐      ┌────────────────────┐
│ extract_document│      │  parse_bank_csv    │
│  Groq Llama 4   │      │     Pandas         │
│  Scout Vision   │      └────────┬───────────┘
└────────┬────────┘               │
         │                        ▼
         │              ┌────────────────────┐
         │              │parse_bank_desc     │
         │              │  Chutes DeepSeek   │
         │              │  V3 (LLM)          │
         │              └────────┬───────────┘
         │                       │
         ▼                       │
┌─────────────────┐              │
│convert_currency │              │
│ fawazahmed0 API │◄─────────────┘
│ (payment date)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│         match_transaction           │
│  Pure Python — no LLM              │
│  Amount (40%) + Date (30%)         │
│  + Reference fuzzy match (30%)     │
│  → Confidence score 0–100%         │
└────────┬────────────────┬───────────┘
         │                │
    ≥ 85%│           < 85%│
         ▼                ▼
  ┌──────────┐    ┌───────────────────┐
  │  Auto-   │    │ classify_exception│
  │ Matched  │    │  Chutes LLM       │
  └──────────┘    │  explains why     │
                  └────────┬──────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Human Review   │
                  │  Approve/Reject │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Audit Trail    │
                  │  Full timeline  │
                  │  logged to DB   │
                  └─────────────────┘
```

### Core Principle
> **LLM explains. Python calculates. Rules decide. Human approves.**

---

## 🛠 Tech Stack

### Frontend
- **Next.js 14** (App Router) — React framework
- **Tailwind CSS** — utility-first styling
- **shadcn/ui** — component library
- **Recharts** — data visualisation

### Backend
- **FastAPI** (Python) — REST API
- **Pandas** — bank CSV parsing
- **Pydantic** — data validation
- **rapidfuzz** — fuzzy string matching for reference comparison

### AI / LLM
- **Groq** (`meta-llama/llama-4-scout-17b-16e-instruct`) — invoice vision extraction
- **Chutes** (`deepseek-ai/DeepSeek-V3-0324`) — bank description parsing + exception explanation

### Database
- **Supabase** (PostgreSQL) — stores invoices, transactions, match results, audit logs

### Free APIs
- **fawazahmed0 Exchange API** — historical FX rates by date, no API key required

---

## 🔧 MCP Tools

The agent exposes 6 MCP tools that the orchestrator calls based on context:

| Tool | Purpose | Model / Library |
|---|---|---|
| `extract_document` | Invoice image/PDF → structured JSON | Groq Llama 4 Scout |
| `parse_bank_csv` | Bank CSV → list of credit transactions | Pandas |
| `convert_currency` | Foreign amount → MYR using historical rate | fawazahmed0 API |
| `parse_bank_description` | Messy bank text → customer + reference | Chutes DeepSeek V3 |
| `match_transaction` | Score invoice vs transactions (0–100%) | Pure Python |
| `classify_exception` | Explain why match failed in plain English | Chutes DeepSeek V3 |

### Why MCP Instead of a Fixed Function Chain?

A hardcoded pipeline always runs every step in the same order. The MCP orchestrator **decides at runtime**:

- Skip `extract_document` if invoice is already structured
- Skip `parse_bank_description` if the description is trivially clear
- Retry `convert_currency` with fallback URL if primary API fails
- Call `classify_exception` only when confidence < 85%

This means the agent handles edge cases — split payments, combined invoices, missing references — without special-case code for every scenario.

---

## 📁 Project Structure

```
global-treasury-agent/
├── frontend/                     # Next.js 14
│   ├── app/
│   │   ├── page.tsx              # Upload page (/)
│   │   ├── review/page.tsx       # Review page (/review)
│   │   ├── history/page.tsx      # History page (/history)
│   │   ├── dashboard/page.tsx    # Dashboard (/dashboard)
│   │   └── globals.css
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── PendingQueue.tsx
│   │   ├── CaseDetail.tsx
│   │   ├── ConfidenceBreakdown.tsx
│   │   ├── AuditTrail.tsx
│   │   ├── HistoryTable.tsx
│   │   ├── AutoMatchedToday.tsx
│   │   └── ui/
│   │       ├── Badge.tsx
│   │       ├── Card.tsx
│   │       ├── ConfPill.tsx
│   │       └── Toast.tsx
│   └── lib/
│       ├── api.ts
│       └── types.ts
│
├── backend/                      # FastAPI
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   ├── tools.py              # 6 MCP tool endpoints
│   │   └── reconcile.py          # Orchestrator + dashboard
│   ├── services/
│   │   ├── vision.py             # Groq invoice extraction
│   │   ├── fx.py                 # fawazahmed0 FX API
│   │   ├── chutes.py             # Chutes LLM client
│   │   └── matcher.py            # Pure Python scoring
│   ├── db/
│   │   └── supabase_client.py
│   └── models/
│       └── schemas.py
│
└── supabase_schema.sql           # Run this in Supabase SQL editor
```

---

## 🗄 Database Schema

```sql
-- Invoices extracted from uploaded PDFs/images
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  invoice_no    text,
  customer      text,
  amount        numeric,
  currency      text,
  invoice_date  date,
  expected_myr  numeric,
  fx_rate       numeric,
  fx_date       date,
  created_at    timestamptz default now()
);

-- Credit transactions parsed from bank CSV
create table bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  transaction_date  date,
  description       text,
  parsed_customer   text,
  parsed_reference  text,
  credit_amount     numeric,
  created_at        timestamptz default now()
);

-- Match results produced by the agent
create table match_results (
  id                      uuid primary key default gen_random_uuid(),
  invoice_id              uuid references invoices(id),
  bank_transaction_id     uuid references bank_transactions(id),
  confidence              numeric,
  status                  text,   -- matched | review | exception
  variance                numeric,
  variance_pct            numeric,
  reason                  text,
  exception_type          text,
  exception_explanation   text,
  human_decision          text,   -- approved | rejected | null
  created_at              timestamptz default now()
);

-- Full agent action log for audit trail
create table agent_logs (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid references invoices(id),
  match_result_id   uuid references match_results(id),
  action            text,
  detail            text,
  created_at        timestamptz default now()
);
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- Supabase account (free tier)
- Groq API key (free at [console.groq.com](https://console.groq.com))
- Chutes API key (from [chutes.ai](https://chutes.ai))

### 1. Clone the repo

```bash
git clone https://github.com/your-username/global-treasury-agent.git
cd global-treasury-agent
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your keys:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
GROQ_API_KEY=your_groq_api_key
CHUTES_API_KEY=your_chutes_api_key
```

Run the database schema in your Supabase SQL Editor:
```bash
# Copy contents of supabase_schema.sql and run in Supabase dashboard
```

Start the backend:
```bash
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
```

Copy `.env.local.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the frontend:
```bash
npm run dev
# Runs on http://localhost:3000
```

### 4. Windows users — Poppler for PDF support

Download Poppler from [oschwartz10612/poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases), extract, and add the `bin/` folder to your system PATH.

---

## 🧪 Test Data

Sample test files are included in `/test-data/`:

### High confidence test (should auto-match ≥85%)
| File | Invoice | Expected bank match |
|---|---|---|
| `invoice_INV1023_USD100.pdf` | USD 100 · ABC Pte Ltd | `IBFT CR ABC PTE LTD INV-1023` · MYR 468.20 |
| `invoice_INV1024_SGD260.pdf` | SGD 260 · XYZ Trading | `DUITNOW CR XYZ TRADING PTE LTD INV-1024` · MYR 887.60 |
| `invoice_INV1025_USD500.pdf` | USD 500 · Tech Ventures | `IBG CREDIT TECH VENTURES INC INV-1025` · MYR 2341.10 |
| `bank_statement_high_confidence.csv` | All three above | — |

### Complex scenario test (should go to human review)
| File | Scenario | What the agent should detect |
|---|---|---|
| `scenario_A_INV2001_USD300.pdf` | 1 invoice, 2 transactions | Split payment — MYR 703.20 + MYR 703.50 = MYR 1406.70 |
| `scenario_B_INV2002_USD80.pdf` + `scenario_B_INV2003_USD120.pdf` | 2 invoices, 1 transaction | Combined payment — MYR 938.00 covers both |
| `bank_statement_complex.csv` | Both scenarios above | — |

---

## 📱 Pages

| Route | Description |
|---|---|
| `/` | Upload invoice (PDF/image) and bank statement (CSV) |
| `/review` | Two-column review — pending queue left, case detail right |
| `/history` | Decision history with Approved/Rejected tabs and audit trail |
| `/dashboard` | Stats overview and reconciliation chart |

---

## 🔍 Matching Algorithm

```
Confidence Score = (Amount Score × 0.40)
                 + (Date Score   × 0.30)
                 + (Ref Score    × 0.30)

Amount Score:
  diff% ≤ 2%  → 100  (within FX tolerance band)
  diff% ≤ 5%  → 80
  diff% ≤ 10% → 50
  diff% > 10% → 0

Date Score:
  days apart = 0–1 → 100
  days apart = 2–3 → 80
  days apart = 4–7 → 50
  days apart > 7   → 0

Reference Score:
  rapidfuzz token_sort_ratio between:
  - invoice.customer vs parsed_customer
  - invoice.invoice_no vs parsed_reference
  → takes the higher of the two scores

Decision threshold:
  ≥ 85% → Auto-matched
  60–84% → Needs human review
  < 60% → Exception
```

---

## 🌐 Free APIs Used

### fawazahmed0 Exchange API
```
Primary:  https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/{base}.json
Fallback: https://{date}.currency-api.pages.dev/v1/currencies/{base}.json

Example:
GET .../currency-api@2026-05-20/v1/currencies/usd.json
→ { "usd": { "myr": 4.6820, ... } }
```
- No API key required
- Updated daily
- Historical dates supported (use YYYY-MM-DD)
- Always implement fallback URL

---

## 👥 Target Audience

**Malaysian SME finance teams** who:
- Receive 20–200 cross-border invoices per month in USD, SGD, EUR, IDR
- Currently reconcile manually in Excel or SQL Accounting
- Spend 2–4 hours per month-end on bank reconciliation
- Cannot afford enterprise ERP systems like SAP or Oracle

---

## 🏆 Hackathon

Built at **APU AIC Hackathon 2026**

**Problem statement:** The Global Treasury Agent — Build a reconciliation agent that processes payment proofs (images/PDFs) in various currencies and matches them against local bank statements.

**Sponsors:** Chutes · Morpheus · APU · AIC · Vida · Cloud Clubs

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ❤️ for Malaysian SMEs · APU AIC Hackathon 2026</sub>
</div>
