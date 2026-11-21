import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildExtractPrompt,
  parseJournalMarkdown,
  FileSyncServiceImpl,
  createNodeFileSystem
} from '@baishou/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

describe('BanXia Phase 1 Core Architecture Verification', () => {
  describe('1. Frontmatter Parsing', () => {
    it('should parse entryType, authorRole, title, and slug from Frontmatter', () => {
      const markdown = `---
title: 读完《笨蛋一生》的一些胡思乱想
entry_type: banxia_essay
author_role: assistant
slug: dumb-life-thoughts
tags:
  - 读书
  - 随笔
weather: cloudy
mood: Peaceful
---

芥川龙之介在最后写的那几句话，总让人觉得他比谁都清醒。
我和魂小小聊到这一段时，他却觉得芥川只是太疲惫了。`

      const parsed = parseJournalMarkdown(markdown, '2026-03-24')
      expect(parsed).not.toBeNull()
      expect(parsed?.entryType).toBe('banxia_essay')
      expect(parsed?.authorRole).toBe('assistant')
      expect(parsed?.title).toBe('读完《笨蛋一生》的一些胡思乱想')
      expect(parsed?.slug).toBe('dumb-life-thoughts')
      expect(parsed?.weather).toBe('cloudy')
      expect(parsed?.mood).toBe('Peaceful')
      expect(parsed?.tags).toEqual(['读书', '随笔'])
      expect(parsed?.content).toContain('芥川龙之介在最后写的那几句话')
    })

    it('should parse novel_archive frontmatter correctly', () => {
      const markdown = `---
title: 笨蛋一生
entry_type: novel_archive
author_role: user
slug: dumb-life
---

某个在雪夜里行走的无名之人。`

      const parsed = parseJournalMarkdown(markdown, '2026-03-24')
      expect(parsed).not.toBeNull()
      expect(parsed?.entryType).toBe('novel_archive')
      expect(parsed?.authorRole).toBe('user')
      expect(parsed?.title).toBe('笨蛋一生')
      expect(parsed?.slug).toBe('dumb-life')
    })
  })

  describe('2. Physical Storage Split (Journals vs Essays vs Novels)', () => {
    let baseDir: string
    let journalsRoot: string
    let service: FileSyncServiceImpl
    const fileSystem = createNodeFileSystem()

    beforeEach(() => {
      baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banxia-test-vault-'))
      journalsRoot = path.join(baseDir, 'Journals')
      fs.mkdirSync(journalsRoot, { recursive: true })
      service = new FileSyncServiceImpl(
        {
          getJournalsBaseDirectory: async () => journalsRoot
        } as any,
        fileSystem
      )
    })

    afterEach(() => {
      if (fs.existsSync(baseDir)) {
        fs.rmSync(baseDir, { recursive: true, force: true })
      }
    })

    it('should write daily_diary under Journals/{YYYY}/{MM}/{YYYY-MM-DD}.md', async () => {
      const diaryDate = new Date('2026-03-24T12:00:00Z')
      await service.writeJournal({
        date: diaryDate,
        content: '今天和魂小小散步。',
        entryType: 'daily_diary',
        authorRole: 'user'
      } as any)

      const expectedPath = path.join(journalsRoot, '2026', '03', '2026-03-24.md')
      expect(fs.existsSync(expectedPath)).toBe(true)

      const content = fs.readFileSync(expectedPath, 'utf8')
      expect(content).toContain('entry_type: daily_diary')
      expect(content).toContain('author_role: user')
      expect(content).toContain('今天和魂小小散步。')
    })

    it('should write banxia_essay under Essays/{slug_or_id}.md (isolated from Journals)', async () => {
      const diaryDate = new Date('2026-03-24T12:00:00Z')
      await service.writeJournal({
        date: diaryDate,
        title: '半夏的随笔',
        slug: 'essay_first',
        content: '画了一下午的线稿。',
        entryType: 'banxia_essay',
        authorRole: 'assistant'
      } as any)

      const expectedPath = path.join(baseDir, 'Essays', 'essay_first.md')
      expect(fs.existsSync(expectedPath)).toBe(true)

      const content = fs.readFileSync(expectedPath, 'utf8')
      expect(content).toContain('entry_type: banxia_essay')
      expect(content).toContain('author_role: assistant')
      expect(content).toContain('slug: essay_first')
      expect(content).toContain('画了一下午的线稿。')
    })

    it('should write novel_archive under Novels/{slug_or_id}.md', async () => {
      const diaryDate = new Date('2026-03-24T12:00:00Z')
      await service.writeJournal({
        date: diaryDate,
        title: '笨蛋一生第一章',
        slug: 'dumb_life_ch1',
        content: '第一章内容...',
        entryType: 'novel_archive',
        authorRole: 'user'
      } as any)

      const expectedPath = path.join(baseDir, 'Novels', 'dumb_life_ch1.md')
      expect(fs.existsSync(expectedPath)).toBe(true)

      const content = fs.readFileSync(expectedPath, 'utf8')
      expect(content).toContain('entry_type: novel_archive')
      expect(content).toContain('slug: dumb_life_ch1')
      expect(content).toContain('第一章内容...')
    })
  })

  describe('3. Dual-perspective Graph Extraction Prompt', () => {
    it('should output rule 7 mapping "我" to "半夏" when authorRole is assistant', () => {
      const prompt = buildExtractPrompt(
        '我和魂小小在讨论构图。',
        '2026-03-24',
        '魂小小',
        {
          authorRole: 'assistant',
          entryType: 'banxia_essay',
          assistantName: '半夏'
        }
      )

      expect(prompt.user).toContain('角色「半夏」以第一人称写下的私人随笔')
      expect(prompt.user).toContain('统一使用「半夏」作为 person 实体名')
      expect(prompt.user).toContain('文中提及的「魂小小」（或他）统一映射为实体「魂小小」')
      expect(prompt.user).toContain('严禁将「我」映射为用户！')
    })

    it('should output default user rule 7 when authorRole is user', () => {
      const prompt = buildExtractPrompt(
        '今天半夏帮我挑了一支画笔。',
        '2026-03-24',
        '魂小小',
        {
          authorRole: 'user',
          entryType: 'daily_diary',
          assistantName: '半夏'
        }
      )

      expect(prompt.user).toContain('禁止使用「日记的主人」「作者」「用户」等占位称呼')
      expect(prompt.user).toContain('统一使用自称「魂小小」作为 person 实体名')
      expect(prompt.user).not.toContain('严禁将「我」映射为用户！')
    })
  })
})
