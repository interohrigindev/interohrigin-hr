/**
 * 외부 사전질의서 PDF 업로드 Dialog (PDCA #2 external-pre-survey-import)
 *
 * Design Ref: §5.2 — 5-step Dialog (선택 → 업로드 → 파싱 → 미리보기/편집 → 저장)
 * Plan SC: SC-01 (5초 내 미리보기) / SC-02 (수정/확정 즉시 반영) / SC-04 (출처/원본 추적)
 *
 * 사용처: src/routes/recruitment/candidate-report.tsx 사전질의서 섹션의 "PDF 업로드" 버튼.
 *
 * 호출 흐름:
 *   admin 클릭 → Step 1 (PDF 선택) → uploadExternalSurveyPdf (Step 2)
 *     → parseExternalSurveyPdf (Step 3, 30s 타임아웃 + abort 가능)
 *     → 미리보기 편집 (Step 4) → admin "확정 저장" 클릭
 *     → onConfirm 콜백 (호출자가 candidates.update 수행, Dialog 는 closing 만)
 *
 * 본 컴포넌트는 DB 업데이트를 직접 하지 않음 (호출자 책임 — admin 페이지 컨텍스트에 따라
 * candidate state 갱신/toast 메시지가 다를 수 있어서).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import {
  EXTERNAL_SURVEY_PDF_MAX_BYTES,
  uploadExternalSurveyPdf,
} from '@/lib/candidate-storage'
import { parseExternalSurveyPdf, type ParseResult } from '@/lib/external-survey-parser'
import type { PreSurveyEntryQuestion } from '@/types/recruitment'

export interface ExternalSurveyImportPayload {
  questions: PreSurveyEntryQuestion[]
  /** key = questions[i].id */
  answers: Record<string, string>
  /** 업로드된 원본 PDF Storage path (resumes 버킷 기준) */
  originalPdfPath: string
  /** 원본 PDF 파일명 (한글 보존) */
  originalPdfFilename: string
  /** Gemini 추출 신뢰도 (admin 이 수정 후에도 원래 값 그대로 전달 — 추적용) */
  extractionConfidence: number
  /** Gemini notes (있을 때만) */
  extractionNotes?: string
  /** admin 이 미리보기에서 questions/answers 를 수정했는지 */
  edited: boolean
}

interface ExternalSurveyImportDialogProps {
  open: boolean
  onClose: () => void
  candidateId: string
  /** 저장 확정 시 호출. 호출자가 DB update + state 갱신 수행. throw 시 Dialog 는 Step 4 에 유지. */
  onConfirm: (payload: ExternalSurveyImportPayload) => Promise<void>
}

type Step = 'select' | 'uploading' | 'parsing' | 'review' | 'saving'

/** 미리보기 편집용 row — order 는 인덱스로 대체 (저장 시 재부여) */
interface PreviewRow {
  /** 임시 React key (uuid-like) — 저장 시 questions[i].id 로 재부여 */
  rowKey: string
  /** parser 에서 받은 원본 id (보존, 디버그용). 새 row 는 '' */
  originalId: string
  question: string
  answer: string
}

export function ExternalSurveyImportDialog({
  open,
  onClose,
  candidateId,
  onConfirm,
}: ExternalSurveyImportDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [step, setStep] = useState<Step>('select')
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedPath, setUploadedPath] = useState<string>('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [errorMsg, setErrorMsg] = useState<string>('')

  // Dialog 닫힐 때 상태 초기화 + 진행 중 abort
  useEffect(() => {
    if (!open) {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setStep('select')
      setDragOver(false)
      setSelectedFile(null)
      setUploadedPath('')
      setParseResult(null)
      setRows([])
      setErrorMsg('')
    }
  }, [open])

  // ─── Step 2 + 3: 업로드 + AI 파싱 (먼저 정의 — handleFiles 의 deps 에 포함) ──

  const runUploadAndParse = useCallback(
    async (file: File) => {
      setStep('uploading')
      setErrorMsg('')

      // 1) Storage 업로드
      const uploadRes = await uploadExternalSurveyPdf(candidateId, file)
      if (uploadRes.error || !uploadRes.path) {
        setErrorMsg(uploadRes.error || 'PDF 업로드에 실패했습니다.')
        setStep('select')
        return
      }
      setUploadedPath(uploadRes.path)

      // 2) AI 파싱 (abort 가능)
      setStep('parsing')
      const ac = new AbortController()
      abortRef.current = ac
      const result = await parseExternalSurveyPdf(file, { signal: ac.signal })
      abortRef.current = null

      // abort 된 경우 — Dialog 가 이미 닫혔거나 사용자가 취소
      // (parseExternalSurveyPdf 가 ok:false + reason='ai_timeout' 반환)
      setParseResult(result)

      if (result.ok) {
        // 미리보기 rows 로 변환
        setRows(
          result.questions.map((q) => ({
            rowKey: q.id,
            originalId: q.id,
            question: q.text,
            answer: result.answers[q.id] ?? '',
          })),
        )
      } else {
        // 파싱 실패여도 미리보기 진입 — 사용자가 rawText 참고해 수동 입력
        setRows([])
      }
      setStep('review')
    },
    [candidateId],
  )

  // ─── Step 1: 파일 선택 ────────────────────────────────────────────

  const handleFiles = useCallback((files: FileList | null) => {
    setErrorMsg('')
    if (!files || files.length === 0) return
    const file = files[0]
    const isPdfMime = file.type === 'application/pdf'
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf')
    if (!isPdfMime && !isPdfExt) {
      setErrorMsg('PDF 파일만 업로드 가능합니다.')
      return
    }
    if (file.size > EXTERNAL_SURVEY_PDF_MAX_BYTES) {
      const mb = Math.round(EXTERNAL_SURVEY_PDF_MAX_BYTES / 1024 / 1024)
      setErrorMsg(`PDF 크기는 ${mb}MB 이하여야 합니다. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      return
    }
    setSelectedFile(file)
    // 자동으로 업로드+파싱 진행
    void runUploadAndParse(file)
  }, [runUploadAndParse])

  // ─── Step 3 abort (사용자 취소) ───────────────────────────────────

  const handleAbortParsing = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  // ─── Step 4: 미리보기 편집 ────────────────────────────────────────

  const updateRow = useCallback((rowKey: string, patch: Partial<Pick<PreviewRow, 'question' | 'answer'>>) => {
    setRows((prev) => prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)))
  }, [])

  const deleteRow = useCallback((rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey))
  }, [])

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { rowKey: `new_${Date.now()}_${prev.length}`, originalId: '', question: '', answer: '' },
    ])
  }, [])

  /** admin 이 한 번이라도 수정했으면 true (rowKey/question/answer 비교) */
  const edited = useMemo(() => {
    if (!parseResult || !parseResult.ok) return rows.length > 0  // 파싱 실패 후 수동 입력이면 무조건 edited
    const original = parseResult.questions
    if (rows.length !== original.length) return true
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const o = original[i]
      if (r.originalId !== o.id) return true
      if (r.question !== o.text) return true
      if (r.answer !== (parseResult.answers[o.id] ?? '')) return true
    }
    return false
  }, [rows, parseResult])

  const validRowCount = useMemo(
    () => rows.filter((r) => r.question.trim().length > 0).length,
    [rows],
  )

  // ─── Step 5: 확정 저장 ────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    setErrorMsg('')
    // 검증: 질문이 1개 이상 있어야 함
    const validRows = rows.filter((r) => r.question.trim().length > 0)
    if (validRows.length === 0) {
      setErrorMsg('질문을 1개 이상 입력해주세요.')
      return
    }
    if (!uploadedPath) {
      setErrorMsg('업로드된 PDF 경로가 없습니다. 처음부터 다시 시도해주세요.')
      return
    }

    // questions/answers 재구성 — 새 id 부여 (manual_${ts}_${i})
    const ts = Date.now()
    const questions: PreSurveyEntryQuestion[] = []
    const answers: Record<string, string> = {}
    validRows.forEach((r, i) => {
      const id = `manual_${ts}_${i}`
      questions.push({ id, text: r.question.trim(), order: i, required: false })
      answers[id] = r.answer
    })

    const confidence = parseResult && parseResult.ok ? parseResult.confidence : 0
    const notes = parseResult && parseResult.ok ? parseResult.notes : undefined

    setStep('saving')
    try {
      await onConfirm({
        questions,
        answers,
        originalPdfPath: uploadedPath,
        originalPdfFilename: selectedFile?.name || 'document.pdf',
        extractionConfidence: confidence,
        extractionNotes: notes,
        edited,
      })
      toast('외부 사전질의서가 저장되었습니다.', 'success')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setErrorMsg(`저장 실패: ${msg}`)
      setStep('review')
    }
  }, [rows, uploadedPath, parseResult, selectedFile, edited, onConfirm, toast, onClose])

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={onClose} title="외부 사전질의서 업로드" className="max-w-3xl">
      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            외부 Google Form 응답을 PDF 로 받아 업로드하면, AI 가 질문-답변을 자동 추출합니다.
            추출 결과는 다음 단계에서 직접 수정할 수 있습니다.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleFiles(e.dataTransfer.files)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors ${
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <Upload className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">
              PDF 파일을 여기에 끌어놓거나 클릭해서 선택
            </p>
            <p className="text-xs text-gray-500 mt-1">최대 20MB · PDF 형식만</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {step === 'uploading' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-gray-700">PDF 업로드 중...</p>
          {selectedFile && <p className="text-xs text-gray-500 mt-1">{selectedFile.name}</p>}
        </div>
      )}

      {step === 'parsing' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-gray-700">AI 가 질문-답변을 추출하고 있습니다...</p>
          <p className="text-xs text-gray-500 mt-1">보통 5초 이내, 최대 30초까지 소요됩니다.</p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={handleAbortParsing}>
            <X className="h-3 w-3 mr-1" /> 취소
          </Button>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-3">
          {/* 파싱 결과 헤더 */}
          {parseResult && parseResult.ok ? (
            <>
              {parseResult.confidence < 0.7 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    AI 추출 신뢰도가 낮습니다 ({Math.round(parseResult.confidence * 100)}%). 각 항목을 꼼꼼히 확인해주세요.
                  </div>
                </div>
              )}
              {parseResult.notes && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                  <strong>AI 메모:</strong> {parseResult.notes}
                </div>
              )}
            </>
          ) : parseResult && !parseResult.ok ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>AI 파싱 실패:</strong> {parseResult.error}
                  <p className="mt-1 text-xs">아래에서 질문/답변을 수동으로 입력하시거나, 취소 후 다시 시도해주세요.</p>
                </div>
              </div>
              {parseResult.rawText && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-red-700 hover:underline">AI 응답 원문 보기 (수동 입력 참고용)</summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-white p-2 text-[11px] text-gray-700 whitespace-pre-wrap">
                    {parseResult.rawText}
                  </pre>
                </details>
              )}
            </div>
          ) : null}

          {/* 미리보기 편집 테이블 */}
          <div className="max-h-[50vh] overflow-y-auto space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
            {rows.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">
                질문-답변이 추출되지 않았습니다. 아래 [+ 질문 추가] 버튼으로 직접 입력해주세요.
              </p>
            )}
            {rows.map((r, i) => (
              <div key={r.rowKey} className="rounded-lg bg-white border border-gray-200 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-brand-600 mt-2 w-8">Q{i + 1}.</span>
                  <Textarea
                    value={r.question}
                    onChange={(e) => updateRow(r.rowKey, { question: e.target.value })}
                    placeholder="질문 내용"
                    rows={1}
                    className="flex-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => deleteRow(r.rowKey)}
                    className="text-gray-400 hover:text-red-500 p-1 mt-1"
                    aria-label="질문 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-gray-500 mt-2 w-8">A.</span>
                  <Textarea
                    value={r.answer}
                    onChange={(e) => updateRow(r.rowKey, { answer: e.target.value })}
                    placeholder="답변 내용 (빈 값은 미응답으로 저장됩니다)"
                    rows={2}
                    className="flex-1 text-sm"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-600 hover:bg-white hover:border-brand-300 hover:text-brand-600 transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="h-4 w-4" /> 질문 추가
            </button>
          </div>

          {/* 출처/원본 정보 */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span><strong>출처:</strong> Google Form (수동 업로드)</span>
            {selectedFile && <span><strong>원본:</strong> {selectedFile.name}</span>}
            <span><strong>질문 수:</strong> {validRowCount}개</span>
          </div>

          {errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={onClose}>취소</Button>
            <Button variant="primary" size="md" onClick={handleConfirm} disabled={validRowCount === 0}>
              확정 저장 ({validRowCount}개)
            </Button>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-gray-700">저장 중...</p>
        </div>
      )}
    </Dialog>
  )
}
