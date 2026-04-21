import type { HandoverAssetType } from '@/types/employee-lifecycle'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  mimeLabel: string
  webViewLink: string | null
  modifiedTime: string
  assetType: HandoverAssetType
  ownerEmail: string
}

export interface DriveScanResult {
  files: DriveFile[]
  total: number
  error?: string
}

export async function scanEmployeeDrive(
  email: string,
  name: string
): Promise<DriveScanResult> {
  const params = new URLSearchParams()
  if (email) params.set('email', email)
  if (name)  params.set('name', name)

  try {
    const res = await fetch(`/api/drive-scan?${params}`)
    const data = await res.json() as DriveScanResult & { error?: string }
    if (!res.ok || data.error) {
      return { files: [], total: 0, error: data.error || `HTTP ${res.status}` }
    }
    return { files: data.files || [], total: data.total ?? 0 }
  } catch (err) {
    return { files: [], total: 0, error: err instanceof Error ? err.message : '네트워크 오류' }
  }
}
