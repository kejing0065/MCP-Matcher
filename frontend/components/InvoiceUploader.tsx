"use client"

import { useRef, useState } from "react"

interface Props {
  onExtracted: (invoiceId: string, fields: Record<string, unknown>) => void
}

const FIELDS_TO_SHOW = [
  { key: "invoice_no",  label: "Invoice No" },
  { key: "customer",    label: "Customer" },
  { key: "amount",      label: "Amount" },
  { key: "currency",    label: "Currency" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "due_date",    label: "Due Date" },
]

export default function InvoiceUploader({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [fields, setFields] = useState<Record<string, unknown> | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [fileName, setFileName] = useState("")
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"]
    if (!allowed.includes(file.type)) {
      setStatus("error")
      setErrorMsg("Only JPG, PNG, or PDF files are supported.")
      return
    }

    setFileName(file.name)
    setStatus("loading")
    setErrorMsg("")

    // Show preview for images
    if (file.type !== "application/pdf") {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }

    const form = new FormData()
    form.append("file", file)

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${API_BASE}/tools/extract-document`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || "Extraction failed")
      }
      const data = await res.json()
      const { id, ...extracted } = data
      setFields(extracted)
      setStatus("done")
      onExtracted(id, extracted)
    } catch (e: unknown) {
      setStatus("error")
      setErrorMsg(e instanceof Error ? e.message : "Upload failed")
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div>
      <div
        className={`upload-zone ${dragging ? "dragging" : ""} ${status === "done" ? "upload-success" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          style={{ display: "none" }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {status === "loading" ? (
          <div className="loading-row" style={{ justifyContent: "center" }}>
            <div className="spinner" />
            <span>Extracting with Gemini 2.0 Flash…</span>
          </div>
        ) : status === "done" ? (
          <>
            <div className="upload-icon">✅</div>
            <div className="upload-label">{fileName}</div>
            <div className="upload-hint">Invoice extracted successfully</div>
          </>
        ) : (
          <>
            <div className="upload-icon">📄</div>
            <div className="upload-label">Upload Invoice</div>
            <div className="upload-hint">JPG, PNG, or PDF · Drag & drop or click</div>
          </>
        )}
      </div>

      {status === "error" && (
        <div className="alert alert-error" style={{ marginTop: "0.75rem" }}>
          ⚠ {errorMsg}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: "1rem", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Invoice preview" style={{ width: "100%", maxHeight: "200px", objectFit: "cover" }} />
        </div>
      )}

      {fields && (
        <div className="card fade-up" style={{ marginTop: "1rem" }}>
          <div className="card-title">Extracted Fields</div>
          <div className="fields-grid">
            {FIELDS_TO_SHOW.map(({ key, label }) => (
              <div className="field-item" key={key}>
                <div className="field-label">{label}</div>
                <div className="field-value">
                  {fields[key] != null ? String(fields[key]) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
