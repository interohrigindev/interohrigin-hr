// SPA fallback: 정적 파일이 없으면 index.html 내용을 동일 URL로 반환
export const onRequest: PagesFunction = async (context) => {
  try {
    const response = await context.env.ASSETS.fetch(context.request)
    if (response.status !== 404) return response
  } catch {}

  // index.html 내용을 가져와서 원래 URL 유지 + 캐시 방지
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
