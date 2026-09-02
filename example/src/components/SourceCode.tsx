import { normalizeTokens, Prism } from "prism-react-renderer"

export default function SourceCode({
  label,
  source,
}: {
  label: string
  source: string
}) {
  const lines = normalizeTokens(Prism.tokenize(source, Prism.languages.tsx))

  return (
    <pre aria-label={label} className="source-code language-tsx" tabIndex={0}>
      <code>
        {lines.map((line, lineIndex) => (
          <span className="source-code-line" data-line={lineIndex + 1} key={lineIndex}>
            <span aria-hidden="true" className="source-line-number">{lineIndex + 1}</span>
            <span className="source-line-content">
              {line.map((token, tokenIndex) => (
                <span className={`token ${token.types.join(" ")}`} key={tokenIndex}>{token.content}</span>
              ))}
            </span>
          </span>
        ))}
      </code>
    </pre>
  )
}
