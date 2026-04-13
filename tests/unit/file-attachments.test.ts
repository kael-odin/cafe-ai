import { describe, expect, it } from 'vitest'
import { prepareFileAttachments } from '../../src/main/services/agent/file-attachments'
import type { FileAttachment } from '../../src/main/services/agent/types'

function toBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

describe('file attachment preprocessing', () => {
  it('parses text-like files inline before sending to AI', async () => {
    const files: FileAttachment[] = [
      {
        id: 'txt-1',
        type: 'file',
        mediaType: 'text/plain',
        data: toBase64('hello txt'),
        name: 'a.txt',
      },
      {
        id: 'md-1',
        type: 'file',
        mediaType: 'text/markdown',
        data: toBase64('# title'),
        name: 'a.md',
      },
      {
        id: 'json-1',
        type: 'file',
        mediaType: 'application/json',
        data: toBase64('{"ok":true}'),
        name: 'a.json',
      },
      {
        id: 'csv-1',
        type: 'file',
        mediaType: 'text/csv',
        data: toBase64('name\nCafe'),
        name: 'a.csv',
      },
    ]

    const result = await prepareFileAttachments('space', 'conversation', files)

    expect(result).toBeDefined()
    expect(result?.every(file => file.parseStatus === 'parsed')).toBe(true)
    expect(result?.[0].extractedText).toContain('hello txt')
    expect(result?.[1].extractedText).toContain('# title')
    expect(result?.[2].extractedText).toContain('{"ok":true}')
    expect(result?.[3].extractedText).toContain('name')
  })

  it('marks pdf and docx files as pending MinerU parsing', async () => {
    const files: FileAttachment[] = [
      {
        id: 'pdf-1',
        type: 'file',
        mediaType: 'application/pdf',
        data: Buffer.from([0x25, 0x50, 0x44, 0x46]).toString('base64'),
        name: 'a.pdf',
      },
      {
        id: 'docx-1',
        type: 'file',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: Buffer.from('PK').toString('base64'),
        name: 'a.docx',
      },
    ]

    const result = await prepareFileAttachments('space', 'conversation', files)

    expect(result).toBeDefined()
    expect(result?.map(file => file.parseStatus)).toEqual(['pending', 'pending'])
  })
})
