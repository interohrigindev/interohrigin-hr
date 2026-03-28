// SPA fallback: 정적 파일이 없으면 index.html 내용을 동일 URL로 반환
export const onRequest: PagesFunction = async (context) => {
  try {
    const response = await context.env.ASSETS.fetch(context.request)
    // 정적 파일이 존재하면 그대로 반환
    if (response.status !== 404) return response
  } catch {}

  // 정적 파일이 없으면 index.html의 내용을 가져와서
  // 원래 URL을 유지한 채로 200 응답으로 반환 (리다이렉트 없이)
  const url = new URL(context.request.url)
  url.pathname = '/index.html'
  const indexResponse = await context.env.ASSETS.fetch(url.toString())
  return new Response(indexResponse.body, {
    status: 200,
    headers: {
      'content-type': 'text/html;charset=UTF-8',
    },
  })
}
