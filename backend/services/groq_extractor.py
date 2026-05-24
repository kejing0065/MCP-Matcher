"""
Groq-based invoice extraction using Llama Scout model.
Fast, accurate, and cost-effective.
Extracts text from images/PDFs, then uses Groq for structured parsing.
"""

import os
import base64
import json
import re
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

_client: Groq | None = None


def get_client() -> Groq:
    """Get or create Groq client."""
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in .env")
        _client = Groq(api_key=api_key)
    return _client


def _pdf_to_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF using pdfplumber."""
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ""
            for page in pdf.pages[:1]:  # First page only
                text += page.extract_text() or ""
            return text
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")
    except Exception as e:
        raise RuntimeError(f"Failed to extract text from PDF: {str(e)}")


def _image_to_text(image_bytes: bytes) -> str:
    """Extract text from image using EasyOCR."""
    try:
        import easyocr
        from PIL import Image
        import io
        import numpy as np
        
        reader = easyocr.Reader(['en'])
        img = Image.open(io.BytesIO(image_bytes))
        result = reader.readtext(np.array(img))
        text = "\n".join([item[1] for item in result]) if result else ""
        return text
    except ImportError:
        raise RuntimeError(
            "Image OCR requires EasyOCR. "
            "Install with: pip install easyocr"
        )
    except Exception as e:
        raise RuntimeError(f"OCR failed: {str(e)}")


_EXTRACT_PROMPT = """You are an expert invoice data extractor. Analyze the following invoice text and extract the required fields.

Return ONLY valid JSON with no preamble, no markdown, no explanation.

Return exactly this structure:
{{
  "invoice_no": "string or null",
  "customer": "string or null",
  "amount": number or null,
  "currency": "3-letter ISO code or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "payment_reference": "string or null"
}}

Invoice text:
{invoice_text}

Be precise and extract ONLY the actual values from the invoice."""


async def extract_invoice(file_bytes: bytes, filename: str) -> dict:
    """
    Extract invoice fields from image or PDF.
    Uses OCR/pdfplumber for text extraction, then Groq for parsing.
    
    Returns dict with invoice fields.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        text = _pdf_to_text(file_bytes)
    elif ext in (".jpg", ".jpeg", ".png"):
        text = _image_to_text(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use PDF, JPG, or PNG.")

    if not text or len(text.strip()) < 10:
        raise ValueError("Could not extract text from document. Try a clearer image.")

    # Use Groq to parse the extracted text
    client = get_client()
    
    prompt = _EXTRACT_PROMPT.format(invoice_text=text)

    try:
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            temperature=0.1,
            max_completion_tokens=500,
        )
    except Exception as e:
        raise RuntimeError(f"Groq API error: {str(e)}") from e

    raw = response.choices[0].message.content.strip()

    # Strip markdown code fences if Groq wraps in ```json ... ```
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq returned non-JSON response: {raw[:200]}") from e
