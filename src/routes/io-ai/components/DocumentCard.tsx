import { ExternalLink, Presentation, FileText } from 'lucide-react'
import type { DocumentResult } from '@/lib/google-workspace'

const DOC_CONFIG = {
  slides: {
    icon: Presentation,
    label: 'Google Slides',
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-50 border-amber-200',
    textColor: 'text-amber-700',
    btnColor: 'bg-amber-600 hover:bg-amber-700',
  },
  docs: {
    icon: FileText,
    label: 'Google Docs',
    color: 'from-blue-500 to-indigo-500',
    bgColor: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-700',
    btnColor: 'bg-blue-600 hover:bg-blue-700',
  },
}

export default function DocumentCard({ doc }: { doc: DocumentResult }) {
  const config = DOC_CONFIG[doc.type]
  const Icon = config.icon

  return (
    <div className={`rounded-xl border ${config.bgColor} p-4 animate-slide-up`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center shrink-0`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${config.textColor} mb-0.5`}>{config.label}</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{doc.title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 ${config.btnColor} text-white rounded-lg text-xs font-medium transition-colors`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Google에서 열기
        </a>
      </div>
    </div>
  )
}
