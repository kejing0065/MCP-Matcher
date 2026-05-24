"""
Free invoice extraction using pdfplumber for PDFs and Pillow/basic OCR for images.
No API costs for text extraction.
"""

import re
import io
from pathlib import Path
from PIL import Image


def _pdf_to_image_bytes(pdf_bytes: bytes) -> bytes:
    """Convert first page of PDF to PNG bytes."""
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
            "pdf2image is not installed. Install: pip install pdf2image. "
            "Also install Poppler: https://github.com/oschwartz10612/poppler-windows/releases"
        )


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF using pdfplumber (fast, no OCR needed)."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ""
            for page in pdf.pages[:1]:  # Get first page only
                text += page.extract_text() or ""
            return text
    except ImportError:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")
    except Exception as e:
        raise RuntimeError(f"Failed to extract text from PDF: {str(e)}")


def _parse_invoice_text(text: str) -> dict:
    """Parse extracted text to find invoice fields using regex patterns."""
    
    # Helper to find first match
    def find_pattern(patterns, text):
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip() if match.groups() else match.group(0).strip()
        return None
    
    result = {
        "invoice_no": None,
        "customer": None,
        "amount": None,
        "currency": None,
        "invoice_date": None,
        "due_date": None,
        "payment_reference": None,
    }
    
    # Invoice number patterns
    invoice_patterns = [
        r"Invoice\s*[#:]?\s*([A-Z0-9\-\.]+)",
        r"Invoice\s*No\s*[#:]?\s*([A-Z0-9\-\.]+)",
        r"INV\s*[#:]?\s*([A-Z0-9\-\.]+)",
    ]
    result["invoice_no"] = find_pattern(invoice_patterns, text)
    
    # Amount patterns (looks for currency symbols or "amount")
    amount_patterns = [
        r"(?:Total|Amount|Grand Total|Sub Total)\s*[:\$€£¥]?\s*([\d,]+\.?\d*)",
        r"[\$€£¥]\s*([\d,]+\.?\d*)",
    ]
    amount_str = find_pattern(amount_patterns, text)
    if amount_str:
        try:
            result["amount"] = float(amount_str.replace(",", ""))
        except:
            pass
    
    # Currency patterns
    currency_patterns = [
        r"(?:Currency|in|USD|EUR|GBP|JPY|CNY|AUD|CAD)\s*([A-Z]{3})",
        r"[\$€£¥]",
    ]
    currency = find_pattern(currency_patterns, text)
    if currency:
        currency_map = {"$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY"}
        result["currency"] = currency_map.get(currency, currency[:3].upper() if len(currency) >= 3 else None)
    
    # Date patterns (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
    date_patterns = [
        r"(?:Date|Invoice Date|Date:)\s*(\d{4}-\d{2}-\d{2})",
        r"(?:Date|Invoice Date|Date:)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})",
    ]
    invoice_date = find_pattern(date_patterns, text)
    if invoice_date:
        result["invoice_date"] = invoice_date
    
    # Due date patterns
    due_date_patterns = [
        r"(?:Due Date|Due:)\s*(\d{4}-\d{2}-\d{2})",
        r"(?:Due Date|Due:)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})",
    ]
    due_date = find_pattern(due_date_patterns, text)
    if due_date:
        result["due_date"] = due_date
    
    # Customer/company name (first substantial capitalized sequence)
    company_patterns = [
        r"(?:Bill To|Bill To:|Customer|From:)\s*([A-Z][A-Za-z\s&]+)",
    ]
    customer = find_pattern(company_patterns, text)
    if customer:
        result["customer"] = customer.strip()
    
    # Payment reference
    ref_patterns = [
        r"(?:Reference|Ref|PO|Reference #)\s*[#:]?\s*([A-Z0-9\-]+)",
    ]
    result["payment_reference"] = find_pattern(ref_patterns, text)
    
    return result


async def extract_invoice_free(file_bytes: bytes, filename: str) -> dict:
    """
    Extract invoice fields using free, local text extraction.
    For PDFs: uses pdfplumber (fast, no OCR)
    For images: requires manual input or Tesseract (optional).
    
    Returns dict with: invoice_no, customer, amount, currency, 
                       invoice_date, due_date, payment_reference
    """
    ext = Path(filename).suffix.lower()
    
    if ext == ".pdf":
        text = _extract_text_from_pdf(file_bytes)
    elif ext in (".jpg", ".jpeg", ".png"):
        # For images, try to use EasyOCR if available, otherwise return error
        try:
            import easyocr
            reader = easyocr.Reader(['en'])
            img = Image.open(io.BytesIO(file_bytes))
            import numpy as np
            result = reader.readtext(np.array(img))
            text = "\n".join([item[1] for item in result]) if result else ""
        except ImportError:
            raise RuntimeError(
                "Image OCR requires EasyOCR. "
                "Install with: pip install easyocr "
                "(or use PDF for better support)"
            )
        except Exception as e:
            raise RuntimeError(f"OCR failed: {str(e)}")
    else:
        raise ValueError(f"Unsupported file type: {ext}. Use PDF, JPG, or PNG.")
    
    # Parse text to find invoice fields
    return _parse_invoice_text(text)
