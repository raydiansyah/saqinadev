import ReactMarkdown from "react-markdown";

/** Renders Markdown without raw HTML: react-markdown escapes it by default. */
export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
