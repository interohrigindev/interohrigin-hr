// SPA fallback: 정적 파일이 없으면 index.html 내용을 200으로 반환
// 리다이렉트 없이 원래 URL 유지 + 캐시 완전 차단
export const onRequest: PagesFunction = async (context) => {
  try {
    const response = await context.env.ASSETS.fetch(context.request)
    if (response.status !== 404) return response
  } catch {}

  const url = new URL(context.request.url)
  url.pathname = '/index.html'
  const indexResponse = await context.env.ASSETS.fetch(url.toString())
  return new Response(indexResponse.body, {
    status: 200,
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    },
  })
}
