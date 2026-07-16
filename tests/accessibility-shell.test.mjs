import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()
const read = path => readFileSync(join(root, path), 'utf8')

function sourceFiles(directory) {
  const absoluteDirectory = join(root, directory)
  const files = []

  for (const entry of readdirSync(absoluteDirectory)) {
    const absolutePath = join(absoluteDirectory, entry)
    if (statSync(absolutePath).isDirectory()) {
      files.push(...sourceFiles(relative(root, absolutePath)))
    } else if (entry.endsWith('.tsx')) {
      files.push(relative(root, absolutePath))
    }
  }

  return files
}

function openingTags(source, name) {
  const tags = []
  const startPattern = new RegExp(`<${name}\\b`, 'g')
  let match

  while ((match = startPattern.exec(source)) !== null) {
    let braces = 0
    let quote = null

    for (let index = match.index; index < source.length; index += 1) {
      const character = source[index]
      const previous = source[index - 1]

      if (quote) {
        if (character === quote && previous !== '\\') quote = null
        continue
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character
      } else if (character === '{') {
        braces += 1
      } else if (character === '}') {
        braces -= 1
      } else if (character === '>' && braces === 0) {
        tags.push(source.slice(match.index, index + 1))
        startPattern.lastIndex = index + 1
        break
      }
    }
  }

  return tags
}

function hasAttribute(attributes, names) {
  return attributes.properties.some(property => (
    ts.isJsxAttribute(property) && names.has(property.name.text)
  ))
}

function stringAttribute(attributes, name) {
  const attribute = attributes.properties.find(property => (
    ts.isJsxAttribute(property) && property.name.text === name
  ))
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return null
  return ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : null
}

function hasAccessibleContent(children, iconNames) {
  return children.some(child => {
    if (ts.isJsxText(child)) return child.text.trim().length > 0
    if (ts.isJsxExpression(child)) return Boolean(child.expression)
    if (ts.isJsxSelfClosingElement(child)) return !iconNames.has(child.tagName.getText())
    if (ts.isJsxElement(child)) return hasAccessibleContent(child.children, iconNames)
    return false
  })
}

test('AppShell provides skip navigation and focuses meaningful route content', () => {
  const source = read('src/components/AppShell.tsx')

  assert.match(source, /className="skip-link" href="#main-content"/)
  assert.match(source, /previousPath\.current === pathname/)
  assert.match(source, /main h1, \[role="main"\] h1/)
  assert.match(source, /target\.focus\(\{ preventScroll: true \}\)/)
  assert.match(source, /target\.removeAttribute\('tabindex'\)/)
})

test('the shared header exposes and manages mobile navigation state', () => {
  const source = read('src/components/Header.tsx')

  assert.match(source, /aria-expanded=\{mobileMenuOpen\}/)
  assert.match(source, /aria-controls="mobile-primary-navigation"/)
  assert.match(source, /aria-current=\{isCurrentPath\(item\.path\) \? 'page'/)
  assert.match(source, /mobileMenuRef\.current\?\.querySelector<HTMLElement>/)
  assert.match(source, /mobileMenuButtonRef\.current\?\.focus\(\)/)
})

test('application routes do not mount a second shared Header', () => {
  const offenders = sourceFiles('src/app').filter(path => {
    const source = read(path)
    return /from ['"]@\/components\/Header['"]/.test(source) || /<Header\b/.test(source)
  })

  assert.deepEqual(offenders, [])
})

test('primary resource cards keep actions on keyboard-native controls', () => {
  const cardFiles = [
    'src/components/PromptCard.tsx',
    'src/components/FolderCard.tsx',
    'src/components/UnifiedFolderCard.tsx',
    'src/app/public-folders/page.tsx',
    'src/app/public-folders/[id]/page.tsx',
    'src/app/admin/page.tsx',
  ]

  for (const path of cardFiles) {
    const clickableCards = openingTags(read(path), 'Card').filter(tag => /onClick=/.test(tag))
    assert.deepEqual(clickableCards, [], `${path} must not use a clickable Card with nested controls`)
  }

  const promptCard = read('src/components/PromptCard.tsx')
  const openPromptButton = openingTags(promptCard, 'button').find(tag => tag.includes('aria-label={copy.openPrompt(prompt.title)}'))
  assert.ok(openPromptButton, 'PromptCard title must be a named native button')
  assert.match(openPromptButton, /type="button"/)
  assert.match(promptCard, /badgeVariants\(\{ variant \}\)/)
  assert.doesNotMatch(promptCard, /role=\{onClick \? 'button'/)

  const editor = read('src/components/PromptEditor/NormalEditor.tsx')
  assert.doesNotMatch(editor, /<CardHeader\b[^>]*onClick=/s)
  assert.match(editor, /aria-expanded=\{showTips\}/)
  assert.match(editor, /aria-pressed=\{selectedTemplate === template\.id\}/)
})

test('remaining clickable Cards implement complete keyboard button semantics', () => {
  for (const path of ['src/components/StatsCards.tsx', 'src/components/PromptEditor/index.tsx']) {
    for (const tag of openingTags(read(path), 'Card').filter(value => /onClick=/.test(value))) {
      assert.match(tag, /onKeyDown=/, `${path} clickable Card is missing keyboard activation`)
      assert.match(tag, /role="button"/, `${path} clickable Card is missing button semantics`)
      assert.match(tag, /tabIndex=\{0\}/, `${path} clickable Card is not focusable`)
    }
  }
})

test('dialogs and global fallback pages have accessible names and landmarks', () => {
  for (const path of sourceFiles('src')) {
    const source = read(path)
    const dialogCount = (source.match(/<DialogContent\b/g) ?? []).length
    const titleCount = (source.match(/<DialogTitle\b/g) ?? []).length
    assert.ok(titleCount >= dialogCount, `${path} has DialogContent without a DialogTitle`)
  }

  for (const path of ['src/app/error.tsx', 'src/app/global-error.tsx', 'src/app/not-found.tsx']) {
    const source = read(path)
    assert.match(source, /<main\b/, `${path} is missing a main landmark`)
    assert.match(source, /<h1\b/, `${path} is missing a level-one heading`)
  }

  const search = read('src/components/GlobalSearch.tsx')
  assert.match(search, /role="dialog"/)
  assert.match(search, /aria-modal="true"/)
  assert.match(search, /aria-labelledby="global-search-title"/)
  assert.match(search, /triggerRef\.current\?\.focus\(\)/)
})

test('badges and inline icons are not used as pointer-only controls', () => {
  for (const path of sourceFiles('src')) {
    const source = read(path)
    assert.doesNotMatch(source, /<Badge\b[^>]*onClick=/s, `${path} has a pointer-only Badge`)
    assert.doesNotMatch(source, /<(?:X|Trash2|Eye|ArrowUp)\b[^>]*onClick=/s, `${path} has a pointer-only icon`)
  }
})

test('icon-only buttons provide an accessible name', () => {
  const offenders = []

  for (const path of sourceFiles('src')) {
    const source = read(path)
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const iconNames = new Set()

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'lucide-react') continue
      const bindings = statement.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      for (const element of bindings.elements) iconNames.add(element.name.text)
    }

    function visit(node) {
      if (ts.isJsxElement(node)) {
        const tagName = node.openingElement.tagName.getText()
        if (tagName === 'Button' || tagName === 'button') {
          const namedByAttribute = hasAttribute(
            node.openingElement.attributes,
            new Set(['aria-label', 'aria-labelledby', 'title'])
          )
          if (!namedByAttribute && !hasAccessibleContent(node.children, iconNames)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
            offenders.push(`${path}:${line}`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  assert.deepEqual(offenders, [], `icon-only buttons need aria-label: ${offenders.join(', ')}`)
})

test('switches, checkboxes, and radio controls have programmatic labels', () => {
  const offenders = []

  for (const path of sourceFiles('src')) {
    const source = read(path)
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    function visit(node) {
      if (ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText()
        const type = stringAttribute(node.attributes, 'type')
        const isChoiceInput = tagName === 'input' && (type === 'checkbox' || type === 'radio')

        if (tagName === 'Switch' || isChoiceInput) {
          const directlyNamed = hasAttribute(node.attributes, new Set(['aria-label', 'aria-labelledby']))
          const id = stringAttribute(node.attributes, 'id')
          const associatedById = id !== null && new RegExp(`htmlFor=["']${id}["']`).test(source)
          let parent = node.parent
          let wrappedByLabel = false

          while (parent && !ts.isSourceFile(parent)) {
            if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText() === 'label') {
              wrappedByLabel = true
              break
            }
            parent = parent.parent
          }

          if (!directlyNamed && !associatedById && !wrappedByLabel) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
            offenders.push(`${path}:${line}`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  assert.deepEqual(offenders, [], `unlabelled choice controls: ${offenders.join(', ')}`)
})
