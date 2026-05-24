import sys
import os
import json
from pathlib import Path

# Ensure we can import from backend root
sys.path.append(str(Path(__file__).parent))

from fastapi.testclient import TestClient
from main import app
from db.supabase_client import get_supabase

client = TestClient(app)

def test_health():
    print("Testing /health...")
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    print(" [OK] /health passed!")

def test_convert_currency():
    print("Testing /tools/convert-currency...")
    payload = {
        "amount": 100.0,
        "from_currency": "USD",
        "to_currency": "MYR",
        "date": "2026-05-20"
    }
    response = client.post("/tools/convert-currency", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["original_amount"] == 100.0
    assert data["from_currency"] == "USD"
    assert data["to_currency"] == "MYR"
    assert "converted_amount" in data
    assert "rate_used" in data
    print(f" [OK] /tools/convert-currency passed! Rate: {data['rate_used']}, Converted: {data['converted_amount']} MYR")

def test_supabase_connection():
    print("Testing Supabase connection...")
    try:
        db = get_supabase()
        # Fetch 1 row from invoices to verify connection
        res = db.table("invoices").select("id").limit(1).execute()
        print(f" [OK] Supabase connection successful! Fetched: {len(res.data)} invoice rows.")
    except Exception as e:
        print(f" [FAIL] Supabase connection failed: {e}")
        sys.exit(1)

def test_parse_bank_csv():
    print("Testing /tools/parse-bank-csv...")
    # Create a dummy CSV payload
    csv_data = "date,description,credit,debit\n2026-05-20,IBFT CR ABC TRADING SDN BHD INV1023,468.20,\n"
    files = {"file": ("test_bank.csv", csv_data, "text/csv")}
    response = client.post("/tools/parse-bank-csv", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "transactions" in data
    assert data["count"] > 0
    print(f" [OK] /tools/parse-bank-csv passed! Saved {data['count']} transactions.")

if __name__ == "__main__":
    print("=== STARTING BACKEND INTEGRATION TESTS ===")
    try:
        test_health()
        test_supabase_connection()
        test_convert_currency()
        test_parse_bank_csv()
        print("\n=== ALL TESTS PASSED SUCCESSFULLY! The backend is working perfectly ===")
    except AssertionError as e:
        print(f"\n [FAIL] A test failed assertion. Check error trace: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n [FAIL] Test execution failed with error: {e}")
        sys.exit(1)
