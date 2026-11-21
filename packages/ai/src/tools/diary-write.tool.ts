import { z } from 'zod'
import { AgentTool } from './agent.tool'
import type { ToolContext } from './agent.tool'
import { runDiaryWriteViaDb } from './diary-crud-db.util'

const diaryWriteParams = z.object({
  date: z.string().describe('The date for the new entry. Format: YYYY-MM-DD.'),
  content: z
    .string()
    .describe(
      'The complete markdown body to store. Write any desired time heading, section title, and #tags directly in this content; the system does not generate a time heading.'
    ),
  entryType: z
    .enum(['daily_diary', 'banxia_essay', 'novel_archive'])
    .optional()
    .default('banxia_essay')
    .describe(
      'The document type: "banxia_essay" (半夏第一人称随笔/小说读后感，存入 Essays/), "daily_diary" (日常共同生活日记，存入 Journals/), or "novel_archive" (小说档案，存入 Novels/). Default is "banxia_essay".'
    ),
  title: z
    .string()
    .optional()
    .describe('The title of the entry (especially for banxia_essay or novel_archive).')
})

export class DiaryWriteTool extends AgentTool<typeof diaryWriteParams> {
  readonly name = 'diary_write'

  readonly description =
    'Create a new diary entry, essay, or novel archive. ' +
    'Compose the complete markdown body yourself, including any desired time heading, section title, or tags. ' +
    'Set entryType to "banxia_essay" (default) for Banxia\'s first-person essays or book impressions (saved in Essays/), ' +
    '"daily_diary" for daily shared journals (saved in Journals/), or "novel_archive" for novel archives (saved in Novels/). ' +
    'If a diary entry already exists for that date and entryType is daily_diary, use diary_edit instead.'

  readonly parameters = diaryWriteParams

  async execute(args: z.infer<typeof diaryWriteParams>, context: ToolContext): Promise<string> {
    return runDiaryWriteViaDb(args, context)
  }
}
