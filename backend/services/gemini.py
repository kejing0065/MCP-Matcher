import os
import base64
import json
import re
import io
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

_client: Groq | None = None


def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in .env")
        _client = Groq(api_key=api_key)
    return _client


_EXTRACT_PROMPT = """Extract invoice details from this document image and return ONLY valid JSON with no preamble, no markdown, no explanation.

Return exactly this structure:
{
  "invoice_no": "string or null",
  "customer": "string or null",
  "amount": number or null,
  "currency": "3-letter ISO code or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "payment_reference": "string or null"
}"""


def _pdf_to_image_bytes(pdf_bytes: bytes) -> bytes:
    """Convert first page of PDF to PNG bytes using pdf2image."""
    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, fmt="png")
        if not images:
            raise ValueError("pdf2image returned no pages")
        buf = io.BytesIO()
        images[0].save(buf, format="PNG")
        return buf.getvalue()
    except ImportError:
        raise RuntimeError(
            "pdf2image is not installed or Poppler is missing. "
            "Install Poppler: https://github.com/oschwartz10612/poppler-windows/releases "
            "then add its bin/ folder to PATH."
        )


async def extract_invoice(file_bytes: bytes, filename: str) -> dict:
    """
    Use Groq meta-llama/llama-4-scout-17b-16e-instruct to extract invoice fields
    from an image or PDF. Returns parsed dict with invoice fields.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        image_bytes = _pdf_to_image_bytes(file_bytes)
        mime_type = "image/png"
    elif ext in (".jpg", ".jpeg"):
        image_bytes = file_bytes
        mime_type = "image/jpeg"
    elif ext == ".png":
        image_bytes = file_bytes
        mime_type = "image/png"
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use PDF, JPG, or PNG.")

    # Encode image as base64 data URL
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    client = get_client()

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": _EXTRACT_PROMPT,
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ],
            }
        ],
        temperature=0,
        max_tokens=512,
    )

    raw = response.choices[0].message.content.strip()

    # Strip markdown code fences if model wraps in ```json ... ```
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq returned non-JSON response: {raw[:200]}") from e
