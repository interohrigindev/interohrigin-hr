import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Video, Mic, MicOff, VideoOff, Circle, Square, CheckCircle, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Candidate, JobPosting } from '@/types/recruitment'

type RecordingState = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done'

export default function PublicInterview() {
  const { token } = useParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [posting, setPosting] = useState<JobPosting | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [loading, setLoading] = useState(true)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 지원자/공고 로드
  useEffect(() => {
    if (!token) return
    async function load() {
      const { data: cand } = await supabase
        .from('candidates')
        .select('*')
        .eq('invite_token', token)
        .single()

      if (!cand) { setLoading(false); return }
      setCandidate(cand as Candidate)

      if (cand.job_posting_id) {
        const { data: post } = await supabase
          .from('job_postings')
          .select('*')
          .eq('id', cand.job_posting_id)
          .single()
        if (post) {
          setPosting(post as JobPosting)
          const aiQ = (post.ai_questions as string[]) || []
          setQuestions(aiQ)
        }
      }
      setLoading(false)
    }
    load()
  }, [token])

  // 카메라 시작
  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch {
      setError('카메라/마이크 접근 권한이 필요합니다.')
    }
  }, [])

  useEffect(() => {
    if (candidate && !stream) startCamera()
    return () => {
      stream?.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [candidate, stream, startCamera])

  function toggleCamera() {
    if (!stream) return
    stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled })
    setCameraOn(!cameraOn)
  }

  function toggleMic() {
    if (!stream) return
    stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
    setMicOn(!micOn)
  }

  function startRecording() {
    if (!stream) return
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(1000)
    mediaRecorderRef.current = recorder
    setRecordingState('recording')
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000)
  }

  async function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)

    return new Promise<Blob>((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder) return
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        resolve(blob)
      }
      recorder.stop()
    })
  }

  async function handleStopAndUpload() {
    setRecordingState('uploading')
    try {
      const blob = await stopRecording()

      // Supabase Storage에 업로드
      const fileName = `${candidate?.id}/${Date.now()}_interview.webm`
      const { error: uploadErr } = await supabase.storage
        .from('interview-recordings')
        .upload(fileName, blob)

      if (uploadErr) throw new Error(uploadErr.message)

      const { data: urlData } = supabase.storage
        .from('interview-recordings')
        .getPublicUrl(fileName)

      // interview_recordings 레코드 생성
      await supabase.from('interview_recordings').insert({
        candidate_id: candidate?.id,
        recording_url: urlData.publicUrl,
        recording_type: 'video',
        duration_seconds: elapsed,
        file_size_bytes: blob.size,
        status: 'uploaded',
      })

      // 지원자 상태 업데이트
      await supabase
        .from('candidates')
        .update({ status: 'video_done' })
        .eq('id', candidate?.id)

      setRecordingState('done')
    } catch (err: any) {
      setError('업로드 실패: ' + err.message)
      setRecordingState('stopped')
    }
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">유효하지 않은 링크</h1>
          <p className="text-gray-400">만료되었거나 잘못된 면접 링크입니다.</p>
        </div>
      </div>
    )
  }

  if (recordingState === 'done') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center">
          <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">면접이 완료되었습니다!</h1>
          <p className="text-gray-400">
            {candidate.name}님, 참여해주셔서 감사합니다.<br />
            결과를 검토한 후 별도로 연락드리겠습니다.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-brand-400">인터오리진 화상면접</p>
            <h1 className="text-lg font-bold">{posting?.title || '면접'}</h1>
          </div>
          <div className="flex items-center gap-3">
            {recordingState === 'recording' && (
              <div className="flex items-center gap-2 bg-red-600/20 px-3 py-1.5 rounded-full">
                <Circle className="h-3 w-3 text-red-500 animate-pulse fill-red-500" />
                <span className="text-sm font-mono text-red-400">{formatTime(elapsed)}</span>
              </div>
            )}
            <span className="text-sm text-gray-400">{candidate.name}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 비디오 영역 */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <VideoOff className="h-16 w-16 text-gray-600" />
                </div>
              )}
            </div>

            {/* 컨트롤 */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleMic}
                className={`p-3 rounded-full transition-colors ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'}`}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              <button
                onClick={toggleCamera}
                className={`p-3 rounded-full transition-colors ${cameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-500'}`}
              >
                {cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>

              {recordingState === 'idle' && (
                <button
                  onClick={startRecording}
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-full font-medium flex items-center gap-2 transition-colors"
                >
                  <Circle className="h-4 w-4 fill-white" /> 녹화 시작
                </button>
              )}

              {recordingState === 'recording' && (
                <button
                  onClick={handleStopAndUpload}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-medium flex items-center gap-2 transition-colors"
                >
                  <Square className="h-4 w-4 fill-white" /> 녹화 종료 & 제출
                </button>
              )}

              {recordingState === 'uploading' && (
                <div className="px-6 py-3 bg-gray-700 rounded-full flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 업로드 중...
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 text-sm text-center">
                {error}
              </div>
            )}
          </div>

          {/* 질문 패널 */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-3">면접 질문</h2>
              {questions.length === 0 ? (
                <p className="text-sm text-gray-500">등록된 질문이 없습니다. 자유롭게 답변해주세요.</p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div
                      key={i}
                      onClick={() => setCurrentQ(i)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        i === currentQ
                          ? 'bg-brand-600/20 border border-brand-500/30'
                          : 'bg-gray-700/50 hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-xs font-bold mt-0.5 ${
                          i === currentQ ? 'text-brand-400' : 'text-gray-500'
                        }`}>
                          Q{i + 1}
                        </span>
                        <p className={`text-sm ${i === currentQ ? 'text-white' : 'text-gray-300'}`}>
                          {q}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 진행 안내 */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-2">진행 안내</h2>
              <ul className="text-xs text-gray-500 space-y-1.5">
                <li>1. 카메라/마이크를 확인하세요</li>
                <li>2. "녹화 시작"을 누르세요</li>
                <li>3. 각 질문에 차례로 답변하세요</li>
                <li>4. 모든 답변이 끝나면 "녹화 종료"를 누르세요</li>
                <li className="text-amber-400">* 녹화는 한 번만 가능합니다</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
