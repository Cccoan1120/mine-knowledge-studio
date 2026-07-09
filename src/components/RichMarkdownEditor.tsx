import {
  Bold,
  Heading1,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from 'lucide-react'
import { useRef } from 'react'

type RichMarkdownEditorProps = {
  markdown: string
  onChange: (markdown: string) => void
}

type FormatAction = 'h1' | 'bold' | 'italic' | 'quote' | 'bullet' | 'number' | 'link' | 'rule'

export function RichMarkdownEditor({ markdown, onChange }: RichMarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function focusAndSelect(start: number, end = start) {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(start, end)
    })
  }

  function replaceSelection(nextValue: string, selectionStart: number, selectionEnd = selectionStart) {
    onChange(nextValue)
    focusAndSelect(selectionStart, selectionEnd)
  }

  function inlineFormat(prefix: string, suffix = prefix, placeholder = '文字') {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd } = textarea
    const selected = markdown.slice(selectionStart, selectionEnd) || placeholder
    const next = `${markdown.slice(0, selectionStart)}${prefix}${selected}${suffix}${markdown.slice(selectionEnd)}`
    const start = selectionStart + prefix.length
    replaceSelection(next, start, start + selected.length)
  }

  function lineFormat(action: 'h1' | 'quote' | 'bullet' | 'number') {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd } = textarea
    const lineStart = markdown.lastIndexOf('\n', Math.max(selectionStart - 1, 0)) + 1
    const nextLineBreak = markdown.indexOf('\n', selectionEnd)
    const lineEnd = nextLineBreak === -1 ? markdown.length : nextLineBreak
    const block = markdown.slice(lineStart, lineEnd) || '文字'
    const formatted = block
      .split('\n')
      .map((line, index) => formatLine(line, action, index))
      .join('\n')
    const next = `${markdown.slice(0, lineStart)}${formatted}${markdown.slice(lineEnd)}`
    replaceSelection(next, lineStart, lineStart + formatted.length)
  }

  function insertRule() {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd } = textarea
    const prefix = selectionStart > 0 && !markdown.slice(0, selectionStart).endsWith('\n') ? '\n\n' : ''
    const suffix = markdown.slice(selectionEnd).startsWith('\n') ? '\n' : '\n\n'
    const inserted = `${prefix}---${suffix}`
    const next = `${markdown.slice(0, selectionStart)}${inserted}${markdown.slice(selectionEnd)}`
    replaceSelection(next, selectionStart + inserted.length)
  }

  function applyFormat(action: FormatAction) {
    if (action === 'bold') return inlineFormat('**', '**', '加粗文字')
    if (action === 'italic') return inlineFormat('*', '*', '斜体文字')
    if (action === 'link') return inlineFormat('[', '](https://)', '链接文字')
    if (action === 'rule') return insertRule()
    return lineFormat(action)
  }

  function runNativeEdit(command: 'undo' | 'redo') {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    document.execCommand(command)
    requestAnimationFrame(() => onChange(textarea.value))
  }

  return (
    <section className="document-editor">
      <div className="editor-mode-bar">
        <div>
          <strong>正文</strong>
          <span>直接写作，工具栏会插入 Markdown 格式，内容自动保存。</span>
        </div>
      </div>

      <div className="markdown-toolbar" aria-label="正文格式工具">
        <button type="button" onClick={() => runNativeEdit('undo')} aria-label="撤销" title="撤销">
          <Undo2 size={16} />
        </button>
        <button type="button" onClick={() => runNativeEdit('redo')} aria-label="重做" title="重做">
          <Redo2 size={16} />
        </button>
        <span aria-hidden="true" />
        <button type="button" onClick={() => applyFormat('h1')} aria-label="一级标题" title="一级标题">
          <Heading1 size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('bold')} aria-label="加粗" title="加粗">
          <Bold size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('italic')} aria-label="斜体" title="斜体">
          <Italic size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('quote')} aria-label="引用" title="引用">
          <Quote size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('bullet')} aria-label="无序列表" title="无序列表">
          <List size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('number')} aria-label="有序列表" title="有序列表">
          <ListOrdered size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('link')} aria-label="链接" title="链接">
          <Link size={16} />
        </button>
        <button type="button" onClick={() => applyFormat('rule')} aria-label="分割线" title="分割线">
          <Minus size={16} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="source-editor"
        value={markdown}
        onChange={(event) => onChange(event.target.value)}
        placeholder="直接输入正文，或粘贴资料、字幕、访谈、研究摘录。"
        spellCheck={false}
      />
    </section>
  )
}

function formatLine(line: string, action: 'h1' | 'quote' | 'bullet' | 'number', index: number) {
  const content = line.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^(\s*)([-*]|\d+\.)\s+/, '$1')
  if (action === 'h1') return `# ${content || '标题'}`
  if (action === 'quote') return `> ${content || '引用内容'}`
  if (action === 'bullet') return `- ${content || '列表项'}`
  return `${index + 1}. ${content || '列表项'}`
}
