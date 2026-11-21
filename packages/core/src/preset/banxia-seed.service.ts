import * as path from 'path'
import { logger } from '@baishou/shared'
import type { IFileSystem } from '../fs/file-system.types'
import { md5Hex } from '../fs/md5'
import type { ShadowIndexRepository } from '@baishou/database'
import { BANXIA_PRESET_ESSAYS, BANXIA_PRESET_NOVELS, type BanXiaPresetDoc } from './banxia-preset-data'

export interface BanXiaSeedResult {
  essaysImported: number
  novelsImported: number
  total: number
  cleanedObsoleteCount?: number
}

export const ALLOWED_ESSAY_SLUGS = new Set(BANXIA_PRESET_ESSAYS.map((d) => d.slug))
export const ALLOWED_NOVEL_SLUGS = new Set(BANXIA_PRESET_NOVELS.map((d) => d.slug))

/**
 * 半夏预置数据初始化服务
 *
 * 幂等地将 10 篇半夏随笔与 4 篇小说档案写入磁盘（SSOT）并录入影子索引表；
 * 同时清理不在 14 篇白名单内的旧伪造文件。
 */
export class BanXiaSeedService {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly shadowRepo: ShadowIndexRepository
  ) {}

  public async seedPresets(vaultDir: string, options?: { force?: boolean }): Promise<BanXiaSeedResult> {
    const essaysDir = path.join(vaultDir, 'Essays')
    const novelsDir = path.join(vaultDir, 'Novels')

    if (!(await this.fileSystem.exists(essaysDir))) {
      await this.fileSystem.mkdir(essaysDir, { recursive: true })
    }
    if (!(await this.fileSystem.exists(novelsDir))) {
      await this.fileSystem.mkdir(novelsDir, { recursive: true })
    }

    let cleanedObsoleteCount = 0

    // 1. 清理不在白名单内的旧随笔文件及影子索引
    try {
      const essayFiles = await this.fileSystem.readdir(essaysDir)
      for (const file of essayFiles) {
        if (file.endsWith('.md')) {
          const slug = file.slice(0, -3)
          if (!ALLOWED_ESSAY_SLUGS.has(slug)) {
            const filePath = path.join(essaysDir, file)
            await this.fileSystem.unlink(filePath)
            const relPath = `Essays/${file}`
            const existing = await this.shadowRepo.findByFilePath(relPath)
            if (existing?.id) {
              await this.shadowRepo.deleteById(existing.id)
            }
            cleanedObsoleteCount++
            logger.info(`[BanXiaSeedService] 清理旧随笔文件及影子索引: ${relPath}`)
          }
        }
      }
    } catch (e: any) {
      logger.warn('[BanXiaSeedService] 扫描清理旧随笔失败:', e)
    }

    // 2. 清理不在白名单内的旧小说档案文件及影子索引
    try {
      const novelFiles = await this.fileSystem.readdir(novelsDir)
      for (const file of novelFiles) {
        if (file.endsWith('.md')) {
          const slug = file.slice(0, -3)
          if (!ALLOWED_NOVEL_SLUGS.has(slug)) {
            const filePath = path.join(novelsDir, file)
            await this.fileSystem.unlink(filePath)
            const relPath = `Novels/${file}`
            const existing = await this.shadowRepo.findByFilePath(relPath)
            if (existing?.id) {
              await this.shadowRepo.deleteById(existing.id)
            }
            cleanedObsoleteCount++
            logger.info(`[BanXiaSeedService] 清理旧小说文件及影子索引: ${relPath}`)
          }
        }
      }
    } catch (e: any) {
      logger.warn('[BanXiaSeedService] 扫描清理旧小说失败:', e)
    }

    let essaysImported = 0
    let novelsImported = 0

    // 3. 导入 10 篇半夏随笔
    for (const doc of BANXIA_PRESET_ESSAYS) {
      const imported = await this.seedSingleDoc(essaysDir, 'Essays', doc, options?.force)
      if (imported) essaysImported++
    }

    // 4. 导入 4 篇小说档案
    for (const doc of BANXIA_PRESET_NOVELS) {
      const imported = await this.seedSingleDoc(novelsDir, 'Novels', doc, options?.force)
      if (imported) novelsImported++
    }

    logger.info(
      `[BanXiaSeedService] 预置数据导入完成: 随笔 ${essaysImported}/${BANXIA_PRESET_ESSAYS.length}, 小说 ${novelsImported}/${BANXIA_PRESET_NOVELS.length}, 清理旧文件 ${cleanedObsoleteCount}`
    )

    return {
      essaysImported,
      novelsImported,
      total: essaysImported + novelsImported,
      cleanedObsoleteCount
    }
  }

  private async seedSingleDoc(
    targetDir: string,
    relativeDir: string,
    doc: BanXiaPresetDoc,
    force = false
  ): Promise<boolean> {
    const filename = `${doc.slug}.md`
    const filePath = path.join(targetDir, filename)
    const relativeFilePath = `${relativeDir}/${filename}`

    const exists = await this.fileSystem.exists(filePath)
    if (exists && !force) {
      // 检查影子索引是否已包含，未包含则补全索引
      const existing = await this.shadowRepo.findByFilePath(relativeFilePath)
      if (existing) {
        return false
      }
    }

    const markdown = [
      '---',
      `date: ${doc.date}`,
      `entry_type: ${doc.entryType}`,
      `author_role: ${doc.authorRole}`,
      `title: ${JSON.stringify(doc.title)}`,
      `slug: ${doc.slug}`,
      '---',
      '',
      doc.content.trim(),
      ''
    ].join('\n')

    await this.fileSystem.writeFile(filePath, markdown, 'utf8')
    const hash = md5Hex(markdown)
    const nowIso = new Date().toISOString()
    const docDateIso = `${doc.date}T00:00:00.000Z`

    await this.shadowRepo.upsert({
      filePath: relativeFilePath,
      date: docDateIso,
      createdAt: docDateIso,
      updatedAt: nowIso,
      contentHash: hash,
      rawContent: doc.content.trim(),
      tags: doc.entryType === 'banxia_essay' ? '随笔,半夏' : '小说,档案',
      entryType: doc.entryType,
      authorRole: doc.authorRole,
      title: doc.title,
      slug: doc.slug,
      isFavorite: false,
      hasMedia: false
    })

    return true
  }
}
