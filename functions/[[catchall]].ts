// SPA fallback: 정적 파일이 없으면 index.html 반환
export const onRequest: PagesFunction = async (context) => {
  try {
    const response = await context.env.ASSETS.fetch(context.request)
    if (response.status !== 404) return response
  } catch {}

  // 정적 파일이 없으면 index.html을 반환 (SPA 라우팅)
  const url = new URL(context.request.url)
  url.pathname = '/index.html'
  return context.env.ASSETS.fetch(new Request(url.toString(), context.request))
}
