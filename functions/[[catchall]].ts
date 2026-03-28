// SPA fallback: 정적 파일이 없으면 루트(/)의 HTML을 반환
export const onRequest: PagesFunction = async (context) => {
  try {
    const response = await context.env.ASSETS.fetch(context.request)
    if (response.status !== 404) return response
  } catch {}

  // Cloudflare Pages는 /index.html → / 308 리다이렉트하므로
  // / 경로로 요청하여 실제 HTML 콘텐츠를 가져옴
  const url = new URL(context.request.url)
  url.pathname = '/'
  url.search = ''
  const rootResponse = await context.env.ASSETS.fetch(new Request(url.toString()))

  return new Response(rootResponse.body, {
    status: 200,
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    },
  })
}
