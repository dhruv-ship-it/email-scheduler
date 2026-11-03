import TextAlign from '@tiptap/extension-text-align'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'
import { cn } from '../../lib/cn'

type ToolbarButtonProps = {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
}

function ToolbarButton({ label, onClick, active, disabled, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the selection in the editor while a toolbar button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900',
        'disabled:opacity-40 disabled:hover:bg-transparent',
        active && 'bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-gray-200" />
}

type Align = 'left' | 'center' | 'right'

const ALIGN_ICONS: Record<Align, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
}

const TEXT_STYLES = [
  { label: 'Normal text', level: null },
  { label: 'Heading 1', level: 1 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
] as const

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'),
      heading: ([1, 2, 3] as const).find((level) => current.isActive('heading', { level })) ?? null,
      align:
        (['center', 'right'] as const).find((a) => current.isActive({ textAlign: a })) ??
        ('left' as const),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  })
  const AlignIcon = ALIGN_ICONS[state.align]

  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-full bg-white px-3 py-0.5">
      <ToolbarButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 aria-hidden className="size-3.5" />
      </ToolbarButton>
      <Divider />

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Text style"
            onMouseDown={(event) => event.preventDefault()}
            className="flex h-6 items-center gap-0.5 rounded-md px-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <Type aria-hidden className="size-3.5" />
            <ChevronDown aria-hidden className="size-3" />
          </button>
        </MenuTrigger>
        <MenuContent className="min-w-[160px]">
          {TEXT_STYLES.map((style) => (
            <MenuItem
              key={style.label}
              onSelect={() => {
                const chain = editor.chain().focus()
                if (style.level === null) chain.setParagraph().run()
                else chain.setHeading({ level: style.level }).run()
              }}
              className={cn(state.heading === style.level && 'font-semibold')}
            >
              {style.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Divider />

      <ToolbarButton
        label="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline aria-hidden className="size-3.5" />
      </ToolbarButton>
      <Divider />

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Text alignment"
            onMouseDown={(event) => event.preventDefault()}
            className="flex h-6 items-center gap-0.5 rounded-md px-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <AlignIcon aria-hidden className="size-3.5" />
            <ChevronDown aria-hidden className="size-3" />
          </button>
        </MenuTrigger>
        <MenuContent className="min-w-[140px]">
          {(['left', 'center', 'right'] as const).map((align) => {
            const Icon = ALIGN_ICONS[align]
            return (
              <MenuItem
                key={align}
                onSelect={() => editor.chain().focus().setTextAlign(align).run()}
                className={cn(state.align === align && 'font-semibold')}
              >
                <Icon aria-hidden className="size-3.5" />
                {align[0]?.toUpperCase()}
                {align.slice(1)}
              </MenuItem>
            )
          })}
        </MenuContent>
      </Menu>
      <Divider />

      <ToolbarButton
        label="Numbered list"
        active={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Indent"
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
      >
        <IndentIncrease aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Outdent"
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
      >
        <IndentDecrease aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote aria-hidden className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Clear formatting"
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <RemoveFormatting aria-hidden className="size-3.5" />
      </ToolbarButton>
      <Divider />

      <ToolbarButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough aria-hidden className="size-3.5" />
      </ToolbarButton>
    </div>
  )
}

type RichEditorProps = {
  // Receives the HTML, or an empty string while the document has no content.
  onChange: (html: string) => void
}

export function RichEditor({ onChange }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    editorProps: {
      attributes: {
        class: 'email-body max-w-none min-h-[200px] outline-none',
        'aria-label': 'Message body',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? '' : current.getHTML()),
  })
  const empty = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.isEmpty ?? true,
  })

  return (
    <div className="rounded-lg bg-editor px-4 pt-3 pb-4">
      <p className={cn('mb-2 h-5 text-small text-placeholder', !empty && 'invisible')}>
        Type Your Reply...
      </p>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="mt-4" />
    </div>
  )
}
