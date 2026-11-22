// A minimal, deterministic .xlsx writer: one sheet, strings, numbers and dates.
// Enough for targets.xlsx (PLAN.md §6a) without a spreadsheet dependency.
import { strToU8, zipSync } from 'fflate'

export type Cell = string | number | { date: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const column = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : column(Math.floor(i / 26) - 1) + column(i % 26))

/** Excel date serial (days since 1899-12-30) of an ISO date. */
export const excelSerial = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000

function cellXml(value: Cell, ref: string): string {
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
  if (typeof value === 'string') return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`
  return `<c r="${ref}" s="1"><v>${excelSerial(value.date)}</v></c>`
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml'

export function writeXlsx(sheetName: string, rows: Cell[][]): Uint8Array {
  const sheetData = rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(v, `${column(c)}${r + 1}`)).join('')}</row>`)
    .join('')
  const files: Record<string, string> = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${CT}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    // Style 1 is the built-in short date format (numFmtId 14).
    'xl/styles.xml': `${XML}<styleSheet xmlns="${MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `${XML}<worksheet xmlns="${MAIN}"><sheetData>${sheetData}</sheetData></worksheet>`,
  }
  // A fixed mtime keeps the bytes identical between runs. Zip stores local
  // time, so build the date from local fields: the same bytes in every time zone.
  const mtime = new Date(2026, 0, 1)
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, [strToU8(text), { mtime }]])), { level: 6 })
}
