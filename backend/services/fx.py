import httpx
from typing import Tuple


PRIMARY_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/{base}.json"
FALLBACK_URL = "https://{date}.currency-api.pages.dev/v1/currencies/{base}.json"


async def fetch_rate(base: str, target: str, date: str) -> Tuple[float, str, str]:
    """
    Fetch exchange rate for base→target on a specific date.
    Tries primary CDN first, falls back to pages.dev mirror.
    Returns (rate, date_used, source_url).
    """
    base = base.lower()
    target = target.lower()

    urls = [
        PRIMARY_URL.format(date=date, base=base),
        FALLBACK_URL.format(date=date, base=base),
    ]

    last_error = None
    async with httpx.AsyncClient(timeout=10.0) as client:
        for url in urls:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                # Response structure: { "date": "...", "<base>": { "<target>": rate } }
                rate = data[base][target]
                date_used = data.get("date", date)
                return float(rate), date_used, url
            except Exception as e:
                last_error = e
                continue

    raise RuntimeError(f"FX API unavailable for {base}/{target} on {date}: {last_error}")


async def convert(amount: float, from_currency: str, to_currency: str, date: str) -> dict:
    """
    Convert amount from_currency → to_currency using historical rate on date.
    Returns full conversion result with tolerance band (±2%).
    """
    rate, date_used, source_url = await fetch_rate(from_currency, to_currency, date)
    converted = amount * rate
    tolerance_min = converted * 0.98
    tolerance_max = converted * 1.02
    
    # Determine which source was used
    if "jsdelivr" in source_url:
        fx_source = "CDN (jsdelivr)"
    elif "currency-api" in source_url:
        fx_source = "Fallback (currency-api.pages.dev)"
    else:
        fx_source = "FX API"

    return {
        "original_amount": amount,
        "from_currency": from_currency.upper(),
        "converted_amount": round(converted, 4),
        "to_currency": to_currency.upper(),
        "rate_used": rate,
        "date_used": date_used,
        "fx_source": fx_source,
        "tolerance_min": round(tolerance_min, 4),
        "tolerance_max": round(tolerance_max, 4),
    }
