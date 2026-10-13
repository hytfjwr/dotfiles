import type { Elements } from 'claude-code'

import { isRowA } from './layout'
import type { BandHandlers, BandLayout, RowA, Seg } from './layout'

// the element table of the terminal, cut to what the band draws (F6: the view gets the table, never `$`)
export type CoreTable = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

// one run of text in its style: a colour (a raw hex), dim, bold
function Run({ table, s }: { table: CoreTable; s: Seg }) {
  const { Text } = table
  return (
    <Text {...(s.color ? { color: s.color } : {})} {...(s.dim ? { dimColor: true } : {})} {...(s.bold ? { bold: true } : {})} {...(s.bg ? { backgroundColor: s.bg } : {})}>
      {s.text}
    </Text>
  )
}

// a line of runs: truncated, never wrapped, so a row stays one row
function Line({ table, segs, indent = 0 }: { table: CoreTable; segs: readonly Seg[]; indent?: number }) {
  const { Text } = table
  return (
    <Text wrap="truncate">
      {indent > 0 ? ' '.repeat(indent) : ''}
      {segs.map(s => Run({ table, s }))}
    </Text>
  )
}

// glyph, title, a spacer that pushes the rest to the right, the track, the percentage, the columns, close
function BarRow({ table, row, handlers }: { table: CoreTable; row: RowA; handlers: BandHandlers }) {
  const { Box, Text, Button } = table
  return (
    <Box key={`bar-${row.barId}`} flexDirection="row" gap={1}>
      {Run({ table, s: row.glyph })}
      {Array.isArray(row.title) ? <Text wrap="truncate">{row.title.map(s => Run({ table, s }))}</Text> : <Text wrap="truncate">{row.title.text}</Text>}
      <Box flexGrow={1} />
      {row.track ? <Text>{row.track.map(s => Run({ table, s }))}</Text> : null}
      {Run({ table, s: row.pct })}
      {row.extras.map(s => Run({ table, s }))}
      {row.close ? <Button key={`hud-close-${row.barId}`} plain dimColor label="✕" onPress={() => handlers.close(row.barId)} /> : null}
    </Box>
  )
}

// the layout as elements: Box, Text and Button only; colours are raw hex, which every terminal Text takes (V3)
export function renderTerminalBand(table: CoreTable, layout: BandLayout, handlers: BandHandlers) {
  const { Box } = table
  return layout.rows.map(row =>
    isRowA(row) ? (
      BarRow({ table, row, handlers })
    ) : (
      <Box key={row.key ?? `${row.kind}-${row.indent}`} flexDirection="row">
        {Line({ table, segs: row.segs, indent: row.indent })}
      </Box>
    ),
  )
}
