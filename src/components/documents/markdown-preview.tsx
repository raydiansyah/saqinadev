import ReactMarkdown from "react-markdown";
import { isMermaidClass, mermaidSource } from "@/lib/markdown/mermaid";
import MermaidDiagram from "./mermaid-diagram";

/**
 * Renders Markdown without raw HTML (react-markdown escapes it by default). A ```mermaid block
 * becomes a diagram (the library itself loads only when one is shown); every other block is plain code.
 */
export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        components={{
          // The diagram replaces the whole <pre>, not just the <code> inside it.
          pre({ node, children, ...props }) {
            const code = node?.children?.[0];
            const className =
              code && "properties" in code
                ? (code.properties?.className as string[] | undefined)
                : undefined;
            return isMermaidClass(className) ? <>{children}</> : <pre {...props}>{children}</pre>;
          },
          code({ node: _node, className, children, ...props }) {
            if (isMermaidClass(className))
              return <MermaidDiagram chart={mermaidSource(children)} />;
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
