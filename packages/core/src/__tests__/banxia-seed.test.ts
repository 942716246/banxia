import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  BanXiaSeedService,
  BANXIA_PRESET_ESSAYS,
  BANXIA_PRESET_NOVELS,
  createNodeFileSystem,
  parseJournalMarkdown
} from '@baishou/core'

describe('BanXiaSeedService - Preset Data Seeding Test', () => {
  let tempDir: string
  let mockShadowRepo: any
  let upsertedRecords: any[]

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banxia-seed-test-'))
    upsertedRecords = []
    mockShadowRepo = {
      findByFilePath: vi.fn(async (filePath: string) => {
        return upsertedRecords.find((r) => r.filePath === filePath) || null
      }),
      upsert: vi.fn(async (record: any) => {
        const idx = upsertedRecords.findIndex((r) => r.filePath === record.filePath)
        if (idx >= 0) {
          upsertedRecords[idx] = { ...upsertedRecords[idx], ...record }
        } else {
          upsertedRecords.push({ id: upsertedRecords.length + 1, ...record })
        }
      }),
      deleteById: vi.fn(async (id: number) => {
        const idx = upsertedRecords.findIndex((r) => r.id === id)
        if (idx >= 0) {
          upsertedRecords.splice(idx, 1)
        }
      })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should seed exactly 10 Banxia essays and 4 novel archives with verbatim content and match all slugs/keywords', async () => {
    const fileSystem = createNodeFileSystem()
    const seedService = new BanXiaSeedService(fileSystem, mockShadowRepo)

    const result = await seedService.seedPresets(tempDir, { force: false })

    expect(result.essaysImported).toBe(10)
    expect(result.novelsImported).toBe(4)
    expect(result.total).toBe(14)

    // 1. 验证 10 个随笔 slug 精确匹配
    const expectedEssaySlugs = [
      'essay-runta-and-murata',
      'essay-mori-kaoru',
      'essay-barcha-and-mucha',
      'essay-my-art-and-commissions',
      'essay-flawed-male-characters',
      'essay-music-tastes',
      'essay-favorite-anime',
      'essay-movies-and-dramas',
      'essay-gaming-habits',
      'essay-reading-2018-novels'
    ]
    expect(BANXIA_PRESET_ESSAYS.map((e) => e.slug)).toEqual(expectedEssaySlugs)

    // 2. 验证 4 个小说 slug 精确匹配
    const expectedNovelSlugs = [
      'novel-2018-weiye',
      'novel-2018-wuyishi',
      'novel-2018-bendanyisheng',
      'novel-2022-gelou'
    ]
    expect(BANXIA_PRESET_NOVELS.map((n) => n.slug)).toEqual(expectedNovelSlugs)

    // 3. 验证随笔目录和文件正文硬编码关键字
    const essaysDir = path.join(tempDir, 'Essays')
    expect(fs.existsSync(essaysDir)).toBe(true)
    const essayFiles = fs.readdirSync(essaysDir).sort()
    expect(essayFiles).toHaveLength(10)

    const allEssaysText = BANXIA_PRESET_ESSAYS.map((e) => e.content).join('\n')
    const essayKeywords = [
      'runta',
      '村田莲尔',
      '森薰',
      '焦茶',
      '青叶市子',
      '椎名林檎',
      '妖精森林的小不点',
      '绝区零'
    ]
    for (const kw of essayKeywords) {
      expect(allEssaysText).toContain(kw)
    }

    for (const doc of BANXIA_PRESET_ESSAYS) {
      const filePath = path.join(essaysDir, `${doc.slug}.md`)
      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = parseJournalMarkdown(content, doc.date)
      expect(parsed).not.toBeNull()
      expect(parsed?.entryType).toBe('banxia_essay')
      expect(parsed?.authorRole).toBe('assistant')
      expect(parsed?.title).toBe(doc.title)
      expect(parsed?.slug).toBe(doc.slug)
      expect(parsed?.content?.trim()).toBe(doc.content.trim())
    }

    // 4. 验证小说目录和文件正文硬编码关键字
    const novelsDir = path.join(tempDir, 'Novels')
    expect(fs.existsSync(novelsDir)).toBe(true)
    const novelFiles = fs.readdirSync(novelsDir).sort()
    expect(novelFiles).toHaveLength(4)

    const allNovelsText = BANXIA_PRESET_NOVELS.map((n) => n.content).join('\n')
    const novelKeywords = ['阿加莎·克里斯Q', '山鼠，咸煲', '那样没有灵魂']
    for (const kw of novelKeywords) {
      expect(allNovelsText).toContain(kw)
    }

    for (const doc of BANXIA_PRESET_NOVELS) {
      const filePath = path.join(novelsDir, `${doc.slug}.md`)
      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = parseJournalMarkdown(content, doc.date)
      expect(parsed).not.toBeNull()
      expect(parsed?.entryType).toBe('novel_archive')
      expect(parsed?.authorRole).toBe('user')
      expect(parsed?.title).toBe(doc.title)
      expect(parsed?.slug).toBe(doc.slug)
      expect(parsed?.content?.trim()).toBe(doc.content.trim())
    }

    // 5. 验证 shadowRepo 写入了 14 条索引记录
    expect(upsertedRecords).toHaveLength(14)
    expect(upsertedRecords.filter((r) => r.entryType === 'banxia_essay')).toHaveLength(10)
    expect(upsertedRecords.filter((r) => r.entryType === 'novel_archive')).toHaveLength(4)
  })

  it('should clean up obsolete non-whitelisted files from disk and shadow index', async () => {
    const fileSystem = createNodeFileSystem()
    const seedService = new BanXiaSeedService(fileSystem, mockShadowRepo)

    const essaysDir = path.join(tempDir, 'Essays')
    const novelsDir = path.join(tempDir, 'Novels')
    fs.mkdirSync(essaysDir, { recursive: true })
    fs.mkdirSync(novelsDir, { recursive: true })

    // 创建旧的伪造随笔与小说文件
    const fakeEssayPath = path.join(essaysDir, 'essay-fake-palatte.md')
    const fakeNovelPath = path.join(novelsDir, 'novel-fake-story.md')
    fs.writeFileSync(fakeEssayPath, 'fake essay content', 'utf8')
    fs.writeFileSync(fakeNovelPath, 'fake novel content', 'utf8')

    // 在 shadowRepo 注册这两条旧记录
    upsertedRecords.push(
      { id: 991, filePath: 'Essays/essay-fake-palatte.md', slug: 'essay-fake-palatte' },
      { id: 992, filePath: 'Novels/novel-fake-story.md', slug: 'novel-fake-story' }
    )

    expect(fs.existsSync(fakeEssayPath)).toBe(true)
    expect(fs.existsSync(fakeNovelPath)).toBe(true)
    expect(upsertedRecords).toHaveLength(2)

    // 执行导入与清理
    const result = await seedService.seedPresets(tempDir, { force: false })

    expect(result.cleanedObsoleteCount).toBe(2)
    expect(fs.existsSync(fakeEssayPath)).toBe(false)
    expect(fs.existsSync(fakeNovelPath)).toBe(false)
    expect(mockShadowRepo.deleteById).toHaveBeenCalledWith(991)
    expect(mockShadowRepo.deleteById).toHaveBeenCalledWith(992)
    expect(upsertedRecords.find((r) => r.id === 991)).toBeUndefined()
    expect(upsertedRecords.find((r) => r.id === 992)).toBeUndefined()
    expect(upsertedRecords).toHaveLength(14)
  })

  it('should be idempotent on second run without force', async () => {
    const fileSystem = createNodeFileSystem()
    const seedService = new BanXiaSeedService(fileSystem, mockShadowRepo)

    // 第一次导入
    const firstResult = await seedService.seedPresets(tempDir, { force: false })
    expect(firstResult.total).toBe(14)

    // 第二次导入，全部跳过
    const secondResult = await seedService.seedPresets(tempDir, { force: false })
    expect(secondResult.essaysImported).toBe(0)
    expect(secondResult.novelsImported).toBe(0)
    expect(secondResult.total).toBe(0)
    expect(upsertedRecords).toHaveLength(14)
  })

  it('should overwrite all 14 files and update shadow index when force is true', async () => {
    const fileSystem = createNodeFileSystem()
    const seedService = new BanXiaSeedService(fileSystem, mockShadowRepo)

    await seedService.seedPresets(tempDir, { force: false })
    expect(upsertedRecords).toHaveLength(14)

    // 强制重新导入
    const forceResult = await seedService.seedPresets(tempDir, { force: true })
    expect(forceResult.essaysImported).toBe(10)
    expect(forceResult.novelsImported).toBe(4)
    expect(forceResult.total).toBe(14)
    expect(upsertedRecords).toHaveLength(14)
  })
})
