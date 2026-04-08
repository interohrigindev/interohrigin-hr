export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
        <span className="text-white text-xs font-bold">IO</span>
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 bg-violet-400 rounded-full"
              style={{
                animation: 'bounceDot 1.4s infinite',
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
