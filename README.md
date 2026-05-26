# 🏛 MCP-Matcher Global Treasury Agent

> **Cross-border payment reconciliation for Malaysian SMEs — powered by AI agents and MCP tools.**

---

## 🎯 The Problem

- **Complex payment patterns** — A customer pays one invoice in two transfers, or combines two invoices into one payment. Every existing tool marks these as unmatched with no explanation, leaving finance staff to figure it out manually.
- **Manual matching wastes hours** — Finance staff manually scroll through hundreds of invoices to match each bank transaction one by one. A single monthly statement can take 3–4 hours to reconcile, every month-end, with no guarantee of accuracy.
- **Wrong FX rate** — Tools like Xero and QuickBooks compare against today's exchange rate, not the rate on the day the customer actually paid. Every cross-border payment shows a false mismatch even when the amount is perfectly correct.

---

## 💡 Our Solution

**Global Treasury Agent** is an MCP AI-powered reconciliation agent that:

1. **Reads invoices** (images or PDFs) using vision AI — any layout, any language
2. **Fetches the historical FX rate** from the exact payment date — not today's rate
3. **Decodes Malaysian bank descriptions** — DuitNow, IBFT, IBG, TT formats
4. **Scores each match** using amount tolerance, date proximity, and fuzzy reference matching
5. **Explains** in plain English and sends uncertain cases to a human reviewer
6. **Logs every agent action** with timestamps for full auditability

---

## 🆚 Why Not Just Use Excel / SQL Accounting / Xero?

| Feature                      | Excel    | SQL Accounting | Xero / QuickBooks   | **Global Treasury Agent**               |
| ---------------------------- | -------- | -------------- | ------------------- | --------------------------------------- |
| Historical FX rate matching  | ✗ Manual | ✗ None         | ✗ Today's rate only | ✅ Payment date rate                    |
| Malaysian bank desc. parsing | ✗ Manual | ✗ Manual       | ✗ Not supported     | ✅ Auto-parsed (DuitNow, IBFT, IBG, TT) |
| Split payment detection      | ✗ No     | ✗ No           | ✗ No                | ✅ Flagged with explanation             |
| Combined invoice detection   | ✗ No     | ✗ No           | ✗ No                | ✅ Flagged with explanation             |
| Exception explanation        | ✗ None   | ✗ None         | ✗ Binary only       | ✅ Plain English reason                 |
| Full audit trail             | ✗ None   | ✗ Basic        | ✓ Basic             | ✅ Full agent timeline                  |
| Cost                         | Free     | ~RM 1,800/yr   | ~RM 2,400/yr        | ✅ Free APIs                            |

**The core insight:** Xero creates false mismatches every time FX rates move between payment date and today. SQL Accounting makes your finance staff manually drag-and-match every single bank transaction. We solve both.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           INPUTS                                │
│  Invoice PDFs / Images            Bank Statement CSV            │
└──────────────┬──────────────────────────────┬──────────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP ORCHESTRATOR AGENT                       │
│         Decides which tools to call and in what order           │
│         Handles retries, skips, and edge case routing           │
└──────┬──────────────┬──────────────┬──────────────┬────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  ┌─────────┐   ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │  MCP    │   │  MCP     │  │  MCP     │  │  MCP         │
  │ Tool 1  │   │ Tool 2   │  │ Tool 3   │  │ Tool 4       │
  │         │   │          │  │          │  │              │
  │extract_ │   │parse_    │  │convert_  │  │parse_bank_   │
  │document │   │bank_csv  │  │currency  │  │description   │
  │         │   │          │  │          │  │              │
  │Groq     │   │Pandas    │  │fawazahmed│  │Chutes        │
  │Llama 4  │   │(Python)  │  │0 API     │  │DeepSeek V3   │
  │Scout    │   │          │  │HISTORICAL│  │(LLM)         │
  │Vision   │   │          │  │FX DATE   │  │              │
  └────┬────┘   └────┬─────┘  └────┬─────┘  └──────┬───────┘
      │              │              │               │
      └──────────────┴──────────────┴───────────────┘
                            │
                            ▼
        ┌─────────────────────────────────────┐
        │          MCP Tool 5                 │
        │        match_transaction            │
        │        Pure Python — no LLM         │
        │                                     │
        │  3 MATCHING METRICS:                │
        │                                     │
        │  1. Transaction Amount  (40% weight)│
        │     Invoice expected MYR vs         │
        │     bank credit amount              │
        │     ±2% FX tolerance band           │
        │                                     │
        │  2. Transaction Date    (30% weight)│
        │     Invoice date vs bank txn date   │
        │     scored by days apart (0–7 days) │
        │                                     │
        │  3. Reference Match     (30% weight)│
        │     Invoice no + customer name vs   │
        │     parsed_reference + parsed_      │
        │     customer (rapidfuzz ratio)      │
        │                                     │
        │  → Confidence score 0–100%          │
        └────────────┬────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────────┐
        │        Reconciliation Engine        │
        │  · Plain-English explanation        │
        │  · Confidence breakdown             │
        │  · Amount gap + FX variance         │
        │  · Reference match strength         │
        │  · Split / combined payment signal  │
        └────────────┬────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────────┐
        │          MCP Tool 6                 │
        │       classify_exception            │
        │       Chutes DeepSeek V3            │
        └────────────┬────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────────┐
        │           Human Review              │
        │         /review dashboard           │
        │                                     │
        │   Human ALWAYS makes the final      │
        │   decision regardless of score.     │
        │   Agent assists, human decides.     │
        │                                     │
        │         Approve / Reject            │
        └────────────┬────────────────────────┘
                     │
                     ▼
              ┌──────────────────────┐
              │  Supabase audit log  │
              │  Every MCP tool call │
              │  logged with:        │
              │  · tool name         │
              │  · model used        │
              │  · inputs + outputs  │
              │  · timestamp         │
              └──────────────────────┘
```

### Core Principle

> **LLM Analyst. LLM Match. LLM explains. Python calculates. Rules decide. Human approves.**

---

## 🛠 Tech Stack

### Frontend

- **Next.js 16** (App Router) — React framework
- **React 19** — UI library
- **Tailwind CSS** — utility-first styling
- **Recharts** — data visualisation

### Backend

- **FastAPI** (Python) — REST API
- **Pandas** — bank CSV parsing
- **Pydantic** — data validation
- **rapidfuzz** — fuzzy string matching for reference comparison

### AI / LLM

- **Groq** (`meta-llama/llama-4-scout-17b-16e-instruct`) — invoice extraction (PDF text + OCR)
- **Chutes** (`deepseek-ai/DeepSeek-V3.2-TEE`) — bank description parsing + exception explanation

### Database

- **Supabase** (PostgreSQL) — stores invoices, transactions, match results, audit logs

### Free APIs

- **fawazahmed0 Exchange API** — historical FX rates by date, no API key required

---

## 🔧 MCP Tools

The agent exposes 6 MCP tools that the orchestrator calls based on context:

| Tool                     | Purpose                                    | Model / Library    |
| ------------------------ | ------------------------------------------ | ------------------ |
| `extract_document`       | Invoice image/PDF → structured JSON        | Groq Llama 4 Scout |
| `parse_bank_csv`         | Bank CSV → list of credit transactions     | Pandas             |
| `convert_currency`       | Foreign amount → MYR using historical rate | fawazahmed0 API    |
| `parse_bank_description` | Messy bank text → customer + reference     | Chutes DeepSeek V3 |
| `match_transaction`      | Score invoice vs transactions (0–100%)     | Pure Python        |
| `classify_exception`     | Explain why match failed in plain English  | Chutes DeepSeek V3 |

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
TAgent/
├── frontend/                     # Next.js 16
│   ├── app/
│   │   ├── page.tsx              # Upload page (/)
│   │   ├── review/page.tsx       # Review page (/review)
│   │   ├── history/page.tsx      # History page (/history)
│   │   └── globals.css
│   ├── components/
│   │   ├── PendingQueue.tsx
│   │   ├── CaseDetail.tsx
│   │   ├── ConfidenceBreakdown.tsx
│   │   ├── AuditTrail.tsx
│   │   ├── HistoryTable.tsx
│   │   ├── GroupDetail.tsx
│   │   ├── Sidebar.tsx
│   │   ├── StatusBadge.tsx
│   │   └── Toast.tsx
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
│   │   ├── groq_extractor.py     # Groq invoice extraction
│   │   ├── ocr_extractor.py      # Local OCR fallback
│   │   ├── gemini.py             # Legacy Groq vision path
│   │   ├── fx.py                 # fawazahmed0 FX API
│   │   ├── chutes.py             # Chutes LLM client
│   │   └── matcher.py            # Pure Python scoring
│   ├── db/
│   │   └── supabase_client.py
│   └── models/
│       └── schemas.py
│
└── supabase_schema.sql           # Run this in Supabase SQL editor
└── supabase_migration_multi_scenario.sql  # Multi-scenario extension
```

---

## 🗄 Database Schema

Run the SQL files in this order:

1. [supabase_schema.sql](supabase_schema.sql) — base tables
2. [supabase_migration_multi_scenario.sql](supabase_migration_multi_scenario.sql) — multi-scenario fields and `match_groups`

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
git clone https://github.com/JokerHin/MCP-Matcher
cd TAgent
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows (PowerShell): .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your keys:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key
GROQ_API_KEY=your-groq-api-key
CHUTES_API_KEY=your-chutes-api-key
```

Run the database schema in your Supabase SQL Editor:

```bash
# 1) Run supabase_schema.sql
# 2) Run supabase_migration_multi_scenario.sql
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

Poppler is required for `pdf2image` (used by the legacy Groq vision path in [backend/services/gemini.py](backend/services/gemini.py)).
Download Poppler from [oschwartz10612/poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases), extract, and add the `bin/` folder to your system PATH.

---

## 🧪 Test Data

Use [sample_bank.csv](sample_bank.csv) as a simple starter bank statement for local testing.

---

## 📱 Pages

| Route      | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| `/`        | Upload invoice (PDF/image) and bank statement (CSV)          |
| `/review`  | Two-column review — pending queue left, case detail right    |
| `/history` | Decision history with Approved/Rejected tabs and audit trail |

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
