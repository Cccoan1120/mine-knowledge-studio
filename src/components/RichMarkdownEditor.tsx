import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  headingsPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { Code2, PenLine } from 'lucide-react'
import { useState } from 'react'

type RichMarkdownEditorProps = {
  markdown: string
  onChange: (markdown: string) => void
}

export function RichMarkdownEditor({ markdown, onChange }: RichMarkdownEditorProps) {
  const [mode, setMode] = useState<'rich' | 'source'>('rich')

  return (
    <section className="document-editor">
      <div className="editor-mode-bar">
        <div>
          <strong>正文</strong>
          <span>像普通文档一样写，底层自动保存为 Markdown</span>
        </div>
        <div className="segmented-control" aria-label="编辑模式">
          <button type="button" className={mode === 'rich' ? 'is-active' : ''} onClick={() => setMode('rich')}>
            <PenLine size={15} />
            编辑
          </button>
          <button type="button" className={mode === 'source' ? 'is-active' : ''} onClick={() => setMode('source')}>
            <Code2 size={15} />
            源码
          </button>
        </div>
      </div>

      {mode === 'rich' ? (
        <MDXEditor
          markdown={markdown}
          onChange={onChange}
          contentEditableClassName="mine-mdx-content"
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            markdownShortcutPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <UndoRedo />
                  <BlockTypeSelect />
                  <BoldItalicUnderlineToggles />
                  <ListsToggle />
                  <CreateLink />
                  <InsertThematicBreak />
                </>
              ),
            }),
          ]}
        />
      ) : (
        <textarea
          className="source-editor"
          value={markdown}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      )}
    </section>
  )
}
