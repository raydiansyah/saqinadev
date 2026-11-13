import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders Markdown without raw HTML (react-markdown escapes it by default). */
export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="markdown">
      {/* Tables, task lists and strikethrough, as GitHub writes them. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
